'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/lib/supabase';
import { deriveVaultKey, encryptItem, decryptItem, createVaultVerifier, generateSearchIndex, generateSalt, encryptFilename, decryptFilename } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import { useRouter, useSearchParams } from 'next/navigation';
import PricingCards from '@/components/vault/PricingCards';
import type { Profile, VaultItemRow, VaultDocumentRow, AuditLogRow, DecryptedItemData } from '@/types/vault';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="animate-pulse text-gray-400">Loading settings...</div></div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Change master password
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [changePwError, setChangePwError] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // Delete
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  // Upgrade success
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    loadSettings();
    if (searchParams.get('upgraded') === 'true') {
      setShowUpgradeSuccess(true);
      // Remove query param from URL without reload
      window.history.replaceState({}, '', '/settings');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSettings() {
    if (!VaultSession.isUnlocked()) { router.push('/dashboard'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profileData) setProfile(profileData);

    // Load recent audit logs
    const { data: logs } = await supabase
      .from('vault_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (logs) setAuditLogs(logs);

    setLoading(false);
  }

  async function handleChangeMasterPassword(e: React.FormEvent) {
    e.preventDefault();
    setChangePwError('');

    if (newPw !== confirmNewPw) { setChangePwError('New passwords do not match'); return; }
    if (newPw.length < 10) { setChangePwError('Master password must be at least 10 characters'); return; }
    if (!profile) return;

    setChangePwLoading(true);
    try {
      // Verify current password by deriving key
      const oldKey = await deriveVaultKey(currentPw, profile.kdf_salt, profile.kdf_iterations);

      // Generate a fresh KDF salt for the new password (best practice)
      const newSalt = generateSalt();
      const newKey = await deriveVaultKey(newPw, newSalt, profile.kdf_iterations);

      // --- Re-encrypt all vault items ---
      const { data: rows } = await supabase.from('vault_items').select('*');
      if (rows) {
        for (const row of rows as VaultItemRow[]) {
          try {
            const decrypted = await decryptItem(row.encrypted_data, row.iv, oldKey);
            const { encrypted, iv } = await encryptItem(decrypted, newKey);
            // Regenerate search index with new key (HMAC is key-dependent)
            const itemData = decrypted as DecryptedItemData;
            const name = 'name' in itemData ? (itemData as { name: string }).name : '';
            const searchIndex = name ? await generateSearchIndex(name, newKey) : row.search_index;
            await supabase.from('vault_items').update({
              encrypted_data: encrypted,
              iv,
              search_index: searchIndex,
            }).eq('id', row.id);
          } catch {
            setChangePwError('Failed to decrypt an item with the current password. Aborting.');
            setChangePwLoading(false);
            return;
          }
        }
      }

      // --- Re-encrypt all vault documents (filenames + file keys) ---
      const { data: docRows } = await supabase.from('vault_documents').select('*');
      if (docRows) {
        for (const doc of docRows as VaultDocumentRow[]) {
          try {
            // Decrypt filename with old key
            const filenameIv = doc.file_name_iv || doc.file_iv;
            const filename = await decryptFilename(doc.file_name_encrypted, filenameIv, oldKey);
            // Re-encrypt filename with new key
            const newEncryptedName = await encryptFilename(filename, newKey);

            // Decrypt file key with old vault key, re-encrypt with new vault key
            // file_key_encrypted contains: keyIv (12 bytes) + encrypted AES key
            const combinedKeyData = new Uint8Array(Uint8Array.from(atob(doc.file_key_encrypted), c => c.charCodeAt(0)).buffer);
            const keyIv = combinedKeyData.slice(0, 12);
            const encryptedFileKey = combinedKeyData.slice(12);
            const rawFileKey = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: keyIv },
              oldKey,
              encryptedFileKey
            );
            const newKeyIv = crypto.getRandomValues(new Uint8Array(12));
            const newEncryptedFileKey = await crypto.subtle.encrypt(
              { name: 'AES-GCM', iv: newKeyIv },
              newKey,
              rawFileKey
            );
            const newCombined = new Uint8Array(newKeyIv.length + new Uint8Array(newEncryptedFileKey).length);
            newCombined.set(newKeyIv);
            newCombined.set(new Uint8Array(newEncryptedFileKey), newKeyIv.length);
            const newFileKeyEncrypted = btoa(String.fromCharCode(...newCombined));

            await supabase.from('vault_documents').update({
              file_name_encrypted: newEncryptedName.encrypted,
              file_name_iv: newEncryptedName.iv,
              file_key_encrypted: newFileKeyEncrypted,
            }).eq('id', doc.id);
          } catch {
            setChangePwError('Failed to re-encrypt a document. Aborting.');
            setChangePwLoading(false);
            return;
          }
        }
      }

      // --- Re-create vault verifier with the new key ---
      const { encrypted: newVerifier, iv: newVerifierIv } = await createVaultVerifier(newKey);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({
            kdf_salt: newSalt,
            vault_verifier: newVerifier,
            vault_verifier_iv: newVerifierIv,
            // Clear biometric wrapping — user must re-enroll after password change
            biometric_vault_key_encrypted: null,
            biometric_vault_key_iv: null,
            webauthn_credential_id: null,
            webauthn_public_key: null,
            webauthn_transports: null,
          })
          .eq('id', user.id);
      }

      // Update session with new key
      VaultSession.set(newKey);

      // Audit log
      if (user) await supabase.from('vault_audit_log').insert({ user_id: user.id, action: 'edit' });

      setShowChangePw(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmNewPw('');
      alert('Master password changed successfully. All items and documents have been re-encrypted.');
    } catch {
      setChangePwError('Current master password is incorrect.');
    } finally {
      setChangePwLoading(false);
    }
  }

  async function handleExportVault() {
    const vaultKey = VaultSession.get();
    if (!vaultKey) return;

    setExporting(true);
    try {
      const { data: rows } = await supabase.from('vault_items').select('*');
      if (!rows) return;

      const exportData = [];
      for (const row of rows as VaultItemRow[]) {
        try {
          const data = await decryptItem(row.encrypted_data, row.iv, vaultKey);
          exportData.push({ type: row.item_type, favorite: row.favorite, ...data as object });
        } catch { /* skip */ }
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shorestack-vault-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('vault_audit_log').insert({ user_id: user.id, action: 'export' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE') return;

    try {
      // Call the server-side deletion endpoint that actually deletes everything
      const res = await fetch('/api/account/delete', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to delete account. Please try again or contact support.');
        return;
      }

      // Clear local state and sign out
      VaultSession.lock();
      await supabase.auth.signOut();
      router.push('/login');
    } catch {
      alert('Account deletion failed. Please try again.');
    }
  }

  async function handleManageBilling() {
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to open billing portal');
      }
    } catch {
      alert('Failed to open billing portal');
    }
  }

  const inputClass = 'block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0] text-sm';

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-sand"><div className="animate-pulse text-[#1b4965]/60">Loading settings...</div></div>;
  }

  return (
    <div className="min-h-screen bg-sand">
      <header className="border-b border-[#1b4965]/15 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <button onClick={() => router.push('/dashboard')} className="text-[#1b4965]/60 hover:text-[#1b4965]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-[#1b4965]">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        {/* Upgrade Success Banner */}
        {showUpgradeSuccess && (
          <div className="flex items-center justify-between rounded-sm border border-[#16a34a]/30 bg-[#16a34a]/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-[#16a34a]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <span className="text-sm font-medium text-[#16a34a]">Your plan has been upgraded! It may take a moment to reflect.</span>
            </div>
            <button onClick={() => { setShowUpgradeSuccess(false); loadSettings(); }} className="text-sm text-[#16a34a] hover:text-[#16a34a]/80">Refresh</button>
          </div>
        )}

        {/* Account Info */}
        <section className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1b4965]">Account</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-[#1b4965]/60">Plan</span><span className="capitalize text-[#5fa8a0]">{profile?.plan || 'personal'}</span></div>
            <div className="flex justify-between"><span className="text-[#1b4965]/60">KDF Iterations</span><span className="font-mono text-[#1b4965]">{profile?.kdf_iterations?.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-[#1b4965]/60">Password Hint</span><span className="text-[#1b4965]">{profile?.hint || 'None set'}</span></div>
          </div>
        </section>

        {/* Subscription & Pricing */}
        <section className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1b4965]">Subscription</h2>
          <PricingCards currentPlan={profile?.plan || 'personal'} onManageBilling={handleManageBilling} />
        </section>

        {/* Change Master Password */}
        <section className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1b4965]">Master Password</h2>
            <button onClick={() => setShowChangePw(!showChangePw)} className="text-sm text-[#5fa8a0] hover:text-[#4d8f87]">
              {showChangePw ? 'Cancel' : 'Change'}
            </button>
          </div>
          {showChangePw && (
            <form onSubmit={handleChangeMasterPassword} className="mt-4 space-y-3">
              {changePwError && <div className="rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">{changePwError}</div>}
              <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={inputClass} placeholder="Current master password" required />
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputClass} placeholder="New master password (min 10 chars)" required />
              <input type="password" value={confirmNewPw} onChange={(e) => setConfirmNewPw(e.target.value)} className={inputClass} placeholder="Confirm new master password" required />
              <div className="rounded-sm border border-[#d97706]/30 bg-[#d97706]/10 px-4 py-3 text-sm text-[#d97706]">
                This will re-encrypt all vault items with the new password. Do not close the browser during this process.
              </div>
              <button type="submit" disabled={changePwLoading} className="rounded-sm bg-[#5fa8a0] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4d8f87] disabled:opacity-50">
                {changePwLoading ? 'Re-encrypting vault...' : 'Change Master Password'}
              </button>
            </form>
          )}
        </section>

        {/* Biometric Unlock — disabled until server-side WebAuthn is implemented */}
        {/* TODO: Re-enable once WebAuthn ceremony is verified server-side (see SHORESTACK-VAULT-FIX-PLAN.md) */}

        {/* Export */}
        <section className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#1b4965]">Export Vault</h2>
          <p className="mb-4 text-sm text-[#1b4965]/60">Download a decrypted JSON backup of all vault items. Keep this file secure.</p>
          <button onClick={handleExportVault} disabled={exporting} className="rounded-sm border border-[#1b4965]/15 px-4 py-2.5 text-sm font-medium text-[#1b4965]/70 hover:bg-[#1b4965]/5 disabled:opacity-50">
            {exporting ? 'Exporting...' : 'Export as JSON'}
          </button>
        </section>

        {/* Audit Log */}
        <section className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1b4965]">Recent Activity</h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-[#1b4965]/60">No activity logged yet.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                    log.action === 'unlock' ? 'bg-[#3b82f6]/20 text-[#3b82f6]' :
                    log.action === 'create' ? 'bg-[#16a34a]/20 text-[#16a34a]' :
                    log.action === 'edit' ? 'bg-[#d97706]/20 text-[#d97706]' :
                    log.action === 'delete' ? 'bg-[#e76f51]/20 text-[#e76f51]' :
                    log.action === 'export' ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]' :
                    'bg-[#1b4965]/10 text-[#1b4965]/60'
                  }`}>
                    {log.action}
                  </span>
                  <span className="text-xs text-[#1b4965]/40">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger Zone */}
        <section className="rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#e76f51]">Danger Zone</h2>
          <p className="mb-4 text-sm text-[#1b4965]/60">Permanently delete your account and all vault data. This cannot be undone.</p>
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)} className="rounded-sm border border-[#e76f51]/30 px-4 py-2.5 text-sm font-medium text-[#e76f51] hover:bg-[#e76f51]/10">
              Delete Account
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[#e76f51]">Type <strong>DELETE</strong> to confirm:</p>
              <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} className={`${inputClass} border-[#e76f51]/30`} placeholder="DELETE" />
              <div className="flex gap-3">
                <button onClick={handleDeleteAccount} disabled={deleteConfirm !== 'DELETE'} className="rounded-sm bg-[#e76f51] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#d65a3e] disabled:opacity-50">
                  Permanently Delete
                </button>
                <button onClick={() => { setShowDelete(false); setDeleteConfirm(''); }} className="rounded-sm border border-[#1b4965]/15 px-4 py-2.5 text-sm text-[#1b4965]/70 hover:bg-[#1b4965]/5">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
