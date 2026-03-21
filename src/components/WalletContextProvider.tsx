import { FC, ReactNode } from 'react';
import { UnifiedWalletProvider } from '@jup-ag/wallet-adapter';

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    return (
        <UnifiedWalletProvider
            wallets={[]}
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
