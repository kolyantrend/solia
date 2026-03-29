import React, { FC, useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useUnifiedWallet } from '../hooks/useUnifiedWallet';
import { Loader2, Sparkles, Image as ImageIcon, CheckCircle2, Settings2, Upload, X, HelpCircle } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { useI18n } from '../i18n';
import * as db from '../lib/database';
import { transferSkrSplit, TREASURY_WALLET, MwaTimeoutError, buildPhantomBrowseUrl } from '../lib/solana';
import { PublicKey } from '@solana/web3.js';
import { getGenerationCostSkr } from '../lib/price';
import { BannerCarousel } from '../components/BannerCarousel';
import { PROMO_BANNERS } from '../config/banners';

const CATEGORIES = [
  'Main', 'Solana', 'Animals', 'Tech', 'Car', '3D', 'Camera', 
  'Anime', 'Crypto', 'Fantasy', 'Cyberpunk', 'Abstract', 
  'Characters', 'People', 'Portrait', 'Games', 'Nature', 
  'Cities', 'Space'
];

const ASPECT_RATIOS = ['16:9', '9:16', '1:1'];
const MAX_PROMPT_LENGTH = 1000;
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const RESOLUTIONS = ['1K'];

interface ImageFileData {
  data: string;
  mimeType: string;
}

export const GenerateView: FC<{ onGenerate: (post: any) => void }> = ({ onGenerate }) => {
  const { t } = useI18n();
  const { publicKey, connected, sendTransaction, signTransaction } = useUnifiedWallet();
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('Main');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('1K');
  const [showSettings, setShowSettings] = useState(true);
  const [imageFile1, setImageFile1] = useState<ImageFileData | null>(null);
  const [imageFile2, setImageFile2] = useState<ImageFileData | null>(null);
  
  const [showHelp, setShowHelp] = useState(false);
  const isAdmin = publicKey?.toBase58() === TREASURY_WALLET.toBase58();
  const [grantWallet, setGrantWallet] = useState('');
  const [grantCount, setGrantCount] = useState(1);
  const [grantMsg, setGrantMsg] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phantomRedirectUrl, setPhantomRedirectUrl] = useState<string | null>(null);
  const paidKey = publicKey ? `solia_paid_gen_${publicKey.toBase58()}` : '';
  const [paidForGeneration, setPaidForGeneration] = useState(
    () => paidKey ? localStorage.getItem(paidKey) === '1' : false
  );
  const markPaid = (v: boolean) => {
    setPaidForGeneration(v);
    if (!paidKey) return;
    if (v) localStorage.setItem(paidKey, '1');
    else localStorage.removeItem(paidKey);
  };

  // Sync paid state when wallet changes
  useEffect(() => {
    if (paidKey) {
      setPaidForGeneration(localStorage.getItem(paidKey) === '1');
    } else {
      setPaidForGeneration(false);
    }
  }, [paidKey]);

  const handleFileChange = (setter: (f: ImageFileData | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG and WebP files are allowed');
      e.target.value = '';
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File too large — max ${MAX_FILE_SIZE_MB}MB`);
      e.target.value = '';
      return;
    }

    // Compress image via canvas to avoid Gemini API size limits
    const img = new Image();
    img.onload = () => {
      const MAX_SIZE = 1024;
      let { width, height } = img;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        const scale = MAX_SIZE / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64String = dataUrl.split(',')[1];
      setter({ data: base64String, mimeType: 'image/jpeg' });
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  const { connection } = useConnection();
  const [genCostSkr, setGenCostSkr] = useState<number>(17);

  // Fetch dynamic generation cost on mount and every 60s
  useEffect(() => {
    const fetchCost = () => getGenerationCostSkr().then(setGenCostSkr);
    fetchCost();
    const interval = setInterval(fetchCost, 60_000);
    return () => clearInterval(interval);
  }, []);

  const runGeneration = async (): Promise<void> => {
    if (!publicKey) throw new Error(t('gen.errWallet'));
    setIsGenerating(true);
    setError(null);

    // Rotate between available API keys for load balancing
    const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean) as string[];
    const apiKey = keys[Math.floor(Math.random() * keys.length)];
    const ai = new GoogleGenAI({ apiKey });

    // Retry up to 3 times on 503 / UNAVAILABLE
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          setError(`Model busy — retrying (${attempt}/3)...`);
          await new Promise(r => setTimeout(r, 3000 * attempt));
        }

        const parts: any[] = [{ text: prompt }];
        if (imageFile1) parts.push({ inlineData: { data: imageFile1.data, mimeType: imageFile1.mimeType } });
        if (imageFile2) parts.push({ inlineData: { data: imageFile2.data, mimeType: imageFile2.mimeType } });

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio as any,
              imageSize: resolution as any,
            },
          },
        });

        let imageUrl = '';
        const candidate = response.candidates?.[0];
        const finishReason = candidate?.finishReason || '';

        for (const part of candidate?.content?.parts || []) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }

        if (!imageUrl) {
          if (finishReason === 'SAFETY' || finishReason === 'BLOCKED') {
            throw new Error('Content blocked by safety filter — try a different photo or prompt');
          }
          throw new Error(t('gen.errImage'));
        }

        setResult(imageUrl);

        // Upload image to Supabase Storage
        let publicImageUrl = imageUrl;
        let originalImageUrl = imageUrl;
        try {
          const base64Data = imageUrl.split(',')[1];
          const byteChars = atob(base64Data);
          const byteArray = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
          const blob = new Blob([byteArray], { type: 'image/png' });
          const uploaded = await db.uploadImage(blob, `gen_${Date.now()}.png`);
          if (uploaded) {
            publicImageUrl = uploaded.publicUrl;
            originalImageUrl = uploaded.originalUrl;
          }
        } catch (e) { console.warn('Image upload fallback to base64:', e); }

        // Save post to Supabase
        const walletAddr = publicKey.toBase58();
        const dbPost = await db.createPost({
          author: walletAddr,
          image_url: publicImageUrl,
          original_url: originalImageUrl,
          prompt,
          category: category || 'Main',
          aspect_ratio: aspectRatio,
        });

        const newPost = {
          id: dbPost?.id || Date.now().toString(),
          imageUrl: publicImageUrl,
          prompt,
          author: walletAddr,
          likes: 0,
          category: category !== 'Main' ? category : undefined,
          aspectRatio,
        };

        await db.grantBonusLikes(walletAddr, 8);
        db.markGenerationUsed(walletAddr);
        markPaid(false);
        onGenerate(newPost);
        return;
      } catch (err: any) {
        lastErr = err;
        const msg = (err?.message || '') + (typeof err === 'object' ? JSON.stringify(err) : '');
        if (msg.includes('503') || msg.includes('500') || msg.includes('UNAVAILABLE') || msg.includes('INTERNAL') || msg.includes('overloaded') || msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
          continue;
        }
        break;
      }
    }
    throw lastErr;
  };

  const handleGenerate = async () => {
    if (!connected || !publicKey) {
      setError(t('gen.errWallet'));
      return;
    }
    if (!prompt.trim()) {
      setError(t('gen.errPrompt'));
      return;
    }

    setError(null);

    try {
      // Rate limit check
      const rateCheck = await db.checkGenerationLimit(publicKey.toBase58());
      if (!rateCheck.allowed) {
        setError(rateCheck.reason || 'Rate limit exceeded');
        return;
      }

      // Skip payment if already paid (retry after failed generation)
      // Check localStorage directly — React state may be stale in async context
      const alreadyPaid = paidKey ? localStorage.getItem(paidKey) === '1' : false;

      // Check for free generation credits (admin-granted)
      if (!alreadyPaid) {
        const hasFreeCredit = await db.consumeFreeGeneration(publicKey.toBase58());
        if (hasFreeCredit) {
          markPaid(true);
          await runGeneration();
          return;
        }
      }

      if (!alreadyPaid) {
        setIsPaying(true);

        // Build referral split: 85% treasury + 15% referrer
        const referrerWallet = await db.getReferrer(publicKey.toBase58());
        const recipients: { wallet: PublicKey; amount: number }[] = [];
        const isSystemRef = referrerWallet === TREASURY_WALLET.toBase58();

        if (referrerWallet && !isSystemRef) {
          const treasuryAmount = Math.round(genCostSkr * 0.85 * 10) / 10;
          const referrerAmount = Math.round(genCostSkr * 0.15 * 10) / 10;
          recipients.push({ wallet: TREASURY_WALLET, amount: treasuryAmount });
          recipients.push({ wallet: new PublicKey(referrerWallet), amount: referrerAmount });
        } else {
          // No referrer or system referral: 100% treasury
          recipients.push({ wallet: TREASURY_WALLET, amount: genCostSkr });
        }

        const sig = await transferSkrSplit({
          fromWallet: publicKey,
          recipients,
          sendTransaction,
          signTransaction,
          connection,
        });

        // Record transaction history
        await db.recordTransaction({
          signature: sig,
          from_wallet: publicKey.toBase58(),
          type: 'generation',
          total_amount: genCostSkr,
          treasury_amount: (referrerWallet && !isSystemRef) ? Math.round(genCostSkr * 0.85 * 10) / 10 : genCostSkr,
          referrer_wallet: (referrerWallet && !isSystemRef) ? referrerWallet : undefined,
          referrer_amount: (referrerWallet && !isSystemRef) ? Math.round(genCostSkr * 0.15 * 10) / 10 : undefined,
        });

        // Grant bonus likes to referrer (+10) when their referral generates
        if (referrerWallet && !isSystemRef) {
          db.grantBonusLikes(referrerWallet, 10);
        }

        setIsPaying(false);
        markPaid(true);
      }

      await runGeneration();
    } catch (err: any) {
      console.error(err);
      if (err instanceof MwaTimeoutError) {
        setError('Wallet did not respond. Try opening in Phantom browser.');
        setPhantomRedirectUrl(buildPhantomBrowseUrl());
      } else {
        const raw = err?.message || t('gen.errGenerate');
        // Make error user-friendly — hide raw JSON/technical details
        let msg = raw;
        if (raw.includes('INTERNAL') || raw.includes('500')) {
          msg = 'AI model error — please try again';
        } else if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('overloaded')) {
          msg = 'AI model is busy — please try again in a moment';
        } else if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
          msg = 'Network error — check your connection and try again';
        } else if (raw.includes('SAFETY') || raw.includes('blocked') || raw.includes('safety')) {
          msg = 'Content blocked by safety filter — try a different photo or prompt';
        } else if (raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
          msg = 'API access denied — please contact support';
        } else if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429') || raw.includes('quota')) {
          msg = 'Generation limit reached — please try again later';
        } else if (raw.includes('INVALID_ARGUMENT') || raw.includes('400')) {
          msg = 'Invalid request — try a different prompt or photo';
        } else if (raw.includes('DEADLINE_EXCEEDED') || raw.includes('timeout') || raw.includes('Timeout')) {
          msg = 'Request timed out — please try again';
        } else if (raw.startsWith('{') || raw.startsWith('[')) {
          // Catch any remaining raw JSON errors
          msg = 'Generation failed — please try again';
        }
        const wasPaid = paidKey ? localStorage.getItem(paidKey) === '1' : false;
        if (wasPaid) {
          setError(msg + ' — Press Generate again to retry (no extra charge).');
        } else {
          setError(msg);
        }
      }
    } finally {
      setIsPaying(false);
      setIsGenerating(false);
    }
  };

  const FileUploadSlot: FC<{
    file: ImageFileData | null;
    setFile: (f: ImageFileData | null) => void;
    label: string;
  }> = ({ file, setFile, label }) => (
    <div className="space-y-1.5">
      <label className="text-xs sm:text-sm font-medium text-zinc-300 ml-1 leading-tight">{label}</label>
      {file ? (
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-zinc-800">
          <img src={`data:${file.mimeType};base64,${file.data}`} className="w-full h-full object-cover" alt="Reference" />
          <button 
            onClick={() => setFile(null)} 
            className="absolute top-1 right-1 bg-black/50 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-20 sm:h-24 border-2 border-dashed border-zinc-800 rounded-2xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors cursor-pointer">
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange(setFile)} />
          <Upload size={18} className="text-zinc-500 mb-1" />
          <span className="text-[10px] sm:text-xs text-zinc-500 font-medium">{t('gen.upload')}</span>
        </label>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-4 pb-24 max-w-md mx-auto w-full">
      <BannerCarousel banners={PROMO_BANNERS} />

      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">{t('gen.title')}</h2>
          <button
            onClick={() => setShowHelp(true)}
            className="text-zinc-500 hover:text-indigo-400 transition-colors"
            title={t('gen.helpTitle')}
          >
            <HelpCircle size={20} />
          </button>
        </div>
        <p className="text-zinc-400 text-sm">
          {t('gen.desc')}
        </p>
      </div>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-sm w-full max-h-[80vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{t('gen.helpTitle')}</h3>
              <button onClick={() => setShowHelp(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">{t('gen.helpSteps')}</div>
            <div>
              <h4 className="text-sm font-semibold text-indigo-400 mb-1">{t('gen.helpTips')}</h4>
              <div className="text-sm text-zinc-400 whitespace-pre-line leading-relaxed">{t('gen.helpTipsList')}</div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-1">{t('gen.helpErrors')}</h4>
              <div className="text-sm text-zinc-400 whitespace-pre-line leading-relaxed">{t('gen.helpErrorList')}</div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-zinc-900/50 p-3 sm:p-4 rounded-3xl border border-zinc-800/50 backdrop-blur-sm space-y-3 sm:space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs sm:text-sm font-medium text-zinc-300 ml-1">{t('gen.prompt')}</label>
          <textarea
            value={prompt}
            onChange={(e) => { if (e.target.value.length <= MAX_PROMPT_LENGTH) setPrompt(e.target.value); }}
            maxLength={MAX_PROMPT_LENGTH}
            placeholder={t('gen.placeholder')}
            className="w-full h-24 sm:h-32 bg-zinc-950 border border-zinc-800 rounded-2xl p-3 sm:p-4 text-sm sm:text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all"
          />
          <div className={`text-right text-[10px] mr-1 ${prompt.length > MAX_PROMPT_LENGTH * 0.9 ? 'text-amber-400' : 'text-zinc-600'}`}>
            {prompt.length}/{MAX_PROMPT_LENGTH}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FileUploadSlot file={imageFile1} setFile={setImageFile1} label={t('gen.refPhoto')} />
          <FileUploadSlot file={imageFile2} setFile={setImageFile2} label={t('gen.refPhoto2')} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between ml-1">
            <label className="text-sm font-medium text-zinc-300">{t('gen.category')}</label>
          </div>
          <select 
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors ml-1"
        >
          <Settings2 size={16} />
          {showSettings ? t('gen.hideSettings') : t('gen.advSettings')}
        </button>

        {showSettings && (
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800/50">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 ml-1">{t('gen.ratio')}</label>
              <select 
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none"
              >
                {ASPECT_RATIOS.map(ratio => (
                  <option key={ratio} value={ratio}>{ratio}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 ml-1">{t('gen.resolution')}</label>
              <select 
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none"
              >
                {RESOLUTIONS.map(res => (
                  <option key={res} value={res}>{res}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center space-y-1.5">
            {error}
            {phantomRedirectUrl && (
              <a
                href={phantomRedirectUrl}
                className="block text-xs font-medium text-indigo-400 hover:text-indigo-300 underline"
              >
                Open in Phantom browser →
              </a>
            )}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isGenerating || isPaying || !prompt.trim() || !connected}
          className="w-full py-3 sm:py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-sm sm:text-lg shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
        >
          {isPaying ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              <span>{t('gen.paying', { cost: genCostSkr })}</span>
            </>
          ) : isGenerating ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              <span>{t('gen.generating')}</span>
            </>
          ) : !connected ? (
            <span>{t('gen.connectWallet')}</span>
          ) : (
            <>
              <Sparkles size={20} />
              <span>{t('gen.create', { cost: genCostSkr })}</span>
            </>
          )}
        </button>

        <p className="text-[11px] sm:text-xs text-amber-400 text-center leading-snug font-medium">
          {t('gen.patience')}
        </p>
      </div>

      {result && (
        <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 text-emerald-400 justify-center">
            <CheckCircle2 size={20} />
            <span className="font-medium">{t('gen.done')}</span>
          </div>
          <div className="relative w-full rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl">
            <img src={result} alt="Generated" className="w-full h-auto object-contain" />
          </div>
          <button 
            onClick={() => {
              setResult(null);
              setPrompt('');
            }}
            className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors"
          >
            {t('gen.createMore')}
          </button>
        </div>
      )}

      {/* Admin: Grant free generations */}
      {isAdmin && (
        <div className="bg-zinc-900/50 p-4 rounded-2xl border border-amber-800/50 space-y-3">
          <h3 className="text-sm font-bold text-amber-400">Admin: Grant Free Generations</h3>
          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-2.5">
            <input
              value={grantWallet}
              onChange={(e) => setGrantWallet(e.target.value)}
              placeholder="User wallet address"
              className="bg-transparent border-none outline-none flex-1 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <button
              onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) setGrantWallet(t); } catch {} }}
              className="text-zinc-500 hover:text-amber-400 transition-colors shrink-0 p-1"
              title="Paste"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/><line x1="12" y1="17" x2="20" y2="17"/></svg>
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={100}
              value={grantCount}
              onChange={(e) => setGrantCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              className="w-20 bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <button
              onClick={async () => {
                if (!grantWallet.trim()) { setGrantMsg('Enter wallet address'); return; }
                setGrantMsg('Granting...');
                const ok = await db.grantFreeGenerations(grantWallet.trim(), grantCount);
                setGrantMsg(ok ? `Granted ${grantCount} free generation(s) to ${grantWallet.slice(0, 8)}...` : 'Failed to grant');
              }}
              className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-colors"
            >
              Grant
            </button>
          </div>
          {grantMsg && <p className="text-xs text-amber-300">{grantMsg}</p>}
        </div>
      )}
    </div>
  );
};
