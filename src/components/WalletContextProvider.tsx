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

// Prevent duplicate SolflareWalletAdapter instantiations on HMR
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

    // Phantom auto-registers as a Standard Wallet — no manual adapter needed
    const wallets = useMemo(
        () => {
            if (typeof window !== 'undefined') {
                if (!window._solflareAdapter) {
                    window._solflareAdapter = new SolflareWalletAdapter();
                }
                return [
                    new SolanaMobileWalletAdapter({
                        addressSelector: createDefaultAddressSelector(),
                        appIdentity: { name: 'Solia', icon: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/Logo%20New.png' },
                        authorizationResultCache: createDefaultAuthorizationResultCache(),
                        cluster: 'mainnet-beta',
                        onWalletNotFound: createDefaultWalletNotFoundHandler(),
                    }),
                    window._solflareAdapter,
                ];
            }
            return [
                new SolanaMobileWalletAdapter({
                    addressSelector: createDefaultAddressSelector(),
                    appIdentity: { name: 'Solia', icon: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/Logo%20New.png' },
                    authorizationResultCache: createDefaultAuthorizationResultCache(),
                    cluster: 'mainnet-beta',
                    onWalletNotFound: createDefaultWalletNotFoundHandler(),
                }),
                new SolflareWalletAdapter(),
            ];
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
