/**
 * PhantomDeeplinkProvider — React context for Phantom deeplink wallet connection.
 * Used on mobile Chrome where the standard wallet adapter can't connect.
 * Provides: publicKey, connected, connect(), disconnect(), signTransaction()
 */
import { createContext, useContext, useState, useEffect, useCallback, FC, ReactNode } from 'react';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  phantomConnect,
  phantomDisconnect,
  handleConnectCallback,
  handleSignCallback,
  getStoredSession,
  isPhantomCallback,
  phantomSignTransaction,
} from '../lib/phantom-deeplink';

interface PhantomDeeplinkState {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  connect: () => void;
  disconnect: () => void;
  signAndSendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>;
}

const PhantomDeeplinkContext = createContext<PhantomDeeplinkState>({
  publicKey: null,
  connected: false,
  connecting: false,
  connect: () => {},
  disconnect: () => {},
  signAndSendTransaction: async () => { throw new Error('Not connected'); },
});

export const usePhantomDeeplink = () => useContext(PhantomDeeplinkContext);

export const PhantomDeeplinkProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);

  // On mount: check for callback params OR restore saved session
  useEffect(() => {
    const url = new URL(window.location.href);
    const callbackType = isPhantomCallback(url.searchParams);

    if (callbackType === 'connect') {
      const result = handleConnectCallback(url.searchParams);
      if (result) {
        try {
          setPublicKey(new PublicKey(result.publicKey));
        } catch (e) {
          console.error('Invalid public key from Phantom:', e);
        }
      }
      // Clean up URL — remove phantom callback params
      url.searchParams.delete('phantom');
      url.searchParams.delete('phantom_encryption_public_key');
      url.searchParams.delete('nonce');
      url.searchParams.delete('data');
      url.searchParams.delete('errorCode');
      url.searchParams.delete('errorMessage');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
      return;
    }

    if (callbackType === 'sign') {
      const result = handleSignCallback(url.searchParams);
      if (result) {
        try {
          localStorage.setItem('phantom_dl_signed_tx', result.signedTransaction);
        } catch {}
      }
      // Clean up URL
      url.searchParams.delete('phantom');
      url.searchParams.delete('nonce');
      url.searchParams.delete('data');
      url.searchParams.delete('errorCode');
      url.searchParams.delete('errorMessage');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }

    // Try to restore saved session
    const saved = getStoredSession();
    if (saved) {
      try {
        setPublicKey(new PublicKey(saved.publicKey));
      } catch {}
    }
  }, []);

  const connect = useCallback(() => {
    setConnecting(true);
    phantomConnect();
    // Page will redirect — connecting state won't be seen until after redirect
  }, []);

  const disconnect = useCallback(() => {
    phantomDisconnect();
    setPublicKey(null);
  }, []);

  const signAndSendTransaction = useCallback(async (
    transaction: Transaction,
    connection: Connection
  ): Promise<string> => {
    if (!publicKey) throw new Error('Wallet not connected');

    // Serialize the transaction
    const serialized = transaction.serialize({ requireAllSignatures: false });
    const txB58 = bs58.encode(serialized);

    // Store the current page state so we can return to it
    const currentState = {
      tab: localStorage.getItem('solia_active_tab') || 'generate',
      timestamp: Date.now(),
    };
    localStorage.setItem('phantom_dl_pre_sign_state', JSON.stringify(currentState));

    // Redirect to Phantom for signing
    phantomSignTransaction(txB58);

    // This function won't resolve because the page redirects.
    // The signed transaction is handled on page reload via the callback URL.
    // We return a promise that never resolves (page will redirect).
    return new Promise(() => {});
  }, [publicKey]);

  return (
    <PhantomDeeplinkContext.Provider value={{
      publicKey,
      connected: !!publicKey,
      connecting,
      connect,
      disconnect,
      signAndSendTransaction,
    }}>
      {children}
    </PhantomDeeplinkContext.Provider>
  );
};
