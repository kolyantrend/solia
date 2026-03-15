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

            // MWA only for native Solana Mobile dApp Store (not mobile web browsers)
            // On mobile web, MWA causes redirect-back issues (WebSocket fails)
            // Phantom/Solflare auto-register via Wallet Standard in their in-app browsers
            const isNativeMobile = typeof (window as any).__solanaMobile !== 'undefined';
            if (isNativeMobile) {
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
