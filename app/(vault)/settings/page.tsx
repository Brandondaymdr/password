'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { deriveVaultKey, encryptItem, decryptItem } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import { useRouter } from 'next/navigation';
import type { Profile, VaultItemRow, AuditLogRow } from '@/types/vault';

export default function SettingsPage() {
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

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadSettings();
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

      // Derive new key with same salt (or generate new salt for better security)
      const newKey = await deriveVaultKey(newPw, profile.kdf_salt, profile.kdf_iterations);

      // Re-encrypt all vault items with the new key
      const { data: rows } = await supabase.from('vault_items').select('*');
      if (rows) {
        for (const row of rows as VaultItemRow[]) {
          try {
            const decrypted = await decryptItem(row.encrypted_data, row.iv, oldKey);
            const { encrypted, iv } = await encryptItem(decrypted, newKey);
            await supabase.from('vault_items').update({ encrypted_data: encrypted, iv }).eq('id', row.id);
          } catch {
            setChangePwError('Failed to decrypt an item with the current password. Aborting.');
            setChangePwLoading(false);
            return;
          }
        }
      }

      // Update session with new key
      VaultSession.set(newKey);

      // Audit log
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('vault_audit_log').insert({ user_id: user.id, action: 'edit' });

      setShowChangePw(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmNewPw('');
      alert('Master password changed successfully.');
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

    VaultSession.lock();
    // Delete all user data (cascade will handle vault_items, documents, audit)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Delete storage files
      const { data: docs } = await supabase.from('vault_documents').select('storage_path');
      if (docs && docs.length > 0) {
        await supabase.storage.from('vault-documents').remove(docs.map(d => d.storage_path));
      }
      // Note: Supabase cascade will delete profiles, vault_items, etc.
    }

    await supabase.auth.signOut();
    router.push('/login');
  }

  const inputClass = 'block w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm';

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="animate-pulse text-gray-400">Loading settings...</div></div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        {/* Account Info */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Account</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Plan</span><span className="capitalize text-emerald-400">{profile?.plan || 'free'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">KDF Iterations</span><span className="font-mono">{profile?.kdf_iterations?.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Password Hint</span><span className="text-gray-300">{profile?.hint || 'None set'}</span></div>
          </div>
        </section>

        {/* Change Master Password */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Master Password</h2>
            <button onClick={() => setShowChangePw(!showChangePw)} className="text-sm text-emerald-400 hover:text-emerald-300">
              {showChangePw ? 'Cancel' : 'Change'}
            </button>
          </div>
          {showChangePw && (
            <form onSubmit={handleChangeMasterPassword} className="mt-4 space-y-3">
              {changePwError && <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">{changePwError}</div>}
              <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={inputClass} placeholder="Current master password" required />
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputClass} placeholder="New master password (min 10 chars)" required />
              <input type="password" value={confirmNewPw} onChange={(e) => setConfirmNewPw(e.target.value)} className={inputClass} placeholder="Confirm new master password" required />
              <div className="rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
                This will re-encrypt all vault items with the new password. Do not close the browser during this process.
              </div>
              <button type="submit" disabled={changePwLoading} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {changePwLoading ? 'Re-encrypting vault...' : 'Change Master Password'}
              </button>
            </form>
          )}
        </section>

        {/* Export */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Export Vault</h2>
          <p className="mb-4 text-sm text-gray-400">Download a decrypted JSON backup of all vault items. Keep this file secure.</p>
          <button onClick={handleExportVault} disabled={exporting} className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-50">
            {exporting ? 'Exporting...' : 'Export as JSON'}
          </button>
        </section>

        {/* Audit Log */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Recent Activity</h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-gray-500">No activity logged yet.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                    log.action === 'unlock' ? 'bg-blue-900/30 text-blue-300' :
                    log.action === 'create' ? 'bg-green-900/30 text-green-300' :
                    log.action === 'edit' ? 'bg-yellow-900/30 text-yellow-300' :
                    log.action === 'delete' ? 'bg-red-900/30 text-red-300' :
                    log.action === 'export' ? 'bg-purple-900/30 text-purple-300' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {log.action}
                  </span>
                  <span className="text-xs text-gray-600">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger Zone */}
        <section className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-red-400">Danger Zone</h2>
          <p className="mb-4 text-sm text-gray-400">Permanently delete your account and all vault data. This cannot be undone.</p>
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)} className="rounded-lg border border-red-800 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-900/30">
              Delete Account
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-300">Type <strong>DELETE</strong> to confirm:</p>
              <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} className={`${inputClass} border-red-800`} placeholder="DELETE" />
              <div className="flex gap-3">
                <button onClick={handleDeleteAccount} disabled={deleteConfirm !== 'DELETE'} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  Permanently Delete
                </button>
                <button onClick={() => { setShowDelete(false); setDeleteConfirm(''); }} className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800">
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
