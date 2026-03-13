// ============================================
// ShoreStack Vault Extension — Supabase Client
// ============================================
// Extension-specific Supabase client.
// Auth session is stored in chrome.storage.session (cleared on browser close).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// These come from the web app's environment — hardcoded for the extension build.
// The anon key is a public key (safe to embed in client code).
const SUPABASE_URL = 'https://qdhwgzftpycdmovyniec.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Use chrome.storage.session for token persistence in the extension
      storage: {
        getItem: async (key: string): Promise<string | null> => {
          const result = await chrome.storage.session.get(key);
          return result[key] ?? null;
        },
        setItem: async (key: string, value: string): Promise<void> => {
          await chrome.storage.session.set({ [key]: value });
        },
        removeItem: async (key: string): Promise<void> => {
          await chrome.storage.session.remove(key);
        },
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return supabaseInstance;
}
