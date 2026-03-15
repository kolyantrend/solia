import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { 
    SolanaMobileWalletAdapter, 
    createDefaultAddressSelector, 
    createDefaultAuthorizationResultCache, 
    createDefaultWalletNotFoundHandler 
} from '@solana-mobile/wallet-adapter-mobile';
import '@solana/wallet-adapter-react-ui/styles.css';

// Prevent duplicate adapter instantiations on HMR
declare global {
    interface Window {
        _solflareAdapter?: SolflareWalletAdapter;
    }
}

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const endpoint = useMemo(
        () => import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com',
        [],
    );

    const wallets = useMemo(
        () => {
            if (typeof window === 'undefined') {
                return [new SolflareWalletAdapter()];
            }

            if (!window._solflareAdapter) {
                window._solflareAdapter = new SolflareWalletAdapter();
            }

            const adapters: any[] = [window._solflareAdapter];

            // MWA only for Seeker / Solana Mobile dApp Store (NOT mobile web browsers).
            // On mobile Chrome, MWA WebSocket drops when switching to Phantom app → instant bounce-back.
            // Phantom/Solflare auto-register via Wallet Standard in their in-app browsers.
            const isSolanaMobile = typeof (window as any).__solanaMobile !== 'undefined';
            if (isSolanaMobile) {
                adapters.unshift(
                    new SolanaMobileWalletAdapter({
                        addressSelector: createDefaultAddressSelector(),
                        appIdentity: { name: 'Solia', icon: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/Logo%20New.png', uri: 'https://solia.live' },
                        authorizationResultCache: createDefaultAuthorizationResultCache(),
                        cluster: 'mainnet-beta',
                        onWalletNotFound: createDefaultWalletNotFoundHandler(),
                    })
                );
            }

            return adapters;
        },
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
