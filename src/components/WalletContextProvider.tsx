import { FC, ReactNode, useMemo } from 'react';
import { UnifiedWalletProvider } from '@jup-ag/wallet-adapter';
import { SolanaMobileWalletAdapter } from '@solana-mobile/wallet-adapter-mobile';
import { isNative } from '../lib/platform';

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const endpoint = useMemo(
        () => import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com',
        [],
    );

    // On native (Capacitor), explicitly create the MWA adapter so wallet connection works in WebView
    const wallets = useMemo(() => {
        if (isNative) {
            return [
                new SolanaMobileWalletAdapter({
                    appIdentity: {
                        name: 'Solia',
                        uri: 'https://solia.live',
                        icon: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/Logo%20New.png',
                    },
                    cluster: 'mainnet-beta',
                } as any),
            ];
        }
        return []; // Web: Jupiter auto-detects via Wallet Standard + MWA
    }, []);

    return (
        <UnifiedWalletProvider
            wallets={wallets}
            config={{
                autoConnect: true,
                env: 'mainnet-beta',
                metadata: {
                    name: 'Solia',
                    description: 'AI-powered meme generator on Solana',
                    url: 'https://solia.live',
                    iconUrls: ['https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/Logo%20New.png'],
                },
                walletlistExplanation: {
                    href: 'https://solia.live',
                },
            }}
        >
            {children}
        </UnifiedWalletProvider>
    );
};
