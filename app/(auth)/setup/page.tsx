'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { deriveVaultKey, createVaultVerifier } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import { useRouter } from 'next/navigation';
import ShorestackLogo from '@/components/ui/ShorestackLogo';

export default function SetupPage() {
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMaster, setConfirmMaster] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [strength, setStrength] = useState(0);
  const router = useRouter();
  const supabase = createClient();

  // Redirect to dashboard if user already completed setup
  useEffect(() => {
    async function checkSetup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('vault_verifier')
        .eq('id', user.id)
        .single();
      if (profile?.vault_verifier) {
        router.push('/dashboard');
      }
    }
    checkSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const strengthColors = ['', 'bg-[#e76f51]', 'bg-[#d97706]', 'bg-[#f59e0b]', 'bg-[#16a34a]', 'bg-[#16a34a]'];

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

      // Create vault verifier — encrypted known string to verify password on unlock
      const { encrypted: verifier, iv: verifierIv } = await createVaultVerifier(vaultKey);

      // Save verifier (and hint if provided) to profile
      const profileUpdate: Record<string, string> = {
        vault_verifier: verifier,
        vault_verifier_iv: verifierIv,
      };
      if (hint.trim()) {
        profileUpdate.hint = hint.trim();
      }
      await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id);

      // Clear master password from React state immediately after key derivation
      setMasterPassword('');
      setConfirmMaster('');

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
    <div className="flex min-h-screen items-center justify-center px-4 bg-sand">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <ShorestackLogo variant="horizontal" subbrand="vault" size="md" />
          </div>
          <h1 className="text-2xl font-bold text-[#1b4965]">Create Master Password</h1>
          <p className="mt-2 text-sm text-[#1b4965]/60">
            This password encrypts your vault. It is <strong className="text-[#1b4965]/80">never stored anywhere</strong> —
            if you forget it, your data cannot be recovered.
          </p>
        </div>

        <form onSubmit={handleSetup} className="space-y-4">
          {error && (
            <div className="rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="masterPassword" className="block text-sm font-medium text-[#1b4965]">
              Master Password
            </label>
            <input
              id="masterPassword"
              type="password"
              required
              value={masterPassword}
              onChange={(e) => handleMasterChange(e.target.value)}
              className="mt-1 block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]"
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
                        level <= strength ? strengthColors[strength] : 'bg-[#1b4965]/15'
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-[#1b4965]/60">{strengthLabels[strength]}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="confirmMaster" className="block text-sm font-medium text-[#1b4965]">
              Confirm Master Password
            </label>
            <input
              id="confirmMaster"
              type="password"
              required
              value={confirmMaster}
              onChange={(e) => setConfirmMaster(e.target.value)}
              className="mt-1 block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]"
              placeholder="Re-enter master password"
            />
          </div>

          <div>
            <label htmlFor="hint" className="block text-sm font-medium text-[#1b4965]">
              Password Hint <span className="text-[#1b4965]/60">(optional)</span>
            </label>
            <input
              id="hint"
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              className="mt-1 block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]"
              placeholder="A hint to help you remember"
            />
            <p className="mt-1 text-xs text-[#1b4965]/60">This hint will be stored unencrypted. Do not include your password.</p>
          </div>

          <div className="rounded-sm border border-[#d97706]/30 bg-[#d97706]/10 px-4 py-3">
            <p className="text-sm text-[#d97706]">
              <strong>Important:</strong> We cannot recover your master password. There is no reset option.
              Store it somewhere safe outside of this app.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || strength < 3}
            className="w-full rounded-sm bg-[#5fa8a0] px-4 py-3 font-medium text-white transition-colors hover:bg-[#4d8f87] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Setting up vault...' : 'Create Vault'}
          </button>
        </form>
      </div>
    </div>
  );
}
