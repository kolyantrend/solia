import { FC, ReactNode, useMemo } from 'react';
import { UnifiedWalletProvider } from '@jup-ag/wallet-adapter';
import { SolanaMobileWalletAdapter, createDefaultAddressSelector, createDefaultAuthorizationResultCache, createDefaultWalletNotFoundHandler } from '@solana-mobile/wallet-adapter-mobile';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const wallets = useMemo(() => [
        new SolanaMobileWalletAdapter({
            addressSelector: createDefaultAddressSelector(),
            appIdentity: {
                name: 'Solia',
                uri: 'https://solia.live',
                icon: '/icon-192x192.png',
            },
            authorizationResultCache: createDefaultAuthorizationResultCache(),
            cluster: WalletAdapterNetwork.Mainnet,
            onWalletNotFound: createDefaultWalletNotFoundHandler(),
        }),
    ], []);

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
