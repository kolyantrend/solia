import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { WalletContextProvider } from './components/WalletContextProvider';
import { Layout } from './components/Layout';
import { FeedView, Post } from './views/FeedView';

const GenerateView = lazy(() => import('./views/GenerateView').then(m => ({ default: m.GenerateView })));
const LeaderboardView = lazy(() => import('./views/LeaderboardView').then(m => ({ default: m.LeaderboardView })));
const ProfileView = lazy(() => import('./views/ProfileView').then(m => ({ default: m.ProfileView })));
const StatsView = lazy(() => import('./views/StatsView').then(m => ({ default: m.StatsView })));
const TermsView = lazy(() => import('./views/TermsView').then(m => ({ default: m.TermsView })));
const PrivacyView = lazy(() => import('./views/PrivacyView').then(m => ({ default: m.PrivacyView })));
const LicenseView = lazy(() => import('./views/LicenseView').then(m => ({ default: m.LicenseView })));
import { Key, ArrowLeft } from 'lucide-react';
import { I18nProvider, useI18n } from './i18n';
import { ThemeProvider } from './theme';
import { useUnifiedWallet } from './hooks/useUnifiedWallet';
import { saveReferral, resolveRefCode, getReferrer, getPostById, DbPost } from './lib/database';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// Capture referral code from URL on first load (works for web)
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

function parseInitialRoute(): { legalPage: 'terms' | 'privacy' | 'license' | null; profileWallet: string | null; postId: string | null } {
  const path = window.location.pathname;
  if (path === '/terms') return { legalPage: 'terms', profileWallet: null, postId: null };
  if (path === '/privacy') return { legalPage: 'privacy', profileWallet: null, postId: null };
  if (path === '/license') return { legalPage: 'license', profileWallet: null, postId: null };
  const profileMatch = path.match(/^\/profile\/(.+)$/);
  if (profileMatch) return { legalPage: null, profileWallet: profileMatch[1], postId: null };
  const postMatch = path.match(/^\/post\/(.+)$/);
  if (postMatch) return { legalPage: null, profileWallet: null, postId: postMatch[1] };
  return { legalPage: null, profileWallet: null, postId: null };
}

function AppInner() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const initial = useRef(parseInitialRoute());
  const [viewingProfile, setViewingProfile] = useState<string | null>(initial.current.profileWallet);
  const [viewingPost, setViewingPost] = useState<DbPost | null>(null);
  const [previousTab, setPreviousTab] = useState<string>('feed');
  const [legalPage, setLegalPage] = useState<'terms' | 'privacy' | 'license' | null>(initial.current.legalPage);
  const isDirectLegalAccess = useRef(
    ['terms', 'privacy', 'license'].includes(window.location.pathname.slice(1)) &&
    document.referrer === ''
  );

  // Load post by ID on direct URL access
  useEffect(() => {
    const postId = initial.current.postId;
    if (!postId) return;
    getPostById(postId).then((post) => {
      if (post) setViewingPost(post);
    });
  }, []);

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
    setViewingPost(null);
    setViewingProfile(address);
    window.history.pushState(null, '', `/profile/${address}`);
  };

  const handleViewPost = (post: DbPost) => {
    setViewingPost(post);
    setViewingProfile(null);
    window.history.pushState(null, '', `/post/${post.id}`);
  };

  const handleBackFromProfile = () => {
    setViewingProfile(null);
    setViewingPost(null);
    setActiveTab(previousTab);
    window.history.pushState(null, '', '/');
  };

  const handleSetActiveTab = (tab: string) => {
    setViewingProfile(null);
    setViewingPost(null);
    setLegalPage(null);
    setActiveTab(tab);
    window.history.pushState(null, '', '/');
  };

  const handleOpenLegal = (page: 'terms' | 'privacy' | 'license') => {
    setPreviousTab(activeTab);
    setLegalPage(page);
    window.history.pushState(null, '', `/${page}`);
  };

  const handleBackFromLegal = () => {
    setLegalPage(null);
    window.history.pushState(null, '', '/');
  };

  // Handle browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      if (path === '/terms') { setLegalPage('terms'); setViewingProfile(null); setViewingPost(null); }
      else if (path === '/privacy') { setLegalPage('privacy'); setViewingProfile(null); setViewingPost(null); }
      else if (path === '/license') { setLegalPage('license'); setViewingProfile(null); setViewingPost(null); }
      else {
        const profileMatch = path.match(/^\/profile\/(.+)$/);
        const postMatch = path.match(/^\/post\/(.+)$/);
        if (profileMatch) { setViewingProfile(profileMatch[1]); setViewingPost(null); setLegalPage(null); }
        else if (postMatch) {
          setViewingProfile(null); setLegalPage(null);
          getPostById(postMatch[1]).then((post) => { if (post) setViewingPost(post); });
        }
        else { setLegalPage(null); setViewingProfile(null); setViewingPost(null); }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Direct URL access only (typed in address bar, not navigated from app)
  if (legalPage && isDirectLegalAccess.current) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50">
        <Suspense fallback={null}>
          {legalPage === 'terms'
            ? <TermsView onBack={handleBackFromLegal} />
            : legalPage === 'privacy'
            ? <PrivacyView onBack={handleBackFromLegal} />
            : <LicenseView onBack={handleBackFromLegal} />
          }
        </Suspense>
      </div>
    );
  }

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
    <Layout activeTab={activeTab} setActiveTab={handleSetActiveTab} onViewProfile={handleViewProfile} onOpenLegal={handleOpenLegal}>
      <Suspense fallback={null}>
        {legalPage ? (
          legalPage === 'terms'
            ? <TermsView onBack={handleBackFromLegal} />
            : legalPage === 'privacy'
            ? <PrivacyView onBack={handleBackFromLegal} />
            : <LicenseView onBack={handleBackFromLegal} />
        ) : viewingPost ? (
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
            <FeedView
              posts={[{ id: viewingPost.id, imageUrl: viewingPost.image_url, prompt: viewingPost.prompt, author: viewingPost.author, likes: viewingPost.likes_count, category: viewingPost.category, aspectRatio: viewingPost.aspect_ratio, createdAt: viewingPost.created_at }]}
              onViewProfile={handleViewProfile}
              singlePostMode
            />
          </>
        ) : viewingProfile ? (
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
              onOpenLegal={handleOpenLegal}
            />
          </>
        ) : (
          <>
            {activeTab === 'feed' && <FeedView posts={posts} onViewProfile={handleViewProfile} onViewPost={handleViewPost} />}
            {/* GenerateView stays mounted (hidden) so generation survives tab switches */}
            <div style={{ display: activeTab === 'generate' ? undefined : 'none' }}>
              <GenerateView onGenerate={handleGenerate} />
            </div>
            {activeTab === 'leaderboard' && <LeaderboardView onViewProfile={handleViewProfile} />}
            {activeTab === 'stats' && <StatsView onViewProfile={handleViewProfile} />}
            {activeTab === 'profile' && <ProfileView onViewProfile={handleViewProfile} onOpenLegal={handleOpenLegal} />}
          </>
        )}
      </Suspense>
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
