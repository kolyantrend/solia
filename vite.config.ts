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
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
        },
      },
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
        '/api/gemini-proxy': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: (p: string) => {
            const model = p.replace(/^\/api\/gemini-proxy\//, '');
            return `/v1beta/models/${model}:generateContent?key=${env.AI_PRIMARY_KEY || ''}`;
          },
        },
      },
    },
  };
});
