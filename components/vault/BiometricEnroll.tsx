'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { isBiometricAvailable, registerBiometric } from '@/lib/webauthn';
import { wrapVaultKeyForBiometric } from '@/lib/biometric-key';
import { logAuditEvent } from '@/lib/audit';
import type { Profile } from '@/types/vault';

interface BiometricEnrollProps {
  profile: Profile;
}

export default function BiometricEnroll({ profile }: BiometricEnrollProps) {
  const [available, setAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(!!profile.webauthn_credential_id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const supabase = createClient();

  useEffect(() => {
    isBiometricAvailable().then(setAvailable);
  }, []);

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!masterPassword) return;
    setError('');
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Step 1: Register biometric credential
      const registration = await registerBiometric(user.id, user.email || '');

      // Step 2: Wrap vault key for biometric storage
      const wrapped = await wrapVaultKeyForBiometric(
        masterPassword,
        profile.kdf_salt,
        profile.kdf_iterations
      );

      // Step 3: Store in profiles
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          webauthn_credential_id: registration.credentialId,
          webauthn_public_key: registration.publicKey,
          webauthn_transports: registration.transports,
          biometric_vault_key_encrypted: wrapped.encryptedVaultKey,
          biometric_vault_key_iv: wrapped.encryptedVaultKeyIv,
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Step 4: Log audit event
      await logAuditEvent('biometric_enrolled');

      setEnrolled(true);
      setSuccess(true);
      setShowPasswordPrompt(false);
      setMasterPassword('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    setError('');
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          webauthn_credential_id: null,
          webauthn_public_key: null,
          webauthn_transports: null,
          biometric_vault_key_encrypted: null,
          biometric_vault_key_iv: null,
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      await logAuditEvent('biometric_removed');

      setEnrolled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setLoading(false);
    }
  }

  if (!available) return null;

  return (
    <section className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
      <div className="flex items-center gap-3">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1b4965" strokeWidth="1.5" className="flex-shrink-0">
          <path d="M12 10V14M18 12a6 6 0 11-12 0 6 6 0 0112 0z" />
          <path d="M7 3.34V5a3 3 0 003 3h4a3 3 0 003-3V3.34" />
          <path d="M12 22v-4" />
          <path d="M17 20.66V19a3 3 0 00-3-3h-4a3 3 0 00-3 3v1.66" />
        </svg>
        <div className="flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1b4965]">Biometric Unlock</h2>
          <p className="text-xs text-[#1b4965]/50">
            {enrolled
              ? 'Touch ID / Face ID is enabled'
              : 'Use Touch ID, Face ID, or Windows Hello to quick-unlock'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-3 rounded-sm border border-[#5fa8a0]/30 bg-[#5fa8a0]/10 px-4 py-3 text-sm text-[#5fa8a0]">
          Biometric unlock enabled successfully
        </div>
      )}

      <div className="mt-4">
        {enrolled ? (
          <button
            onClick={handleRemove}
            disabled={loading}
            className="rounded-sm border border-[#e76f51]/30 px-4 py-2.5 text-sm font-medium text-[#e76f51] hover:bg-[#e76f51]/10 disabled:opacity-50"
          >
            {loading ? 'Removing...' : 'Remove Biometric'}
          </button>
        ) : showPasswordPrompt ? (
          <form onSubmit={handleEnroll} className="space-y-3">
            <p className="text-sm text-[#1b4965]/60">
              Enter your master password to enable biometric unlock.
            </p>
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              className="block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-sm text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]"
              placeholder="Master password"
              required
              autoFocus
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded-sm bg-[#5fa8a0] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4d8f87] disabled:opacity-50"
              >
                {loading ? 'Setting up...' : 'Confirm & Enable'}
              </button>
              <button
                type="button"
                onClick={() => { setShowPasswordPrompt(false); setMasterPassword(''); setError(''); }}
                className="rounded-sm border border-[#1b4965]/15 px-4 py-2.5 text-sm text-[#1b4965]/70 hover:bg-[#1b4965]/5"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowPasswordPrompt(true)}
            className="rounded-sm bg-[#5fa8a0] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4d8f87]"
          >
            Enable Biometric Unlock
          </button>
        )}
      </div>
    </section>
  );
}
