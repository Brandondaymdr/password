'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { deriveVaultKey } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMaster, setConfirmMaster] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [strength, setStrength] = useState(0);
  const router = useRouter();
  const supabase = createClient();

  function evaluateStrength(pw: string): number {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    return Math.min(score, 5);
  }

  function handleMasterChange(value: string) {
    setMasterPassword(value);
    setStrength(evaluateStrength(value));
  }

  const strengthLabels = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const strengthColors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-400', 'bg-emerald-500'];

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (masterPassword !== confirmMaster) {
      setError('Master passwords do not match');
      return;
    }

    if (masterPassword.length < 10) {
      setError('Master password must be at least 10 characters');
      return;
    }

    setLoading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated. Please sign in again.');
        return;
      }

      // Fetch the profile (auto-created by trigger with kdf_salt)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('kdf_salt, kdf_iterations')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        setError('Failed to load profile. Please try again.');
        return;
      }

      // Derive vault key in the browser — NEVER sent to server
      const vaultKey = await deriveVaultKey(
        masterPassword,
        profile.kdf_salt,
        profile.kdf_iterations
      );

      // Store vault key in memory session
      VaultSession.set(vaultKey);

      // Save hint if provided
      if (hint.trim()) {
        await supabase
          .from('profiles')
          .update({ hint: hint.trim() })
          .eq('id', user.id);
      }

      // Redirect to dashboard — vault is now unlocked
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Failed to set up master password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Create Master Password</h1>
          <p className="mt-2 text-sm text-gray-400">
            This password encrypts your vault. It is <strong className="text-gray-200">never stored anywhere</strong> —
            if you forget it, your data cannot be recovered.
          </p>
        </div>

        <form onSubmit={handleSetup} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="masterPassword" className="block text-sm font-medium text-gray-300">
              Master Password
            </label>
            <input
              id="masterPassword"
              type="password"
              required
              value={masterPassword}
              onChange={(e) => handleMasterChange(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Min 10 characters — make it strong!"
            />
            {/* Strength meter */}
            {masterPassword && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        level <= strength ? strengthColors[strength] : 'bg-gray-700'
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">{strengthLabels[strength]}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="confirmMaster" className="block text-sm font-medium text-gray-300">
              Confirm Master Password
            </label>
            <input
              id="confirmMaster"
              type="password"
              required
              value={confirmMaster}
              onChange={(e) => setConfirmMaster(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Re-enter master password"
            />
          </div>

          <div>
            <label htmlFor="hint" className="block text-sm font-medium text-gray-300">
              Password Hint <span className="text-gray-500">(optional)</span>
            </label>
            <input
              id="hint"
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="A hint to help you remember"
            />
            <p className="mt-1 text-xs text-gray-500">This hint will be stored unencrypted. Do not include your password.</p>
          </div>

          <div className="rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-3">
            <p className="text-sm text-amber-300">
              <strong>Important:</strong> We cannot recover your master password. There is no reset option.
              Store it somewhere safe outside of this app.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || strength < 3}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Setting up vault...' : 'Create Vault'}
          </button>
        </form>
      </div>
    </div>
  );
}
