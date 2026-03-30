import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({
        include: ['buffer', 'crypto', 'stream', 'util'],
        globals: {
          Buffer: true,
        },
      }),
    ],
    define: {
      'process.env.AI_PRIMARY_KEY': JSON.stringify(env.AI_PRIMARY_KEY),
      'process.env.AI_PRIMARY_KEY_2': JSON.stringify(env.AI_PRIMARY_KEY_2 || ''),
      'process.env.AI_SECONDARY_TOKEN': JSON.stringify(env.AI_SECONDARY_TOKEN || ''),
      'process.env.AI_SECONDARY_TOKEN_2': JSON.stringify(env.AI_SECONDARY_TOKEN_2 || ''),
      'process.env.AI_SECONDARY_TOKEN_3': JSON.stringify(env.AI_SECONDARY_TOKEN_3 || ''),
      'process.env.AI_PRIMARY_MODEL': JSON.stringify(env.AI_PRIMARY_MODEL || ''),
      'process.env.AI_SECONDARY_URL': JSON.stringify(env.AI_SECONDARY_URL || ''),
      'process.env.AI_SECONDARY_MODEL': JSON.stringify(env.AI_SECONDARY_MODEL || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/ai-proxy': {
          target: env.AI_SECONDARY_URL || 'https://localhost',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/ai-proxy/, ''),
        },
      },
    },
  };
});
