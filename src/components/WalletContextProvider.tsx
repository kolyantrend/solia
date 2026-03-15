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

            // MWA for all Android — gives system wallet chooser (Phantom / Solana Mobile Wallet)
            // Same approach as jup.ag: WalletMultiButton + MWA on Android Chrome.
            const isAndroid = /Android/i.test(navigator.userAgent);
            if (isAndroid) {
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

    // Disable autoConnect on Android Chrome — prevents MWA bounce-back loop.
    // When MWA redirects to Phantom and back, autoConnect re-triggers MWA → infinite loop.
    // jup.ag also uses autoConnect: false. Desktop & in-app browsers still auto-connect.
    const isAndroidChrome = useMemo(() => {
        if (typeof window === 'undefined') return false;
        const ua = navigator.userAgent;
        return /Android/i.test(ua) && !('solana' in window) && !('phantom' in window);
    }, []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={!isAndroidChrome}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
