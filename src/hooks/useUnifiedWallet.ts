/**
 * Unified wallet hook — combines @solana/wallet-adapter (desktop/in-app browser)
 * with Phantom deeplink protocol (mobile Chrome).
 * 
 * All components should use this instead of useWallet() directly.
 */
import { useWallet } from '@solana/wallet-adapter-react';
import { usePhantomDeeplink } from '../contexts/PhantomDeeplinkContext';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { useMemo, useCallback } from 'react';

export interface UnifiedWallet {
  publicKey: PublicKey | null;
  connected: boolean;
  /** sendTransaction compatible with @solana/wallet-adapter interface */
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
  /** True when connected via deeplink (not adapter) */
  isDeeplinkWallet: boolean;
}

const noopSendTransaction = async (): Promise<string> => {
  throw new Error('Wallet not connected');
};

export function useUnifiedWallet(): UnifiedWallet {
  const adapterWallet = useWallet();
  const deeplinkWallet = usePhantomDeeplink();

  // For deeplink wallet: wrap signAndSendTransaction to match sendTransaction interface
  const deeplinkSendTx = useCallback(async (tx: Transaction, connection: Connection): Promise<string> => {
    return deeplinkWallet.signAndSendTransaction(tx, connection);
  }, [deeplinkWallet.signAndSendTransaction]);

  return useMemo(() => {
    // Prefer adapter wallet (desktop, in-app browser)
    if (adapterWallet.publicKey) {
      return {
        publicKey: adapterWallet.publicKey,
        connected: true,
        sendTransaction: adapterWallet.sendTransaction,
        isDeeplinkWallet: false,
      };
    }

    // Fall back to deeplink wallet (mobile Chrome)
    if (deeplinkWallet.publicKey) {
      return {
        publicKey: deeplinkWallet.publicKey,
        connected: true,
        sendTransaction: deeplinkSendTx,
        isDeeplinkWallet: true,
      };
    }

    return {
      publicKey: null,
      connected: false,
      sendTransaction: noopSendTransaction,
      isDeeplinkWallet: false,
    };
  }, [adapterWallet.publicKey, adapterWallet.sendTransaction, deeplinkWallet.publicKey, deeplinkSendTx]);
}
