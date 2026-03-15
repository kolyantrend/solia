import React, { FC, useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Loader2, Sparkles, Image as ImageIcon, CheckCircle2, Settings2, Upload, X } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { useI18n } from '../i18n';
import * as db from '../lib/database';
import { transferSkrSplit, TREASURY_WALLET } from '../lib/solana';
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
const RESOLUTIONS = ['1K'];

interface ImageFileData {
  data: string;
  mimeType: string;
}

export const GenerateView: FC<{ onGenerate: (post: any) => void }> = ({ onGenerate }) => {
  const { t } = useI18n();
  const { publicKey, connected, sendTransaction } = useWallet();
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('Main');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('1K');
  const [showSettings, setShowSettings] = useState(true);
  const [imageFile1, setImageFile1] = useState<ImageFileData | null>(null);
  const [imageFile2, setImageFile2] = useState<ImageFileData | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paidForGeneration, setPaidForGeneration] = useState(
    () => sessionStorage.getItem('solia_paid_gen') === '1'
  );
  const markPaid = (v: boolean) => {
    setPaidForGeneration(v);
    if (v) sessionStorage.setItem('solia_paid_gen', '1');
    else sessionStorage.removeItem('solia_paid_gen');
  };

  const handleFileChange = (setter: (f: ImageFileData | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setter({ data: base64String, mimeType: file.type });
    };
    reader.readAsDataURL(file);
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

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });

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
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }

        if (!imageUrl) throw new Error(t('gen.errImage'));

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

        await db.grantBonusLikes(walletAddr, 10);
        db.markGenerationUsed(walletAddr);
        markPaid(false);
        onGenerate(newPost);
        return;
      } catch (err: any) {
        lastErr = err;
        const msg = err?.message || '';
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded')) {
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
      // Check sessionStorage directly — React state may be stale in async context
      const alreadyPaid = sessionStorage.getItem('solia_paid_gen') === '1';
      if (!alreadyPaid) {
        setIsPaying(true);

        // Build referral split: 80% treasury + 20% referrer
        const referrerWallet = await db.getReferrer(publicKey.toBase58());
        const recipients: { wallet: PublicKey; amount: number }[] = [];

        if (referrerWallet) {
          const treasuryAmount = Math.round(genCostSkr * 0.8 * 10) / 10;
          const referrerAmount = Math.round(genCostSkr * 0.2 * 10) / 10;
          recipients.push({ wallet: TREASURY_WALLET, amount: treasuryAmount });
          recipients.push({ wallet: new PublicKey(referrerWallet), amount: referrerAmount });
        } else {
          recipients.push({ wallet: TREASURY_WALLET, amount: genCostSkr });
        }

        const sig = await transferSkrSplit({
          fromWallet: publicKey,
          recipients,
          sendTransaction,
          connection,
        });

        // Record transaction history
        await db.recordTransaction({
          signature: sig,
          from_wallet: publicKey.toBase58(),
          type: 'generation',
          total_amount: genCostSkr,
          treasury_amount: referrerWallet ? Math.round(genCostSkr * 0.8 * 10) / 10 : genCostSkr,
          referrer_wallet: referrerWallet || undefined,
          referrer_amount: referrerWallet ? Math.round(genCostSkr * 0.2 * 10) / 10 : undefined,
        });

        setIsPaying(false);
        markPaid(true);
      }

      await runGeneration();
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || t('gen.errGenerate');
      const wasPaid = sessionStorage.getItem('solia_paid_gen') === '1';
      if (wasPaid) {
        setError(msg + ' — Press Generate again to retry (no extra charge).');
      } else {
        setError(msg);
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
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange(setFile)} />
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
        <h2 className="text-2xl font-bold tracking-tight">{t('gen.title')}</h2>
        <p className="text-zinc-400 text-sm">
          {t('gen.desc')}
        </p>
      </div>

      <div className="bg-zinc-900/50 p-3 sm:p-4 rounded-3xl border border-zinc-800/50 backdrop-blur-sm space-y-3 sm:space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs sm:text-sm font-medium text-zinc-300 ml-1">{t('gen.prompt')}</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('gen.placeholder')}
            className="w-full h-24 sm:h-32 bg-zinc-950 border border-zinc-800 rounded-2xl p-3 sm:p-4 text-sm sm:text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all"
          />
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
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
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
    </div>
  );
};
