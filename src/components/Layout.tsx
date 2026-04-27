import { FC, ReactNode, useState, useEffect, useCallback } from 'react';
import { Home, Trophy, User, Sun, Moon, BarChart3, Wallet, LogOut, Settings, HelpCircle, Sparkles, Copy, Check, BadgeCheck } from 'lucide-react';
import { useUnifiedWalletContext, useUnifiedWallet as useJupiterWallet } from '@jup-ag/wallet-adapter';
import { useWallet } from '@solana/wallet-adapter-react';
import { useUnifiedWallet } from '../hooks/useUnifiedWallet';
import { useI18n, LANG_LABELS, Lang } from '../i18n';
import { useTheme } from '../theme';
import { getProfile, getLeaderboard, getPosts, getOrCreateRefCode, getStats } from '../lib/database';
import { getSkrPriceUsd } from '../lib/price';
import { getTwitterAvatarUrl, getProfileDisplayName } from '../lib/utils';
import { SolanaAvatar } from './SolanaAvatar';
import { TREASURY_WALLET } from '../lib/solana';


interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onViewProfile?: (wallet: string) => void;
  onOpenLegal?: (page: 'terms' | 'privacy' | 'license') => void;
}

export const Layout: FC<LayoutProps> = ({ children, activeTab, setActiveTab, onViewProfile, onOpenLegal }) => {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { publicKey } = useUnifiedWallet();
  const jupiterWallet = useJupiterWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const { wallets, select } = useWallet();
  const [isMobile] = useState(() =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [showDisconnectMenu, setShowDisconnectMenu] = useState(false);

  const handleConnect = useCallback(async () => {
    if (isMobile) {
      const mwa = wallets.find(w => w.adapter.name === 'Mobile Wallet Adapter');
      if (mwa) {
        try { await mwa.adapter.disconnect(); } catch {}
        select(mwa.adapter.name);
        setTimeout(() => { try { mwa.adapter.connect(); } catch {} }, 100);
        return;
      }
    }
    setShowModal(true);
  }, [setShowModal, isMobile, wallets, select]);

  const handleDisconnect = useCallback(async () => {
    const mwa = wallets.find(w => w.adapter.name === 'Mobile Wallet Adapter');
    if (mwa) { try { await mwa.adapter.disconnect(); } catch {} }
    try { await jupiterWallet.disconnect(); } catch {}
    localStorage.removeItem('walletName');
    localStorage.removeItem('solia_last_wallet');
    localStorage.removeItem('SolanaMobileWalletAdapterDefaultAuthorizationCache');
    localStorage.removeItem('unified-wallet-previously-connected');
    setShowDisconnectMenu(false);
  }, [jupiterWallet, wallets]);

  useEffect(() => {
    if (!publicKey) { setUserAvatar(null); return; }
    getProfile(publicKey.toBase58()).then((p) => {
      if (p) {
        const xAvatar = getTwitterAvatarUrl(p.twitter);
        setUserAvatar(xAvatar || p.avatar_url || null);
      }
    });
  }, [publicKey]);

  return (
    <div className="flex flex-col h-[100dvh] bg-zinc-950 text-zinc-50 font-sans">

      {/* ── MOBILE HEADER ── */}
      <header className="lg:hidden border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center justify-between px-2 py-2.5 sm:p-4 max-w-2xl mx-auto">
          <div className="flex items-center shrink-0 mr-1">
            <img src="/Solia Logo.png" alt="Solia Logo" className="h-6 sm:h-8 object-contain" />
          </div>
          <div className="flex items-center gap-0.5 sm:gap-2">
            <button onClick={() => setShowAbout(true)} className="p-1 sm:p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors mr-1">
              <HelpCircle size={16} />
            </button>
            <button onClick={() => setShowSettings(true)} className="p-1 sm:p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
              <Settings size={16} />
            </button>
            <div className="scale-[0.85] sm:scale-100 origin-right">
              {publicKey ? (
                <div className="relative">
                  <button onClick={() => setShowDisconnectMenu(!showDisconnectMenu)} className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 h-8 px-3 rounded-xl text-xs font-medium text-zinc-300 transition-colors whitespace-nowrap">
                    <Wallet size={14} className="text-indigo-400" />
                    {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                  </button>
                  {showDisconnectMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50 min-w-[200px]">
                      <button onClick={handleDisconnect} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-zinc-800 transition-colors">
                        <LogOut size={14} /> Disconnect
                      </button>
                      <p className="px-3 py-2 text-[10px] text-zinc-500 leading-tight border-t border-zinc-800/50">
                        To switch wallet, close Phantom app fully before reconnecting
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={handleConnect} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 h-8 px-4 rounded-xl text-xs font-semibold text-white transition-colors whitespace-nowrap shadow-lg shadow-indigo-500/20">
                  <Wallet size={14} /> Connect
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── DESKTOP / MOBILE SHARED CONTENT AREA ── */}
      <div className="flex flex-1 overflow-hidden lg:max-w-[1265px] lg:mx-auto lg:w-full">

        {/* ── DESKTOP LEFT SIDEBAR ── */}
        <aside className="hidden lg:flex flex-col w-[260px] shrink-0 border-r border-zinc-800/50 overflow-y-auto px-4 py-5">
          {/* Logo */}
          <div className="mb-6 px-2">
            <img src="/Solia Logo.png" alt="Solia" className="h-8 object-contain" />
          </div>

          {/* Nav + Create button */}
          <nav className="flex flex-col gap-1 flex-1">
            {[
              { id: 'feed',        icon: <Home size={22} />,     label: t('nav.feed') },
              { id: 'leaderboard', icon: <Trophy size={22} />,   label: t('nav.top') },
              { id: 'stats',       icon: <BarChart3 size={22} />, label: 'Stats' },
              { id: 'profile',     icon: <User size={22} />,     label: t('nav.profile') },
            ].map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all ${
                  activeTab === id ? 'text-zinc-50 bg-zinc-800/80' : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50'
                }`}
              >
                <span className={activeTab === id ? 'text-indigo-400' : ''}>{icon}</span>
                {label}
              </button>
            ))}

            <button
              onClick={() => setActiveTab('generate')}
              className={`flex items-center justify-center gap-2 w-full py-3 mt-3 rounded-xl font-semibold text-sm transition-all ${
                activeTab === 'generate' ? 'bg-indigo-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              }`}
            >
              <Sparkles size={18} />
              {t('nav.create')}
            </button>
          </nav>

          {/* Wallet + Settings */}
          <div className="border-t border-zinc-800/50 pt-4 mt-6 flex flex-col gap-3">
            {publicKey ? (
              <div className="relative">
                <button
                  onClick={() => setShowDisconnectMenu(!showDisconnectMenu)}
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-sm text-zinc-300"
                >
                  {userAvatar ? (
                    <img src={userAvatar} alt="avatar" className="w-7 h-7 rounded-full object-cover border border-zinc-600" referrerPolicy="no-referrer" />
                  ) : (
                    <SolanaAvatar size={28} />
                  )}
                  <span className="flex-1 text-left truncate">
                    {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                  </span>
                  <Wallet size={14} className="text-indigo-400 shrink-0" />
                </button>
                {showDisconnectMenu && (
                  <div className="absolute bottom-full left-0 mb-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50 w-full">
                    <button onClick={handleDisconnect} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-zinc-800 transition-colors">
                      <LogOut size={14} /> Disconnect
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleConnect}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
              >
                <Wallet size={14} /> Connect Wallet
              </button>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowSettings(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors">
                <Settings size={14} /> Settings
              </button>
              <button onClick={() => setShowAbout(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors">
                <HelpCircle size={14} /> About
              </button>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT (shared mobile + desktop) ── */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-6 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] lg:border-r lg:border-zinc-800/50">
          <div className="max-w-2xl mx-auto">
            {children}
          </div>
        </main>

        {/* ── DESKTOP RIGHT PANEL ── */}
        <DesktopRightPanel
          walletAddress={publicKey?.toBase58() ?? null}
          onSetTab={setActiveTab}
          onViewProfile={onViewProfile}
          onOpenLegal={onOpenLegal}
        />

      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-[90] bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="grid grid-cols-5 items-center h-14 sm:h-16 px-1 sm:px-2 max-w-2xl mx-auto">
          <NavItem icon={<Home size={20} />} label={t('nav.feed')} isActive={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
          <NavItem icon={<Trophy size={20} />} label={t('nav.top')} isActive={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')} />
          <div className="flex items-center justify-center h-full">
            {activeTab === 'generate' ? (
              <div className="create-btn-spin p-[2px] rounded-xl">
                <div className="create-btn-inner flex items-center justify-center w-10 h-10 rounded-[10px]">
                  <Sparkles size={20} className="text-white" />
                </div>
              </div>
            ) : (
              <button
                onClick={() => setActiveTab('generate')}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 transition-colors"
              >
                <Sparkles size={20} className="text-white" />
              </button>
            )}
          </div>
          <NavItem icon={<BarChart3 size={20} />} label="Stats" isActive={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
          <NavItem
            icon={
              userAvatar ? (
                <div className="w-5 h-5 rounded-full overflow-hidden border border-zinc-600">
                  <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ) : (
                <SolanaAvatar size={20} />
              )
            }
            label={t('nav.profile')}
            isActive={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
          />
        </div>
      </nav>

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAbout(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full max-h-[80vh] overflow-y-auto" onClick={(e: MouseEvent) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-zinc-100">About Solia</h2>
              <button onClick={() => setShowAbout(false)} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">✕</button>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Solia is a decentralized social platform for AI-powered content creators, allowing them to monetize their content on the Solana blockchain. Create, share, and sell AI-generated images using SKR tokens. Think Pinterest — but owned by creators, not platforms.
            </p>
            <div className="mb-3">
              <p className="text-[11px] font-semibold text-zinc-300 mb-2">Core Functionality</p>
              {['Social Feed — Hot/New/Trends algorithms','AI Image Generation — multi-provider fallback','Creator Profiles — X, Telegram, YouTube verification','Content Monetization — sell images with SKR tokens','Analytics Dashboard — real-time statistics','Top Creators Ticker — trending artists showcase'].map(f => (
                <p key={f} className="text-[11px] text-zinc-500 leading-relaxed">✅ {f}</p>
              ))}
            </div>
            <div className="mb-3">
              <p className="text-[11px] font-semibold text-zinc-300 mb-2">Advanced Features</p>
              {['Smart Sorting Algorithms — time-decay scoring','Referral System — earn from activity (15%/10%)','Follow System — build your creator network','Like & Comment — engage with the community','Drafts System — save before publishing','Leaderboard — top creators ranked','Daily Like Limits — bot protection','Transaction History — track all activity','Image Protection — download prevention','Multi-language — 6 languages supported'].map(f => (
                <p key={f} className="text-[11px] text-zinc-500 leading-relaxed">✅ {f}</p>
              ))}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-zinc-300 mb-2">Monetization 💰</p>
              {['Generation: 85% treasury + 15% referrer','Purchase: 80% creator + 10% referrer + 10% treasury','+8 likes per generated image (to creator)','+10 likes per purchased image (to buyer)'].map(f => (
                <p key={f} className="text-[11px] text-zinc-500 leading-relaxed">✅ {f}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:justify-center lg:items-center" onClick={() => setShowSettings(false)}>
          <div className="bg-zinc-900 border-t lg:border border-zinc-800 rounded-t-2xl lg:rounded-2xl p-5 pb-8 lg:pb-5 flex flex-col gap-5 max-w-2xl w-full mx-auto lg:max-w-md" onClick={(e: MouseEvent) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-indigo-500 rounded-full mx-auto -mt-1 cursor-pointer lg:hidden" onClick={() => setShowSettings(false)} />
            <div className="hidden lg:flex items-center justify-between">
              <h2 className="text-base font-bold">Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-zinc-300 text-lg">✕</button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300 font-medium">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
              <button onClick={toggle} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme === 'dark' ? 'Dark' : 'Light'}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-zinc-300 font-medium">Language</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
                  <button key={l} onClick={() => setLang(l)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${l === lang ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}>
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-zinc-300 font-medium">Follow us</span>
              <div className="flex gap-3 flex-wrap">
                {[
                  { href: 'https://x.com/SoliaLive', color: 'text-zinc-300', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                  { href: 'https://t.me/+1kvc0wLDvVg4NWVi', color: 'text-sky-400', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> },
                  { href: 'https://www.youtube.com/@SoliaLive', color: 'text-red-500', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
                  { href: 'https://www.tiktok.com/@solialives', color: 'text-zinc-300', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg> },
                ].map(({ href, color, icon }) => (
                  <a key={href} href={href} target="_blank" rel="noreferrer" className={`flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-800 hover:bg-zinc-700 ${color} transition-colors`}>
                    {icon}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex flex-col border-t border-zinc-800/50 pt-1">
              {([['Terms of Service / EULA', 'terms'], ['Privacy Policy', 'privacy'], ['License', 'license']] as const).map(([label, page]) => (
                <button key={page} onClick={() => { setShowSettings(false); onOpenLegal?.(page); }} className="flex items-center justify-between py-3 border-b border-zinc-800/40 text-zinc-200 hover:text-white transition-colors text-sm font-medium w-full text-left">
                  {label} <span className="text-zinc-500 text-xs">›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Desktop Right Panel ──────────────────────────────────────────────────────

const DesktopRightPanel: FC<{ walletAddress: string | null; onSetTab: (tab: string) => void; onViewProfile?: (wallet: string) => void; onOpenLegal?: (page: 'terms' | 'privacy' | 'license') => void }> = ({ walletAddress, onSetTab, onViewProfile, onOpenLegal }) => {
  const [creators, setCreators] = useState<{ wallet: string; generations: number; avatar_url: string | null; twitter: string; verified: boolean; display_name: string | null }[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<{ id: string; image_url: string; author: string }[]>([]);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatorEarnings, setCreatorEarnings] = useState<number | null>(null);
  const [skrPrice, setSkrPrice] = useState<number | null>(null);

  useEffect(() => {
    getLeaderboard(24).then((data) => {
      setCreators(data.filter(c => c.wallet !== TREASURY_WALLET.toBase58()).slice(0, 5));
    });
    getPosts({ sort: 'hot', limit: 3 }).then((posts) => {
      setTrendingPosts(posts.filter(p => p.image_url).slice(0, 3).map(p => ({ id: p.id, image_url: p.image_url!, author: p.author })));
    });
    getStats('all').then((s) => setCreatorEarnings(s.creatorEarnings));
    getSkrPriceUsd().then(price => { if (price > 0) setSkrPrice(price); });
  }, []);

  useEffect(() => {
    if (!walletAddress) { setRefCode(null); return; }
    getOrCreateRefCode(walletAddress).then(setRefCode);
  }, [walletAddress]);

  const refLink = refCode ? `https://solia.live/?ref=${refCode}` : null;

  const handleCopy = () => {
    if (!refLink) return;
    navigator.clipboard.writeText(refLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <aside className="hidden lg:flex flex-col w-[320px] shrink-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] px-3 py-4 gap-3">

      {/* Top Creators */}
      <div className="bg-zinc-900/60 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-zinc-100">Top Creators · 24h</h3>
          <button onClick={() => onSetTab('leaderboard')} className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors">
            See all →
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {creators.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 animate-pulse py-1">
                <div className="w-4 h-3 bg-zinc-800 rounded" />
                <div className="w-8 h-8 rounded-full bg-zinc-800 shrink-0" />
                <div className="flex-1 h-3 bg-zinc-800 rounded" />
              </div>
            ))
          ) : creators.map((c, i) => {
            const avatar = getTwitterAvatarUrl(c.twitter) || c.avatar_url;
            return (
              <div
                key={c.wallet}
                onClick={() => onViewProfile?.(c.wallet)}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${onViewProfile ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
              >
                <span className="text-xs font-bold text-indigo-400 w-4 text-center shrink-0">{i + 1}</span>
                {avatar ? (
                  <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer"
                    onError={(e: any) => { e.target.style.display = 'none'; }} />
                ) : (
                  <div className="shrink-0"><SolanaAvatar size={32} /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {getProfileDisplayName({ display_name: c.display_name, twitter: c.twitter, wallet: c.wallet })}
                    </p>
                    {c.verified && <BadgeCheck size={12} className="text-indigo-400 shrink-0" />}
                  </div>
                  <p className="text-xs text-zinc-500">{c.generations} gen</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SKR Price + Creator Earnings */}
      <div className="bg-zinc-900/60 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">SKR Price</p>
          {skrPrice !== null ? (
            <p className="text-sm font-bold text-indigo-400">${skrPrice < 0.0001 ? skrPrice.toExponential(2) : skrPrice.toFixed(6)}</p>
          ) : (
            <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />
          )}
        </div>
        <div className="text-right">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Creator Earnings</p>
          {creatorEarnings !== null ? (
            <p className="text-sm font-bold text-emerald-400">{creatorEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })} SKR</p>
          ) : (
            <div className="h-4 w-20 bg-zinc-800 rounded animate-pulse ml-auto" />
          )}
        </div>
      </div>

      {/* Trending Posts */}
      {trendingPosts.length > 0 && (
        <div className="bg-zinc-900/60 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-zinc-100">Trending Now</h3>
            <button onClick={() => onSetTab('feed')} className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors">
              Feed →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {trendingPosts.map(p => (
              <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-zinc-800">
                <img src={p.image_url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" referrerPolicy="no-referrer" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Referral */}
      <div className="bg-zinc-900/60 rounded-xl p-3">
        <h3 className="text-sm font-bold text-zinc-100 mb-0.5">Invite & Earn</h3>
        <p className="text-[10px] text-zinc-500 mb-2">Earn 15% from generations + 10% from purchases</p>
        {refLink ? (
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors text-left"
          >
            <span className="flex-1 text-[11px] text-zinc-300 truncate">{refLink}</span>
            {copied ? <Check size={14} className="text-green-400 shrink-0" /> : <Copy size={14} className="text-zinc-500 shrink-0" />}
          </button>
        ) : (
          <p className="text-[11px] text-zinc-600 italic">Connect wallet to get your referral link</p>
        )}
      </div>

      {/* Follow Solia */}
      <div className="bg-zinc-900/60 rounded-xl p-3">
        <h3 className="text-sm font-bold text-zinc-100 mb-1.5">Follow Solia</h3>
        <div className="flex flex-col gap-0">
          {[
            { href: 'https://x.com/SoliaLive', label: '@SoliaLive', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
            { href: 'https://t.me/+1kvc0wLDvVg4NWVi', label: 'Telegram', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> },
            { href: 'https://www.youtube.com/@SoliaLive', label: 'YouTube', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
            { href: 'https://www.tiktok.com/@solialives', label: 'TikTok', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg> },
          ].map(({ href, label, icon }) => (
            <a key={href} href={href} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors group">
              <span className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0">{icon}</span>
              <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">{label}</span>
            </a>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-zinc-800/50 flex gap-3">
          {([['Terms', 'terms'], ['Privacy', 'privacy'], ['License', 'license']] as const).map(([label, page]) => (
            <button key={page} onClick={() => onOpenLegal?.(page)} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
              {label}
            </button>
          ))}
        </div>
      </div>

    </aside>
  );
};

// ── Mobile Nav Item ──────────────────────────────────────────────────────────

interface NavItemProps {
  icon: ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const NavItem: FC<NavItemProps> = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`relative flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
      isActive ? 'text-indigo-400' : 'text-zinc-300 hover:text-zinc-100'
    }`}
  >
    {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-indigo-400 rounded-full" />}
    <div className={`${isActive ? 'scale-110' : 'scale-100'} transition-transform duration-200`}>{icon}</div>
    <span className="text-[9px] sm:text-[10px] font-medium leading-tight">{label}</span>
  </button>
);
