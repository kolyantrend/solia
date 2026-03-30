![Solia Banner](https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/Git2.png)

# Solia - AI Content Monetization Platform on Solana!

A decentralized social platform for AI creators to monetize their content on the Solana blockchain. Create, share, and sell AI-generated images with SKR tokens. Built with React, Vite, and Supabase.

[![Twitter](https://img.shields.io/badge/Twitter-@SoliaLive-1DA1F2?style=flat&logo=twitter)](https://x.com/SoliaLive)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF?style=flat&logo=solana)](https://solana.com)

## Features

### Core Functionality
- **AI Image Generation** - Create unique images using advanced AI models with multi-provider fallback
- **Content Monetization** - Sell AI-generated images directly to buyers with SKR tokens
- **Social Feed** - Discover trending creations with smart Hot/New/Trends algorithms
- **Creator Profiles** - Customizable profiles with social media verification (X, Telegram, YouTube)
- **Analytics Dashboard** - Real-time platform statistics and insights
- **Top Creators Ticker** - Rotating showcase of trending artists

### Advanced Features
- **Smart Sorting Algorithms** - Time-decay scoring for natural content rotation
- **Referral System** - Bring new users and earn from their activity (15% on generations, 15% on purchases)
- **Follow System** - Build your creator network
- **Like & Comment** - Engage with the community
- **Drafts System** - Save generated images as drafts before publishing, persist across sessions
- **Post Preview** - Review generated images with Publish/Delete options before going live
- **Leaderboard** - Top creators by posts, likes, followers, and referrals with social links
- **Daily Like Limits** - Bot protection with bonus system (2 base + 8 per generation + 10 per purchase)
- **Transaction History** - Track all platform activity
- **Image Protection** - Download prevention with overlay shield
- **Multi-language** - 6 languages supported (EN, RU, ZH, HI, VI, JA)

### Monetization Model

**Image Generation Fees:**
- With referrer: 85% treasury + 15% referrer
- System referral (no ref link): 100% treasury

**Image Purchase Splits:**
- With referrer: 80% creator + 10% referrer + 10% treasury
- System referral (no ref link): 80% creator + 20% treasury
- Self-purchase: same splits apply

**Examples (100 SKR):**
- Generation (with referrer) = 85 SKR treasury + 15 SKR referrer
- Purchase (with referrer) = 80 SKR creator + 10 SKR referrer + 10 SKR treasury
- Purchase (system referral) = 80 SKR creator + 20 SKR treasury

**Like Bonuses:**
- +8 likes per generated image (to creator)
- +10 likes per purchased image (to buyer)
- +10 likes to referrer when their referral generates
- +15 likes to referrer when their referral purchases
- +5 likes to referrer per new invited user

**System Referral:** Users who visit `solia.live` without a `?ref=` code are automatically registered as system referrals (treasury). This means all referrer shares go to the treasury.

**Atomic Transactions:** Solana guarantees all transfers succeed or all fail - no partial payments

## Tech Stack

### Frontend
- **React 19** - Modern UI framework with latest features
- **TypeScript** - Type-safe development
- **Vite** - Lightning-fast build tool
- **Tailwind CSS v4** - Utility-first styling with custom Solana theme
- **Lucide React** - Beautiful icon library
- **Motion** - Smooth animations

### Mobile (Android)
- **Capacitor** - Native Android wrapper for Solana Mobile dApp Store
- **Deep Links** - Referral handling via `https://solia.live/?ref=CODE`
- **MWA** - Mobile Wallet Adapter support (Phantom, Solflare mobile)

### Blockchain
- **Solana Web3.js** - Blockchain interactions
- **Jupiter Unified Wallet Kit** - Multi-wallet support (Phantom, Solflare, MWA)
- **SPL Token** - SKR token operations

### Backend & Services
- **Supabase** - PostgreSQL database with real-time features
- **AI API** - Image generation engine with multi-provider fallback and key rotation
- **Twitter oEmbed API** - Profile verification
- **CoinGecko API** - Live crypto prices

## Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- Solana wallet (Phantom/Solflare)
- Supabase account
- AI API credentials

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/kolyantrend/solia.git
cd solia
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create `.env.local` from the example file:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys (see `.env.example` for all available options).

4. **Run development server**
```bash
npm run dev
```

5. **Build for production**
```bash
npm run build
```

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profiles (wallet, display_name, twitter, telegram, youtube, verified, ref_code) |
| `posts` | AI-generated images (author, image_url, prompt, category, likes_count) |
| `drafts` | Unpublished generated images (author, image_url, prompt, category) |
| `likes` | User engagement tracking |
| `comments` | Post discussions |
| `purchases` | Content purchase records |
| `follows` | Creator network graph |
| `referrals` | Referral tracking |
| `transactions` | Financial history |
| `daily_likes` | Bot protection system |

## Key Features Explained

### Feed Algorithm

| Sort | Window | Formula | Behavior |
|------|--------|---------|----------|
| **New** | All | `created_at DESC` | Always fresh, 3min cache |
| **Hot** | 6 hours | `(likes+1) / (hours+2)^1.5` | Fast rotation, engagement-driven |
| **Trends** | 24 hours | `(likes+1) / (hours+4)^1.1` | Viral content stays longer |

### Caching Strategy
- **Profile Cache** - 2 min TTL
- **Feed Cache** - 3 min TTL (single query for 200 posts, client-side scoring)
- **Stats Cache** - 5 min TTL

### Generation Flow
1. User pays SKR tokens for generation
2. AI generates image with automatic provider fallback
3. Image saved as draft in database
4. User previews result in fullscreen overlay
5. Publish to feed or delete (with confirmation)
6. Drafts persist across sessions and are visible in profile

## Mobile Support

- Solana Mobile Wallet Adapter integration
- Responsive design for all screen sizes
- Touch-optimized UI components

## Internationalization

Supported languages (6):
- English (en)
- Russian (ru)
- Chinese (zh)
- Hindi (hi)
- Vietnamese (vi)
- Japanese (ja)

## Development

### Type checking
```bash
npm run lint
```

### Project structure
```
src/
├── config/
│   └── banners.ts          # Banner & promo banner config
├── components/
│   ├── Layout.tsx           # App shell with navigation
│   ├── BannerCarousel.tsx   # Rotating banners
│   ├── CryptoTicker.tsx     # Live crypto prices
│   └── TopCreatorsTicker.tsx
├── views/
│   ├── FeedView.tsx         # Main feed with smart algorithms
│   ├── GenerateView.tsx     # AI image generation with drafts
│   ├── LeaderboardView.tsx  # Top creators / likes / followers / referrals
│   ├── StatsView.tsx        # Analytics dashboard
│   └── ProfileView.tsx      # User profiles with drafts tab
├── lib/
│   ├── database.ts          # Supabase queries with caching
│   ├── solana.ts            # SKR token transfers & config
│   ├── supabase.ts          # Supabase client
│   └── utils.ts             # Helper functions
├── App.tsx                  # Root component
├── theme.tsx                # Theme context (dark/light)
├── i18n.tsx                 # Internationalization (6 languages)
├── likes.ts                 # Like system with bot protection
└── index.css                # Theme variables & styles
```

## Security Notes

**Protected by .gitignore (never committed):**
- `.env.local` - API keys & secrets
- `node_modules/` - Dependencies
- `dist/` - Build output
- IDE config directories

**Additional protections:**
- All secrets via environment variables
- Image download protection (CSS + JS overlay)
- Daily like limits with bonus system
- Atomic Solana transactions
- Referral validation

## License

MIT

## Links

- [Twitter](https://x.com/SoliaLive)
- [Solana Explorer](https://solscan.io/token/SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3)

## Roadmap

- [x] Mobile app (Android APK + PWA)
- [x] Advanced AI models integration
- [x] MWA wallet support (Phantom, Jupiter, Solflare)
- [x] Drafts system with post preview
- [x] Followers leaderboard
- [ ] Creator subscriptions
- [ ] DAO governance
- [ ] Cross-chain support

---

**Built with love on Solana**
