import { FC, ReactNode, useMemo, useEffect, useState } from 'react';
import { UnifiedWalletProvider } from '@jup-ag/wallet-adapter';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [isMobile, setIsMobile] = useState(false);

    // Listen for Phantom wallet account changes (user switches wallet inside Phantom)
    useEffect(() => {
        const phantom = (window as any).phantom?.solana;
        if (!phantom) return;

        const handleAccountChanged = () => {
            // Clear cached wallet so autoConnect picks up the new account
            localStorage.removeItem('walletName');
            window.location.reload();
        };

        phantom.on('accountChanged', handleAccountChanged);

        // Also check when user returns to page (e.g. after switching wallet in Phantom app)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && phantom.publicKey) {
                const cachedWallet = localStorage.getItem('solia_last_wallet');
                const currentWallet = phantom.publicKey.toBase58();
                if (cachedWallet && cachedWallet !== currentWallet) {
                    localStorage.removeItem('walletName');
                    window.location.reload();
                }
                localStorage.setItem('solia_last_wallet', currentWallet);
            }
        };

        // Save current wallet on load
        if (phantom.publicKey) {
            localStorage.setItem('solia_last_wallet', phantom.publicKey.toBase58());
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            phantom.removeListener('accountChanged', handleAccountChanged);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        const checkMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        setIsMobile(checkMobile);

        if (checkMobile) {
            // Use MutationObserver to hide duplicate wallets in the picker.
            // CSS :has() is unsupported in many Android WebViews, so we do it via JS.
            const hideDuplicateWallets = () => {
                // Hide Phantom (MWA already opens Phantom)
                document.querySelectorAll('img[alt="Phantom icon"]').forEach(img => {
                    const li = img.closest('li');
                    if (li) (li as HTMLElement).style.display = 'none';
                });
                // Hide duplicate Mobile entries — keep only the first
                const mobileItems: HTMLElement[] = [];
                document.querySelectorAll('img[alt="Mobile Wallet Adapter icon"]').forEach(img => {
                    const li = img.closest('li');
                    if (li) mobileItems.push(li as HTMLElement);
                });
                for (let i = 1; i < mobileItems.length; i++) {
                    mobileItems[i].style.display = 'none';
                }
            };

            // Run immediately + observe for dynamic renders
            hideDuplicateWallets();
            const observer = new MutationObserver(hideDuplicateWallets);
            observer.observe(document.body, { childList: true, subtree: true });

            return () => { observer.disconnect(); };
        }
    }, []);

    const wallets = useMemo(() => {
        const adapters: any[] = [];

        const isPhantomInApp = typeof window !== 'undefined' && (window as any).phantom?.solana?.isPhantom;

        if (isMobile && !isPhantomInApp) {
            // Mobile outside Phantom: no explicit adapters needed.
            // MWA auto-registers as Standard Wallet — adding it explicitly causes duplicates.
        } else {
            // Desktop or inside Phantom in-app browser: use the real Phantom adapter
            adapters.push(new PhantomWalletAdapter());
        }

        return adapters;
    }, [isMobile]);

    return (
        <UnifiedWalletProvider
            wallets={wallets}
            config={{
                autoConnect: true,
                env: 'mainnet-beta',
                metadata: {
                    name: 'Solia',
                    description: 'AI-powered content monetization platform on Solana',
                    url: 'https://solia.live',
                    iconUrls: ['https://solia.live/favicon.png'],
                },
            }}
        >
            {children}
        </UnifiedWalletProvider>
    );
};
