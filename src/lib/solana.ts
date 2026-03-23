/**
 * Real SPL token transfer utilities for SKR payments on Solana mainnet.
 */
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

export const SKR_MINT = new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
export const TREASURY_WALLET = new PublicKey('GqQ41MPh9b1HEt9V5FWnKZfPjdhjgnaPjPLCRcLsuprA');

const RPC_PRIMARY = (import.meta as any).env?.VITE_SOLANA_RPC_URL || '';
const RPC_FALLBACK = 'https://solana-rpc.publicnode.com';

function getConnection(): Connection {
  const url = RPC_PRIMARY || RPC_FALLBACK;
  return new Connection(url, 'confirmed');
}

function getFallbackConnection(): Connection {
  return new Connection(RPC_FALLBACK, 'confirmed');
}

const SKR_DECIMALS = 6;

function toRawAmount(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** SKR_DECIMALS));
}

/**
 * Custom error class for MWA timeout — views catch this to offer
 * a "Open in Phantom browser" fallback redirect.
 */
export class MwaTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MwaTimeoutError';
  }
}

/**
 * Detect if we are on mobile but NOT inside Phantom's in-app browser.
 * In this case MWA is being used, and Phantom MWA may fail for transactions.
 */
export function isMobileOutsidePhantom(): boolean {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isPhantomInApp = typeof window !== 'undefined' && (window as any).phantom?.solana?.isPhantom;
  return isMobile && !isPhantomInApp;
}

/**
 * Build a Phantom browse deeplink that opens our site inside Phantom's in-app browser.
 * Optionally includes a transaction intent in the URL hash for auto-resume.
 */
export function buildPhantomBrowseUrl(intent?: { action: string; [key: string]: any }): string {
  const base = window.location.origin + window.location.pathname;
  if (intent) {
    const encoded = encodeURIComponent(JSON.stringify(intent));
    const targetUrl = `${base}?phantom_intent=${encoded}`;
    return `https://phantom.app/ul/browse/${encodeURIComponent(targetUrl)}?ref=${encodeURIComponent(window.location.origin)}`;
  }
  return `https://phantom.app/ul/browse/${encodeURIComponent(base)}?ref=${encodeURIComponent(window.location.origin)}`;
}

/**
 * Check if a token account exists for the given owner.
 */
async function ensureTokenAccount(
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
): Promise<{ ata: PublicKey; instruction: ReturnType<typeof createAssociatedTokenAccountInstruction> | null }> {
  const ata = getAssociatedTokenAddressSync(SKR_MINT, owner, true);
  try {
    // Use getAccountInfo instead of getAccount to avoid treating network errors as missing accounts
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      console.log(`[SKR] ATA not found for ${owner.toBase58()}, adding create instruction`);
      const ix = createAssociatedTokenAccountInstruction(
        payer,
        ata,
        owner,
        SKR_MINT,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      return { ata, instruction: ix };
    }
    return { ata, instruction: null };
  } catch (err) {
    console.warn(`[SKR] Network error checking ATA for ${owner.toBase58()}, assuming it exists to prevent simulation failure`, err);
    return { ata, instruction: null };
  }
}

/**
 * Get the user's SKR token balance.
 */
export async function getSkrBalance(wallet: PublicKey): Promise<number> {
  try {
    const connection = getConnection();
    const ata = getAssociatedTokenAddressSync(SKR_MINT, wallet, true);
    const account = await getAccount(connection, ata);
    return Number(account.amount) / 10 ** SKR_DECIMALS;
  } catch {
    return 0;
  }
}

export interface TransferSkrParams {
  /** The sender wallet public key */
  fromWallet: PublicKey;
  /** The destination wallet public key (treasury or image owner) */
  toWallet: PublicKey;
  /** Amount in human-readable SKR (e.g. 17.4) */
  amount: number;
  /** wallet.sendTransaction from @solana/wallet-adapter-react */
  sendTransaction: (tx: Transaction | VersionedTransaction, connection: Connection, options?: any) => Promise<string>;
  /** Optional signTransaction — if provided, we try sign+rawSend first (better for MWA Phantom) */
  signTransaction?: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  /** Optional connection from useConnection(); falls back to default RPC */
  connection?: Connection;
}

/**
 * Build and send a real SKR SPL token transfer transaction.
 * Returns the transaction signature on success.
 * Throws on failure.
 */
export async function transferSkr({
  fromWallet,
  toWallet,
  amount,
  sendTransaction,
  signTransaction,
  connection: externalConnection,
}: TransferSkrParams): Promise<string> {
  return transferSkrSplit({
    fromWallet,
    recipients: [{ wallet: toWallet, amount }],
    sendTransaction,
    signTransaction,
    connection: externalConnection,
  });
}

/** Recipient for a split payment */
export interface SplitRecipient {
  wallet: PublicKey;
  amount: number; // human-readable SKR
}

export interface TransferSkrSplitParams {
  fromWallet: PublicKey;
  recipients: SplitRecipient[];
  sendTransaction: (tx: Transaction | VersionedTransaction, connection: Connection, options?: any) => Promise<string>;
  /** Optional signTransaction — if provided, we try sign+rawSend first (better for MWA Phantom) */
  signTransaction?: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  connection?: Connection;
}

/**
 * Build and send a single atomic transaction with multiple SKR transfer instructions.
 * Uses VersionedTransaction (V0) for better MWA Phantom Android compatibility.
 * Fresh blockhash is fetched immediately before sending.
 * All transfers succeed or all fail — atomic guarantee by Solana runtime.
 *
 * Strategy for mobile MWA:
 *  1. Try signTransaction + manual sendRawTransaction (works better with Phantom MWA)
 *  2. Fallback to sendTransaction (works with Seeker and desktop)
 *  3. On timeout, throw MwaTimeoutError so UI can offer Phantom browser redirect
 */
export async function transferSkrSplit({
  fromWallet,
  recipients,
  sendTransaction,
  signTransaction,
  connection: externalConnection,
}: TransferSkrSplitParams): Promise<string> {
  const connection = externalConnection || getConnection();

  console.log('[SKR] Building V0 transaction for', recipients.length, 'recipients from', fromWallet.toBase58());

  // Source ATA (must exist — user must hold SKR)
  const sourceAta = getAssociatedTokenAddressSync(SKR_MINT, fromWallet, true);

  const instructions: any[] = [];

  for (const recipient of recipients) {
    if (recipient.amount <= 0) continue;

    const rawAmount = toRawAmount(recipient.amount);

    // Destination ATA — create if it doesn't exist
    const { ata: destAta, instruction: createAtaIx } = await ensureTokenAccount(
      connection,
      fromWallet,
      recipient.wallet,
    );

    if (createAtaIx) {
      instructions.push(createAtaIx);
    }

    instructions.push(
      createTransferInstruction(
        sourceAta,
        destAta,
        fromWallet,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
  }

  // Get fresh blockhash RIGHT BEFORE building the transaction
  console.log('[SKR] Fetching fresh blockhash (confirmed)...');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  console.log('[SKR] Blockhash:', blockhash.slice(0, 12) + '...', 'blockHeight:', lastValidBlockHeight);

  // Build V0 VersionedTransaction
  const messageV0 = new TransactionMessage({
    payerKey: fromWallet,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const versionedTx = new VersionedTransaction(messageV0);

  console.log('[SKR] Simulating transaction before sending to wallet...');
  try {
    const simResult = await connection.simulateTransaction(versionedTx);
    console.log('[SKR] Simulation result:', simResult.value);
    if (simResult.value.err) {
      console.error('[SKR] Simulation failed!', simResult.value.err, simResult.value.logs);
      const errStr = JSON.stringify(simResult.value.err);
      // AccountNotFound on source ATA = user has no SKR tokens
      if (errStr.includes('AccountNotFound')) {
        throw new Error('You don\'t have SKR tokens. Buy SKR first to make this purchase.');
      }
      // InsufficientFunds = not enough SKR
      if (errStr.includes('InsufficientFunds') || errStr.includes('insufficient')) {
        throw new Error('Not enough SKR tokens for this purchase.');
      }
      throw new Error(`Transaction failed: ${errStr}`);
    }
  } catch (simError) {
    console.warn('[SKR] Pre-flight simulation check threw an error:', simError);
    // We throw here so the UI shows the error instead of silently dropping
    throw simError;
  }

  console.log('[SKR] Sending VersionedTransaction (V0) with', instructions.length, 'instructions...');

  const onMobile = isMobileOutsidePhantom();
  let signature: string;

  // ── Strategy 1: signTransaction + raw send (better for MWA Phantom) ──
  if (signTransaction && onMobile) {
    console.log('[SKR] Mobile MWA detected — trying signTransaction + sendRawTransaction first...');
    try {
      const signPromise = signTransaction(versionedTx);
      const signTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new MwaTimeoutError('Wallet did not respond to sign request within 30s')), 30000)
      );
      const signedTx = await Promise.race([signPromise, signTimeout]);

      // Send the signed transaction ourselves
      const serialized = (signedTx as VersionedTransaction).serialize();
      signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: true,
        maxRetries: 3,
      });
      console.log('[SKR] signTransaction + rawSend succeeded! Signature:', signature);
    } catch (signErr: any) {
      console.warn('[SKR] signTransaction approach failed:', signErr?.message);

      // If user rejected, don't try fallback
      const msg = signErr?.message || '';
      if (msg.includes('User rejected') || msg.includes('cancelled') || msg.includes('denied')) {
        throw new Error('Transaction was cancelled by user');
      }

      // If MWA timeout, throw MwaTimeoutError for the UI to handle
      if (signErr instanceof MwaTimeoutError) {
        throw signErr;
      }

      // Try fallback via sendTransaction
      console.log('[SKR] Falling back to sendTransaction...');
      try {
        const sendPromise = sendTransaction(versionedTx, connection, {
          skipPreflight: true,
          maxRetries: 3,
        });
        const sendTimeout = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new MwaTimeoutError('MWA sendTransaction timed out after 30s — Phantom may not support MWA signing')), 30000)
        );
        signature = await Promise.race([sendPromise, sendTimeout]);
        console.log('[SKR] sendTransaction fallback succeeded! Signature:', signature);
      } catch (sendErr2: any) {
        console.error('[SKR] Both sign and send failed:', sendErr2);
        const msg2 = sendErr2?.message || '';
        if (msg2.includes('User rejected') || msg2.includes('cancelled') || msg2.includes('denied')) {
          throw new Error('Transaction was cancelled by user');
        }
        if (sendErr2 instanceof MwaTimeoutError) {
          throw sendErr2;
        }
        throw new Error(`Transaction failed: ${msg2}`);
      }
    }
  } else {
    // ── Strategy 2: Standard sendTransaction (desktop / Phantom in-app / Seeker) ──
    try {
      const sendPromise = sendTransaction(versionedTx, connection, {
        skipPreflight: true,
        maxRetries: 3,
      });

      const timeoutMs = onMobile ? 30000 : 60000;
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(
          onMobile
            ? new MwaTimeoutError('MWA sendTransaction timed out — wallet may not support MWA signing')
            : new Error('sendTransaction timed out after 60s')
        ), timeoutMs)
      );

      signature = await Promise.race([sendPromise, timeoutPromise]);
      console.log('[SKR] Transaction sent! Signature:', signature);
    } catch (sendErr: any) {
      console.error('[SKR] sendTransaction FAILED:', sendErr);
      const msg = sendErr?.message || 'Transaction failed';
      if (msg.includes('User rejected') || msg.includes('cancelled') || msg.includes('denied')) {
        throw new Error('Transaction was cancelled by user');
      }
      if (sendErr instanceof MwaTimeoutError) {
        throw sendErr;
      }
      throw new Error(`Transaction failed: ${msg}`);
    }
  }

  // Confirm with timeout to prevent infinite retry loops
  try {
    const confirmPromise = connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Confirmation timeout')), 30000)
    );
    await Promise.race([confirmPromise, timeoutPromise]);
    console.log('[SKR] Transaction confirmed:', signature);
  } catch (confirmErr: any) {
    console.warn('[SKR] Confirmation uncertain:', confirmErr?.message);
    // If confirmation times out, check if the tx actually succeeded
    const status = await connection.getSignatureStatus(signature);
    if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
      console.log('[SKR] Transaction confirmed via status check:', signature);
      return signature;
    }
    console.warn('[SKR] Confirmation uncertain, tx may still land:', signature);
  }

  return signature;
}
