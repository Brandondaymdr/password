'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { normalizeAuthError } from '@/lib/auth-errors';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ShorestackLogo from '@/components/ui/ShorestackLogo';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/setup`,
        },
      });

      if (authError) {
        setError(normalizeAuthError(authError.message));
        return;
      }

      // Redirect to master password setup
      router.push('/setup');
      router.refresh();
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
          <p className="text-sm text-[#1b4965]/60">Start protecting your passwords</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignup} className="space-y-4">
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
              Account Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]"
              placeholder="Min 8 characters"
            />
            <p className="mt-1 text-xs text-[#1b4965]/60">This is your account login password, NOT your vault master password.</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#1b4965]">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]"
              placeholder="Confirm password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-sm bg-[#5fa8a0] px-4 py-3 font-medium text-white transition-colors hover:bg-[#4d8f87] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-[#1b4965]/60">
          Already have an account?{' '}
          <Link href="/login" className="text-[#5fa8a0] hover:text-[#4d8f87]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
