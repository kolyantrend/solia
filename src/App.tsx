import { useState, useEffect } from 'react';
import { WalletContextProvider } from './components/WalletContextProvider';
import { Layout } from './components/Layout';
import { FeedView, Post } from './views/FeedView';
import { GenerateView } from './views/GenerateView';
import { LeaderboardView } from './views/LeaderboardView';
import { ProfileView } from './views/ProfileView';
import { StatsView } from './views/StatsView';
import { Key, ArrowLeft } from 'lucide-react';
import { I18nProvider, useI18n } from './i18n';
import { ThemeProvider } from './theme';
import { useUnifiedWallet } from './hooks/useUnifiedWallet';
import { saveReferral, resolveRefCode, getReferrer } from './lib/database';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// Capture referral code from URL on first load (skip phantom callback URLs)
const REF_KEY = 'solia_ref';
function captureReferral() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    sessionStorage.setItem(REF_KEY, ref);
    const url = new URL(window.location.href);
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.toString());
  }
}
captureReferral();

function AppContent() {
  const { publicKey } = useUnifiedWallet();

  // Save referral when wallet connects
  // If no ref code, auto-register as system referral (treasury wallet)
  const TREASURY = 'GqQ41MPh9b1HEt9V5FWnKZfPjdhjgnaPjPLCRcLsuprA';
  useEffect(() => {
    if (!publicKey) return;
    const myWallet = publicKey.toBase58();
    const refCode = sessionStorage.getItem(REF_KEY);
    if (refCode) {
      // Resolve short ref code to wallet address
      resolveRefCode(refCode).then((referrerWallet) => {
        if (referrerWallet && referrerWallet !== myWallet) {
          saveReferral(referrerWallet, myWallet).then(() => {
            sessionStorage.removeItem(REF_KEY);
          });
        }
      });
    } else {
      // No ref code — assign treasury as referrer if user has no referrer yet
      getReferrer(myWallet).then((existing) => {
        if (!existing) {
          saveReferral(TREASURY, myWallet);
        }
      });
    }
  }, [publicKey]);

  return <AppInner />;
}

function AppInner() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [viewingProfile, setViewingProfile] = useState<string | null>(null);
  const [previousTab, setPreviousTab] = useState<string>('feed');

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasKey(has);
      } else {
        setHasKey(true); // Fallback if not running in AI Studio
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        setHasKey(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleGenerate = (newPost: Post) => {
    setPosts([newPost, ...posts]);
    setActiveTab('feed');
  };

  const handleViewProfile = (address: string) => {
    setPreviousTab(activeTab);
    setViewingProfile(address);
  };

  const handleBackFromProfile = () => {
    setViewingProfile(null);
    setActiveTab(previousTab);
  };

  const handleSetActiveTab = (tab: string) => {
    setViewingProfile(null);
    setActiveTab(tab);
  };

  if (hasKey === null) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">{t('loading')}</div>;
  }

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900/50 p-8 rounded-3xl border border-zinc-800/50 text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto">
            <Key size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{t('apikey.title')}</h1>
            <p className="text-zinc-400 text-sm">
              {t('apikey.desc')}
            </p>
            
          </div>
          <button
            onClick={handleSelectKey}
            className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors"
          >
            {t('apikey.select')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={handleSetActiveTab}>
        {viewingProfile ? (
          <>
            <div className="px-4 pt-3">
              <button
                onClick={handleBackFromProfile}
                className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <ArrowLeft size={16} />
                {t('nav.feed')}
              </button>
            </div>
            <ProfileView
              viewAddress={viewingProfile}
              onViewProfile={handleViewProfile}
            />
          </>
        ) : (
          <>
            {activeTab === 'feed' && <FeedView posts={posts} onViewProfile={handleViewProfile} />}
            {activeTab === 'generate' && <GenerateView onGenerate={handleGenerate} />}
            {activeTab === 'leaderboard' && <LeaderboardView onViewProfile={handleViewProfile} />}
            {activeTab === 'stats' && <StatsView onViewProfile={handleViewProfile} />}
            {activeTab === 'profile' && <ProfileView onViewProfile={handleViewProfile} />}
          </>
        )}
      </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <WalletContextProvider>
          <AppContent />
        </WalletContextProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
