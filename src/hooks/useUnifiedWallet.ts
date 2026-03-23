/**
 * Unified wallet hook — thin wrapper around wallet-adapter.
 * MWA (Mobile Wallet Adapter) handles Seeker and other native wallets.
 * Jupiter Unified Wallet Kit handles web wallets.
 *
 * All components should use this instead of useWallet() directly.
 */
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, VersionedTransaction, Connection } from '@solana/web3.js';
import { useMemo } from 'react';

export interface UnifiedWallet {
  publicKey: PublicKey | null;
  connected: boolean;
  /** sendTransaction compatible with @solana/wallet-adapter interface (supports V0) */
  sendTransaction: (tx: Transaction | VersionedTransaction, connection: Connection, options?: any) => Promise<string>;
  /** signTransaction — signs without sending (used for MWA Phantom fallback) */
  signTransaction: ((tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined;
  /** Name of the connected wallet adapter (e.g. "Phantom", "Mobile Wallet Adapter") */
  walletName: string | null;
}

const noopSendTransaction = async (): Promise<string> => {
  throw new Error('Wallet not connected');
};

export function useUnifiedWallet(): UnifiedWallet {
  const wallet = useWallet();

  return useMemo(() => ({
    publicKey: wallet.publicKey,
    connected: wallet.connected,
    sendTransaction: wallet.publicKey ? wallet.sendTransaction : noopSendTransaction,
    signTransaction: wallet.signTransaction ?? undefined,
    walletName: wallet.wallet?.adapter?.name ?? null,
  }), [wallet.publicKey, wallet.connected, wallet.sendTransaction, wallet.signTransaction, wallet.wallet?.adapter?.name]);
}
