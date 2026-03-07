import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('⚠️ Supabase credentials missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (project root)');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    global: {
      fetch: (url, options = {}) => {
        const controller = new AbortController();
        const isStorage = typeof url === 'string' && url.includes('/storage/');
        const timeout = setTimeout(() => controller.abort(), isStorage ? 30000 : 8000);
        return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
      },
    },
  },
);
