'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/lib/supabase';
import { deriveVaultKey, encryptItem, decryptItem, createVaultVerifier, generateSearchIndex, generateSalt, encryptFilename, decryptFilename, verifyVaultKey } from '@/lib/crypto';
import { logAuditEvent } from '@/lib/audit';
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
  const [changePwSuccess, setChangePwSuccess] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [rekeyProgress, setRekeyProgress] = useState<{ phase: string; current: number; total: number } | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportError, setExportError] = useState('');

  // Delete
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Billing
  const [billingError, setBillingError] = useState('');

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
    setChangePwSuccess('');
    setRekeyProgress(null);

    if (newPw !== confirmNewPw) { setChangePwError('New passwords do not match'); return; }
    if (newPw.length < 10) { setChangePwError('Master password must be at least 10 characters'); return; }
    if (!profile) return;

    setChangePwLoading(true);
    try {
      // =====================================================================
      // AUDIT FIX C2: Two-phase atomic rekey
      //
      // Phase 1 (in-memory): Derive keys, decrypt ALL items, re-encrypt ALL
      //   items with new key — collecting every update payload in memory.
      //   If ANY item fails to decrypt/re-encrypt, abort before touching DB.
      //
      // Phase 2 (write): Write all re-encrypted items to Supabase. Only
      //   update the profile (salt/verifier) AFTER every item is confirmed
      //   written. If any write fails, roll back by re-writing failed items
      //   with the old ciphertext (which still works with the old key that
      //   remains active until the profile is updated).
      // =====================================================================

      // --- Derive old and new vault keys ---
      setRekeyProgress({ phase: 'Verifying current password...', current: 0, total: 0 });
      const oldKey = await deriveVaultKey(currentPw, profile.kdf_salt, profile.kdf_iterations);

      setRekeyProgress({ phase: 'Deriving new vault key...', current: 0, total: 0 });
      const newSalt = generateSalt();
      const newKey = await deriveVaultKey(newPw, newSalt, profile.kdf_iterations);

      // =====================================================================
      // PHASE 1: Re-encrypt everything in memory
      // =====================================================================

      // --- Phase 1a: Re-encrypt vault items in memory ---
      const { data: rows } = await supabase.from('vault_items').select('*');
      const itemUpdates: Array<{
        id: string;
        newData: { encrypted_data: string; iv: string; search_index: string | null };
        oldData: { encrypted_data: string; iv: string; search_index: string | null };
      }> = [];

      if (rows && rows.length > 0) {
        const typedRows = rows as VaultItemRow[];
        const totalItems = typedRows.length;
        for (let i = 0; i < totalItems; i++) {
          const row = typedRows[i];
          setRekeyProgress({ phase: 'Re-encrypting vault items...', current: i + 1, total: totalItems });
          try {
            const decrypted = await decryptItem(row.encrypted_data, row.iv, oldKey);
            const { encrypted, iv } = await encryptItem(decrypted, newKey);
            const itemData = decrypted as DecryptedItemData;
            const name = 'name' in itemData ? (itemData as { name: string }).name : '';
            const searchIndex = name ? await generateSearchIndex(name, newKey) : row.search_index;
            itemUpdates.push({
              id: row.id,
              newData: { encrypted_data: encrypted, iv, search_index: searchIndex },
              oldData: { encrypted_data: row.encrypted_data, iv: row.iv, search_index: row.search_index },
            });
          } catch {
            setChangePwError('Failed to decrypt a vault item with the current password. No changes have been made.');
            setChangePwLoading(false);
            setRekeyProgress(null);
            return;
          }
        }
      }

      // --- Phase 1b: Re-encrypt vault documents in memory ---
      const { data: docRows } = await supabase.from('vault_documents').select('*');
      const docUpdates: Array<{
        id: string;
        newData: { file_name_encrypted: string; file_name_iv: string; file_key_encrypted: string };
        oldData: { file_name_encrypted: string; file_name_iv: string; file_key_encrypted: string };
      }> = [];

      if (docRows && docRows.length > 0) {
        const typedDocs = docRows as VaultDocumentRow[];
        const totalDocs = typedDocs.length;
        for (let i = 0; i < totalDocs; i++) {
          const doc = typedDocs[i];
          setRekeyProgress({ phase: 'Re-encrypting documents...', current: i + 1, total: totalDocs });
          try {
            // Decrypt filename with old key
            const filenameIv = doc.file_name_iv || doc.file_iv;
            const filename = await decryptFilename(doc.file_name_encrypted, filenameIv, oldKey);
            // Re-encrypt filename with new key
            const newEncryptedName = await encryptFilename(filename, newKey);

            // Decrypt file key with old vault key, re-encrypt with new vault key
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

            docUpdates.push({
              id: doc.id,
              newData: {
                file_name_encrypted: newEncryptedName.encrypted,
                file_name_iv: newEncryptedName.iv,
                file_key_encrypted: newFileKeyEncrypted,
              },
              oldData: {
                file_name_encrypted: doc.file_name_encrypted,
                file_name_iv: doc.file_name_iv || doc.file_iv,
                file_key_encrypted: doc.file_key_encrypted,
              },
            });
          } catch {
            setChangePwError('Failed to re-encrypt a document in memory. No changes have been made.');
            setChangePwLoading(false);
            setRekeyProgress(null);
            return;
          }
        }
      }

      // =====================================================================
      // PHASE 2: Write all re-encrypted data to Supabase
      //
      // Strategy: Write items first, then documents. Track which writes
      // succeed. If any fail, roll back ALL successful writes to old
      // ciphertext so the vault remains consistent with the old key.
      // Only update the profile (salt/verifier) after ALL writes succeed.
      // =====================================================================

      const totalWrites = itemUpdates.length + docUpdates.length;
      let completedWrites = 0;
      const failedItemIds: Set<string> = new Set();
      const failedDocIds: Set<string> = new Set();
      const succeededItemIds: string[] = [];
      const succeededDocIds: string[] = [];

      // --- Phase 2a: Write vault items ---
      for (const update of itemUpdates) {
        setRekeyProgress({ phase: 'Writing re-encrypted items...', current: ++completedWrites, total: totalWrites });
        const { error } = await supabase.from('vault_items').update(update.newData).eq('id', update.id);
        if (error) {
          failedItemIds.add(update.id);
        } else {
          succeededItemIds.push(update.id);
        }
      }

      // --- Phase 2b: Write vault documents ---
      for (const update of docUpdates) {
        setRekeyProgress({ phase: 'Writing re-encrypted documents...', current: ++completedWrites, total: totalWrites });
        const { error } = await supabase.from('vault_documents').update(update.newData).eq('id', update.id);
        if (error) {
          failedDocIds.add(update.id);
        } else {
          succeededDocIds.push(update.id);
        }
      }

      // --- Phase 2c: If ANY writes failed, roll back ALL successful writes ---
      if (failedItemIds.size > 0 || failedDocIds.size > 0) {
        const failCount = failedItemIds.size + failedDocIds.size;
        setRekeyProgress({ phase: 'Rolling back due to write failures...', current: 0, total: succeededItemIds.length + succeededDocIds.length });

        let rollbackErrors = 0;
        let rollbackProgress = 0;
        const rollbackTotal = succeededItemIds.length + succeededDocIds.length;

        // Roll back successfully written items to old ciphertext
        for (const id of succeededItemIds) {
          const original = itemUpdates.find(u => u.id === id);
          if (original) {
            setRekeyProgress({ phase: 'Rolling back items...', current: ++rollbackProgress, total: rollbackTotal });
            const { error } = await supabase.from('vault_items').update(original.oldData).eq('id', id);
            if (error) rollbackErrors++;
          }
        }

        // Roll back successfully written documents to old ciphertext
        for (const id of succeededDocIds) {
          const original = docUpdates.find(u => u.id === id);
          if (original) {
            setRekeyProgress({ phase: 'Rolling back documents...', current: ++rollbackProgress, total: rollbackTotal });
            const { error } = await supabase.from('vault_documents').update(original.oldData).eq('id', id);
            if (error) rollbackErrors++;
          }
        }

        setRekeyProgress(null);
        if (rollbackErrors > 0) {
          setChangePwError(
            `${failCount} item(s) failed to update and ${rollbackErrors} rollback(s) also failed. ` +
            `Your vault may be in an inconsistent state. Do NOT close this page. ` +
            `Please export your vault immediately and contact support.`
          );
        } else {
          setChangePwError(
            `${failCount} item(s) failed to write to the server. ` +
            `All changes have been rolled back — your vault is intact with the old password. ` +
            `Please try again or check your network connection.`
          );
        }
        setChangePwLoading(false);
        return;
      }

      // =====================================================================
      // PHASE 3: All items confirmed written — now safe to update profile
      // =====================================================================
      setRekeyProgress({ phase: 'Updating vault verifier...', current: 0, total: 0 });
      const { encrypted: newVerifier, iv: newVerifierIv } = await createVaultVerifier(newKey);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: profileError } = await supabase
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

        if (profileError) {
          // Profile update failed — items are encrypted with new key but
          // profile still references old salt/verifier. This is recoverable:
          // the new password + new salt will still derive the correct key.
          // But since the profile wasn't updated, the user would need the
          // OLD password to unlock. We need to roll back all items.
          setRekeyProgress({ phase: 'Profile update failed — rolling back all items...', current: 0, total: totalWrites });
          let rollbackProgress = 0;
          for (const update of itemUpdates) {
            setRekeyProgress({ phase: 'Rolling back items...', current: ++rollbackProgress, total: totalWrites });
            await supabase.from('vault_items').update(update.oldData).eq('id', update.id);
          }
          for (const update of docUpdates) {
            setRekeyProgress({ phase: 'Rolling back documents...', current: ++rollbackProgress, total: totalWrites });
            await supabase.from('vault_documents').update(update.oldData).eq('id', update.id);
          }
          setRekeyProgress(null);
          setChangePwError('Failed to update profile after re-encrypting items. All changes have been rolled back. Please try again.');
          setChangePwLoading(false);
          return;
        }
      }

      // Update session with new key
      VaultSession.set(newKey);

      // Audit log
      await logAuditEvent('edit');

      setRekeyProgress(null);
      setShowChangePw(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmNewPw('');
      setChangePwError('');
      setChangePwSuccess('Master password changed successfully. All items and documents have been re-encrypted.');
    } catch {
      setRekeyProgress(null);
      setChangePwError('Current master password is incorrect.');
    } finally {
      setChangePwLoading(false);
    }
  }

  async function handleExportVault() {
    if (!profile) return;
    setExportError('');

    if (!profile.vault_verifier || !profile.vault_verifier_iv) {
      setExportError('Vault not set up. Please create a master password first.');
      return;
    }

    // Verify master password before exporting
    try {
      const key = await deriveVaultKey(exportPassword, profile.kdf_salt, profile.kdf_iterations);
      const isValid = await verifyVaultKey(profile.vault_verifier, profile.vault_verifier_iv, key);
      if (!isValid) {
        setExportError('Incorrect master password.');
        return;
      }
    } catch {
      setExportError('Incorrect master password.');
      return;
    }

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

      await logAuditEvent('export');

      setShowExportConfirm(false);
      setExportPassword('');
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE') return;
    setDeleteError('');

    try {
      // Call the server-side deletion endpoint that actually deletes everything
      const res = await fetch('/api/account/delete', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete account. Please try again or contact support.');
        return;
      }

      // Clear local state and sign out
      VaultSession.lock();
      await supabase.auth.signOut();
      router.push('/login');
    } catch {
      setDeleteError('Account deletion failed. Please try again.');
    }
  }

  async function handleManageBilling() {
    setBillingError('');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setBillingError(data.error || 'Failed to open billing portal');
      }
    } catch {
      setBillingError('Failed to open billing portal');
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
          {billingError && (
            <div className="mb-4 rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">
              {billingError}
            </div>
          )}
          <PricingCards currentPlan={profile?.plan || 'personal'} onManageBilling={handleManageBilling} />
        </section>

        {/* Change Master Password */}
        <section className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1b4965]">Master Password</h2>
            <button onClick={() => { setShowChangePw(!showChangePw); setChangePwSuccess(''); }} className="text-sm text-[#5fa8a0] hover:text-[#4d8f87]">
              {showChangePw ? 'Cancel' : 'Change'}
            </button>
          </div>
          {changePwSuccess && (
            <div className="mt-4 rounded-sm border border-[#5fa8a0]/30 bg-[#5fa8a0]/10 px-4 py-3 text-sm text-[#5fa8a0]">
              {changePwSuccess}
            </div>
          )}
          {showChangePw && (
            <form onSubmit={handleChangeMasterPassword} className="mt-4 space-y-3">
              {changePwError && <div className="rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">{changePwError}</div>}
              <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={inputClass} placeholder="Current master password" required disabled={changePwLoading} />
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputClass} placeholder="New master password (min 10 chars)" required disabled={changePwLoading} />
              <input type="password" value={confirmNewPw} onChange={(e) => setConfirmNewPw(e.target.value)} className={inputClass} placeholder="Confirm new master password" required disabled={changePwLoading} />
              <div className="rounded-sm border border-[#d97706]/30 bg-[#d97706]/10 px-4 py-3 text-sm text-[#d97706]">
                This will re-encrypt all vault items with the new password. Do not close the browser during this process.
              </div>
              {rekeyProgress && (
                <div className="rounded-sm border border-[#5fa8a0]/30 bg-[#5fa8a0]/10 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between text-sm text-[#1b4965]">
                    <span className="font-medium">{rekeyProgress.phase}</span>
                    {rekeyProgress.total > 0 && (
                      <span className="font-mono text-xs text-[#1b4965]/60">{rekeyProgress.current}/{rekeyProgress.total}</span>
                    )}
                  </div>
                  {rekeyProgress.total > 0 && (
                    <div className="h-1.5 w-full rounded-full bg-[#1b4965]/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#5fa8a0] transition-all duration-200"
                        style={{ width: `${Math.round((rekeyProgress.current / rekeyProgress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
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
          {!showExportConfirm ? (
            <button onClick={() => setShowExportConfirm(true)} className="rounded-sm border border-[#1b4965]/15 px-4 py-2.5 text-sm font-medium text-[#1b4965]/70 hover:bg-[#1b4965]/5">
              Export as JSON
            </button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-sm border border-[#d97706]/30 bg-[#d97706]/10 px-4 py-3 text-sm text-[#d97706]">
                This will download ALL vault data as unencrypted plaintext. Anyone with this file can read all your passwords.
              </div>
              {exportError && <div className="rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">{exportError}</div>}
              <input type="password" value={exportPassword} onChange={(e) => setExportPassword(e.target.value)} className={inputClass} placeholder="Enter master password to confirm" required />
              <div className="flex gap-3">
                <button onClick={handleExportVault} disabled={exporting || !exportPassword} className="rounded-sm bg-[#d97706] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#b86105] disabled:opacity-50">
                  {exporting ? 'Exporting...' : 'Confirm Export'}
                </button>
                <button onClick={() => { setShowExportConfirm(false); setExportPassword(''); setExportError(''); }} className="rounded-sm border border-[#1b4965]/15 px-4 py-2.5 text-sm text-[#1b4965]/70 hover:bg-[#1b4965]/5">
                  Cancel
                </button>
              </div>
            </div>
          )}
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
              {deleteError && (
                <div className="rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">
                  {deleteError}
                </div>
              )}
              <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} className={`${inputClass} border-[#e76f51]/30`} placeholder="DELETE" />
              <div className="flex gap-3">
                <button onClick={handleDeleteAccount} disabled={deleteConfirm !== 'DELETE'} className="rounded-sm bg-[#e76f51] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#d65a3e] disabled:opacity-50">
                  Permanently Delete
                </button>
                <button onClick={() => { setShowDelete(false); setDeleteConfirm(''); setDeleteError(''); }} className="rounded-sm border border-[#1b4965]/15 px-4 py-2.5 text-sm text-[#1b4965]/70 hover:bg-[#1b4965]/5">
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
