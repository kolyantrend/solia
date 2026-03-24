/**
 * Banner Configuration
 * Edit this file to quickly change banners and links on the Feed page.
 * Each banner needs: id, imageUrl (1500x500 recommended), linkUrl
 */

export interface BannerConfig {
  id: number;
  imageUrl: string;
  linkUrl: string;
}

export const PROMO_BANNERS: BannerConfig[] = [
  {
    id: 101,
    imageUrl: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/SoliaX.jpg',
    linkUrl: 'https://x.com/SoliaLive',
  },
  {
    id: 102,
    imageUrl: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/soliaX3.png',
    linkUrl: 'https://x.com/SoliaLive',
  },
  {
    id: 103,
    imageUrl: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/SloiaX%20Car.png',
    linkUrl: 'https://x.com/SoliaLive',
  },
];

export const STATS_BANNERS: BannerConfig[] = [
  {
    id: 201,
    imageUrl: 'https://pbs.twimg.com/profile_banners/1536816010375974913/1768971674/1500x500',
    linkUrl: 'https://x.com/solanamobile',
  },
  {
    id: 202,
    imageUrl: 'https://pbs.twimg.com/profile_banners/1948544290323382273/1769483306/1080x360',
    linkUrl: 'https://x.com/Identity_Prism',
  },
  {
    id: 203,
    imageUrl: 'https://pbs.twimg.com/profile_banners/1446275363202502844/1769623165/1080x360',
    linkUrl: 'https://x.com/RadiantsDAO',
  },
];

export const BANNERS: BannerConfig[] = [
  {
    id: 1,
    imageUrl: 'https://pbs.twimg.com/profile_banners/1536816010375974913/1768971674/1500x500',
    linkUrl: 'https://x.com/solanamobile',
  },
  {
    id: 2,
    imageUrl: 'https://pbs.twimg.com/profile_banners/1499809254227812360/1758904705/1080x360',
    linkUrl: 'https://x.com/solana_devs',
  },
  {
    id: 3,
    imageUrl: 'https://pbs.twimg.com/profile_banners/951329744804392960/1765755849/1500x500',
    linkUrl: 'https://x.com/solana',
  },
  {
    id: 4,
    imageUrl: 'https://pbs.twimg.com/profile_banners/911130043837042688/1761473024/1080x360',
    linkUrl: 'https://x.com/kolyan_trend',
  },
  {
    id: 5,
    imageUrl: 'https://pbs.twimg.com/profile_banners/1484893291401433095/1723491149/1080x360',
    linkUrl: 'https://x.com/AlignNexus',
  },
  {
    id: 6,
    imageUrl: 'https://pbs.twimg.com/profile_banners/1446275363202502844/1769623165/1080x360',
    linkUrl: 'https://x.com/RadiantsDAO',
  },
];
