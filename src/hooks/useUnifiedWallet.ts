/**
 * Unified wallet hook — thin wrapper around @solana/wallet-adapter-react useWallet.
 * Jupiter Unified Wallet Kit handles all platforms (MWA, Wallet Standard, etc.)
 * 
 * All components should use this instead of useWallet() directly.
 */
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { useMemo } from 'react';

export interface UnifiedWallet {
  publicKey: PublicKey | null;
  connected: boolean;
  /** sendTransaction compatible with @solana/wallet-adapter interface */
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
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
  }), [wallet.publicKey, wallet.connected, wallet.sendTransaction]);
}
