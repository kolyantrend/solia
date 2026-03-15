import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
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
        _phantomAdapter?: PhantomWalletAdapter;
    }
}

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const endpoint = useMemo(
        () => import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com',
        [],
    );

    const wallets = useMemo(
        () => {
            if (typeof window !== 'undefined') {
                if (!window._solflareAdapter) window._solflareAdapter = new SolflareWalletAdapter();
                if (!window._phantomAdapter) window._phantomAdapter = new PhantomWalletAdapter();
                
                // On mobile, if wallet is already injected (in-app browser), use it
                const hasWallet = 'solana' in window || 'phantom' in window;
                
                if (hasWallet) {
                    return [window._phantomAdapter, window._solflareAdapter];
                }
                
                // Desktop: Phantom/Solflare browser extensions auto-register
                return [
                    new SolanaMobileWalletAdapter({
                        addressSelector: createDefaultAddressSelector(),
                        appIdentity: { name: 'Solia', icon: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/Logo%20New.png', uri: 'https://solia.live' },
                        authorizationResultCache: createDefaultAuthorizationResultCache(),
                        cluster: 'mainnet-beta',
                        onWalletNotFound: createDefaultWalletNotFoundHandler(),
                    }),
                    window._phantomAdapter,
                    window._solflareAdapter,
                ];
            }
            return [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
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
