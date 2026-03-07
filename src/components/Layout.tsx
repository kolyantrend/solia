import { FC, ReactNode, useState, useEffect } from 'react';
import { Home, ImagePlus, Trophy, User, Globe, Sun, Moon, Twitter, BarChart3 } from 'lucide-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useI18n, LANG_LABELS, Lang } from '../i18n';
import { useTheme } from '../theme';
import { getProfile } from '../lib/database';
import { getTwitterAvatarUrl } from '../lib/utils';
import { SolanaAvatar } from './SolanaAvatar';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Layout: FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { publicKey } = useWallet();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

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
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center justify-between px-2 py-2.5 sm:p-4 max-w-2xl mx-auto">
        <div className="flex items-center shrink-0 mr-1">
          <img 
            src="https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/Logo%20New.png" 
            alt="Solia Logo" 
            className="h-6 sm:h-8 object-contain" 
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex items-center gap-0.5 sm:gap-2">
          {/* Theme Toggle */}
          <button
            onClick={toggle}
            className="p-1 sm:p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
          </button>
          {/* X / Twitter link */}
          <a
            href="https://x.com/ai_solia"
            target="_blank"
            rel="noreferrer"
            className="p-1 sm:p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title="X / Twitter"
          >
            <Twitter size={12} />
          </a>
          {/* Language Selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-0.5 px-1 sm:px-2 py-1 sm:py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] sm:text-xs font-medium text-zinc-300 transition-colors whitespace-nowrap"
            >
              <Globe size={12} />
              {LANG_LABELS[lang]}
            </button>
            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50 min-w-[100px]">
                {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => { setLang(l); setShowLangMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      l === lang ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="scale-[0.75] sm:scale-90 origin-right">
            <WalletMultiButton className="!bg-zinc-800 hover:!bg-zinc-700 !h-7 sm:!h-8 !px-2 sm:!px-3 !rounded-xl !text-[10px] sm:!text-xs !font-medium transition-colors !whitespace-nowrap" />
          </div>
        </div>
      </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-20">
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/50 pb-safe">
        <div className="flex justify-around items-center h-14 sm:h-16 px-1 sm:px-2 max-w-2xl mx-auto">
          <NavItem 
            icon={<Home size={20} />} 
            label={t('nav.feed')} 
            isActive={activeTab === 'feed'} 
            onClick={() => setActiveTab('feed')} 
          />
          <NavItem 
            icon={<ImagePlus size={20} />} 
            label={t('nav.create')} 
            isActive={activeTab === 'generate'} 
            onClick={() => setActiveTab('generate')} 
          />
          <NavItem 
            icon={<Trophy size={20} />} 
            label={t('nav.top')} 
            isActive={activeTab === 'leaderboard'} 
            onClick={() => setActiveTab('leaderboard')} 
          />
          <NavItem 
            icon={<BarChart3 size={20} />} 
            label="Stats" 
            isActive={activeTab === 'stats'} 
            onClick={() => setActiveTab('stats')} 
          />
          <NavItem 
            icon={
              userAvatar ? (
                <div className="w-5 h-5 rounded-full overflow-hidden border border-zinc-600">
                  <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ) : (
                <SolanaAvatar size={20} />)
            } 
            label={t('nav.profile')} 
            isActive={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')} 
          />
        </div>
      </nav>
    </div>
  );
};

interface NavItemProps {
  icon: ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const NavItem: FC<NavItemProps> = ({ icon, label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
        isActive ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <div className={`${isActive ? 'scale-110' : 'scale-100'} transition-transform duration-200`}>
        {icon}
      </div>
      <span className="text-[9px] sm:text-[10px] font-medium leading-tight">{label}</span>
    </button>
  );
};
