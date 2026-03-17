// ============================================
// ShoreStack Vault — Supabase Client
// ============================================

import { createBrowserClient } from '@supabase/ssr';

// Read env vars at module level but do NOT throw — Next.js evaluates
// this file during static analysis/build when env vars may be absent.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Browser client — used in client components.
// Throws at runtime (not build time) if env vars are missing.
export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
