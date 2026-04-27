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
    linkUrl: 'https://solia.live/',
  },
  {
    id: 102,
    imageUrl: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/soliaX3.png',
    linkUrl: 'https://x.com/SoliaLive',
  },
  {
    id: 103,
    imageUrl: 'https://pub-961550f0079e4ff5a4210868b6523d47.r2.dev/SloiaX%20Car.png',
    linkUrl: 'https://t.me/SoliaApp',
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
    imageUrl: 'https://pbs.twimg.com/profile_banners/1151639614047653888/1638887165/1080x360',
    linkUrl: 'https://x.com/solanalabs',
  },
  {
    id: 6,
    imageUrl: 'https://pbs.twimg.com/profile_banners/1446275363202502844/1769623165/1080x360',
    linkUrl: 'https://x.com/RadiantsDAO',
  },
  {
    id: 7,
    imageUrl: 'https://pbs.twimg.com/profile_banners/1261335549215989760/1773844633/1500x500',
    linkUrl: 'https://polymarket.com/?r=kolyantrend',
  },
  {
    id: 8,
    imageUrl: 'https://pbs.twimg.com/profile_banners/2349577974/1737473085/1500x500',
    linkUrl: 'https://x.com/incubator',
  },
];
