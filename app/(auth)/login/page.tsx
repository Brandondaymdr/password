'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { normalizeAuthError } from '@/lib/auth-errors';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ShorestackLogo from '@/components/ui/ShorestackLogo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(normalizeAuthError(authError.message));
        return;
      }

      // Redirect to dashboard — middleware will check for master password
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    setError('');
    setMagicLinkSent(false);
    if (!email) {
      setError('Enter your email first');
      return;
    }
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });

      if (authError) {
        setError(normalizeAuthError(authError.message));
        return;
      }

      setError('');
      setMagicLinkSent(true);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-sand">
      <div className="w-full max-w-md space-y-8">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <ShorestackLogo variant="horizontal" subbrand="vault" size="md" />
          </div>
          <p className="text-sm text-[#1b4965]/60">Your passwords, locked down.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {magicLinkSent && (
            <div className="rounded-sm border border-[#5fa8a0]/30 bg-[#5fa8a0]/10 px-4 py-3 text-sm text-[#5fa8a0]">
              Check your email for a magic login link!
            </div>
          )}
          {error && (
            <div className="rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#1b4965]">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#1b4965]">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-sm bg-[#5fa8a0] px-4 py-3 font-medium text-white transition-colors hover:bg-[#4d8f87] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={loading}
            className="w-full rounded-sm border border-[#1b4965]/15 px-4 py-3 font-medium text-[#1b4965] transition-colors hover:bg-[#1b4965]/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send Magic Link
          </button>
        </form>

        <p className="text-center text-sm text-[#1b4965]/60">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-[#5fa8a0] hover:text-[#4d8f87]">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
