'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { deriveVaultKey, decryptItem } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import { useRouter } from 'next/navigation';
import type { Profile, VaultItemRow, DecryptedVaultItem, DecryptedItemData } from '@/types/vault';

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMasterPassword, setNeedsMasterPassword] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadVault() {
    setLoading(true);

    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    // Fetch profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileData) setProfile(profileData);

    // Check if vault is unlocked
    if (!VaultSession.isUnlocked()) {
      setNeedsMasterPassword(true);
      setLoading(false);
      return;
    }

    // Fetch and decrypt vault items
    await loadItems();
    setLoading(false);
  }

  async function loadItems() {
    const vaultKey = VaultSession.get();
    if (!vaultKey) return;

    const { data: rows } = await supabase
      .from('vault_items')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!rows) return;

    const decrypted: DecryptedVaultItem[] = [];
    for (const row of rows as VaultItemRow[]) {
      try {
        const data = await decryptItem(row.encrypted_data, row.iv, vaultKey) as DecryptedItemData;
        decrypted.push({
          id: row.id,
          item_type: row.item_type,
          data,
          favorite: row.favorite,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      } catch {
        console.error('Failed to decrypt item', row.id);
      }
    }

    setItems(decrypted);
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setUnlocking(true);

    try {
      if (!profile) throw new Error('Profile not loaded');

      const vaultKey = await deriveVaultKey(
        masterPassword,
        profile.kdf_salt,
        profile.kdf_iterations
      );

      VaultSession.set(vaultKey);

      // Log the unlock action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('vault_audit_log').insert({
          user_id: user.id,
          action: 'unlock',
        });
      }

      setNeedsMasterPassword(false);
      setMasterPassword('');
      await loadItems();
    } catch {
      setError('Failed to unlock vault. Check your master password.');
    } finally {
      setUnlocking(false);
    }
  }

  function handleLock() {
    VaultSession.lock();
    setItems([]);
    setNeedsMasterPassword(true);
  }

  async function handleSignOut() {
    VaultSession.lock();
    await supabase.auth.signOut();
    router.push('/login');
  }

  // --- Master Password Prompt ---
  if (needsMasterPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-800">
              <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold">Vault Locked</h1>
            <p className="mt-1 text-sm text-gray-400">Enter your master password to unlock</p>
            {profile?.hint && (
              <p className="mt-2 text-xs text-gray-500">Hint: {profile.hint}</p>
            )}
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              className="block w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Master password"
              autoFocus
            />
            <button
              type="submit"
              disabled={unlocking}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {unlocking ? 'Unlocking...' : 'Unlock Vault'}
            </button>
          </form>

          <button
            onClick={handleSignOut}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-300"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading vault...</div>
      </div>
    );
  }

  // --- Dashboard ---
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold">ShoreStack Vault</h1>
            <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-400">
              {profile?.plan || 'free'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLock}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-800"
            >
              Lock
            </button>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-800"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(['login', 'secure_note', 'credit_card', 'identity'] as const).map((type) => {
            const count = items.filter((i) => i.item_type === type).length;
            const labels: Record<string, string> = {
              login: 'Logins',
              secure_note: 'Notes',
              credit_card: 'Cards',
              identity: 'Identities',
            };
            return (
              <div key={type} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-sm text-gray-400">{labels[type]}</p>
                <p className="mt-1 text-2xl font-bold">{count}</p>
              </div>
            );
          })}
        </div>

        {/* Items list */}
        {items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-800">
              <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-300">Your vault is empty</h2>
            <p className="mt-1 text-sm text-gray-500">Add your first login, note, or card to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800">
                    {item.item_type === 'login' && (
                      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                      </svg>
                    )}
                    {item.item_type === 'secure_note' && (
                      <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                    )}
                    {item.item_type === 'credit_card' && (
                      <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                      </svg>
                    )}
                    {item.item_type === 'identity' && (
                      <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{'name' in item.data ? item.data.name : 'Untitled'}</p>
                    <p className="text-sm text-gray-500">{item.item_type.replace('_', ' ')}</p>
                  </div>
                </div>
                {item.favorite && (
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
