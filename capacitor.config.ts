import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'live.solia.app',
  appName: 'Solia',
  webDir: 'dist',
  server: {
    // Allow all origins for Supabase / RPC calls
    androidScheme: 'https',
  },
  plugins: {
    App: {
      // Deep link handling for referrals: solia.live/ref/CODE
    },
  },
  android: {
    // Allow mixed content for development
    allowMixedContent: true,
  },
};

export default config;
