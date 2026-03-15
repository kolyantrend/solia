/**
 * Real SPL token transfer utilities for SKR payments on Solana mainnet.
 */
import {
  Connection,
  PublicKey,
  Transaction,
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
 * Check if a token account exists for the given owner.
 */
async function ensureTokenAccount(
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
): Promise<{ ata: PublicKey; instruction: ReturnType<typeof createAssociatedTokenAccountInstruction> | null }> {
  const ata = getAssociatedTokenAddressSync(SKR_MINT, owner, true);
  try {
    await getAccount(connection, ata);
    return { ata, instruction: null };
  } catch {
    // Account doesn't exist — need to create it
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
  /** wallet.signTransaction from @solana/wallet-adapter-react */
  signTransaction: (tx: Transaction) => Promise<Transaction>;
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
  signTransaction,
  connection: externalConnection,
}: TransferSkrParams): Promise<string> {
  return transferSkrSplit({
    fromWallet,
    recipients: [{ wallet: toWallet, amount }],
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
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  connection?: Connection;
}

/**
 * Build and send a single atomic transaction with multiple SKR transfer instructions.
 * Used for referral splits: e.g. 80% treasury + 20% referrer in one tx.
 * All transfers succeed or all fail — atomic guarantee by Solana runtime.
 */
export async function transferSkrSplit({
  fromWallet,
  recipients,
  signTransaction,
  connection: externalConnection,
}: TransferSkrSplitParams): Promise<string> {
  const connection = externalConnection || getConnection();

  // Source ATA (must exist — user must hold SKR)
  const sourceAta = getAssociatedTokenAddressSync(SKR_MINT, fromWallet, true);

  const tx = new Transaction();

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
      tx.add(createAtaIx);
    }

    tx.add(
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

  tx.feePayer = fromWallet;

  // Explicitly set blockhash — required for mobile wallets (Phantom in-app)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  // Sign manually then send raw — mobile Phantom doesn't work with sendTransaction
  const signed = await signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());

  // Confirm with timeout to prevent infinite retry loops
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const confirmPromise = connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Confirmation timeout')), 30000)
    );
    await Promise.race([confirmPromise, timeoutPromise]);
  } catch (confirmErr: any) {
    // If confirmation times out, check if the tx actually succeeded
    const status = await connection.getSignatureStatus(signature);
    if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
      return signature;
    }
    console.warn('Confirmation uncertain, tx may still land:', signature);
  }

  return signature;
}
