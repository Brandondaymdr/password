'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import { deriveVaultKey, decryptItem, verifyVaultKey } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AddItemModal from '@/components/vault/AddItemModal';
import VaultItemDetail from '@/components/vault/VaultItemDetail';
import PWAInstallPrompt from '@/components/vault/PWAInstallPrompt';
import type { Profile, VaultItemRow, VaultItemType, DecryptedVaultItem, DecryptedItemData, LoginItem } from '@/types/vault';

const TYPE_META: Record<VaultItemType, { label: string; pluralLabel: string; color: string; icon: React.ReactNode }> = {
  login: {
    label: 'Login', pluralLabel: 'Logins', color: 'text-[#5fa8a0]',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />,
  },
  secure_note: {
    label: 'Note', pluralLabel: 'Notes', color: 'text-[#d97706]',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />,
  },
  credit_card: {
    label: 'Card', pluralLabel: 'Cards', color: 'text-[#8b5cf6]',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />,
  },
  identity: {
    label: 'Identity', pluralLabel: 'Identities', color: 'text-[#5fa8a0]',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />,
  },
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMasterPassword, setNeedsMasterPassword] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');

  // UI state
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<VaultItemType | 'all' | 'favorites'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DecryptedVaultItem | null>(null);
  const [editItem, setEditItem] = useState<DecryptedVaultItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered items
  const filteredItems = useMemo(() => {
    let result = items;

    // Type / favorites filter
    if (filterType === 'favorites') {
      result = result.filter((i) => i.favorite);
    } else if (filterType !== 'all') {
      result = result.filter((i) => i.item_type === filterType);
    }

    // Search filter (client-side on decrypted names)
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => {
        const name = 'name' in i.data ? (i.data as { name: string }).name : '';
        const username = i.item_type === 'login' ? (i.data as LoginItem).username : '';
        const url = i.item_type === 'login' ? (i.data as LoginItem).url : '';
        return name.toLowerCase().includes(q) || username.toLowerCase().includes(q) || url.toLowerCase().includes(q);
      });
    }

    return result;
  }, [items, filterType, search]);

  async function loadVault() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profileData) setProfile(profileData);

    // If vault_verifier is null, the user hasn't set up their master password yet
    if (!profileData?.vault_verifier) {
      router.push('/setup');
      return;
    }

    if (!VaultSession.isUnlocked()) {
      setNeedsMasterPassword(true);
      setLoading(false);
      return;
    }

    await loadItems();
    setLoading(false);
  }

  async function loadItems() {
    const vaultKey = VaultSession.get();
    if (!vaultKey) return;

    const { data: rows } = await supabase.from('vault_items').select('*').order('updated_at', { ascending: false });
    if (!rows) return;

    const decrypted: DecryptedVaultItem[] = [];
    for (const row of rows as VaultItemRow[]) {
      try {
        const data = await decryptItem(row.encrypted_data, row.iv, vaultKey) as DecryptedItemData;
        decrypted.push({ id: row.id, item_type: row.item_type, data, favorite: row.favorite, created_at: row.created_at, updated_at: row.updated_at });
      } catch { /* skip corrupted items */ }
    }
    setItems(decrypted);
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setUnlocking(true);
    try {
      if (!profile) throw new Error('Profile not loaded');
      const vaultKey = await deriveVaultKey(masterPassword, profile.kdf_salt, profile.kdf_iterations);

      // Verify the master password using the vault verifier
      if (profile.vault_verifier && profile.vault_verifier_iv) {
        const isValid = await verifyVaultKey(profile.vault_verifier, profile.vault_verifier_iv, vaultKey);
        if (!isValid) {
          setError('Incorrect master password. Please try again.');
          return;
        }
      }

      VaultSession.set(vaultKey);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('vault_audit_log').insert({ user_id: user.id, action: 'unlock' });

      setNeedsMasterPassword(false);
      setMasterPassword('');
      await loadItems();
      setLoading(false);
    } catch {
      setError('Failed to unlock vault. Check your master password.');
    } finally {
      setUnlocking(false);
    }
  }

  function handleLock() {
    VaultSession.lock();
    setItems([]);
    setSelectedItem(null);
    setNeedsMasterPassword(true);
  }

  async function handleSignOut() {
    VaultSession.lock();
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleDeleteItem(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('vault_items').delete().eq('id', id);
    if (user) await supabase.from('vault_audit_log').insert({ user_id: user.id, action: 'delete', item_id: id });
    setSelectedItem(null);
    await loadItems();
  }

  // --- Master Password Prompt ---
  if (needsMasterPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 bg-sand">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-sm bg-[#1b4965]">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[#1b4965]">Vault Locked</h1>
            <p className="mt-1 text-sm text-[#1b4965]/60">Enter your master password to unlock</p>
            {profile?.hint && <p className="mt-2 text-xs text-[#1b4965]/60">Hint: {profile.hint}</p>}
          </div>
          <form onSubmit={handleUnlock} className="space-y-4">
            {error && <div className="rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">{error}</div>}
            <input type="password" value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} className="block w-full rounded-sm border border-[#1b4965]/15 bg-white px-4 py-3 text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]" placeholder="Master password" autoFocus />
            <button type="submit" disabled={unlocking} className="w-full rounded-sm bg-[#5fa8a0] px-4 py-3 font-medium text-white transition-colors hover:bg-[#4d8f87] disabled:opacity-50">{unlocking ? 'Unlocking...' : 'Unlock Vault'}</button>
          </form>
          {/* Biometric unlock — disabled until server-side WebAuthn is implemented */}
          {/* TODO: Re-enable once WebAuthn ceremony is verified server-side */}

          <button onClick={handleSignOut} className="w-full text-center text-sm text-[#1b4965]/60 hover:text-[#1b4965]">Sign out</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-sand"><div className="animate-pulse text-[#1b4965]/60">Loading vault...</div></div>;
  }

  // --- Main Dashboard ---
  return (
    <div className="flex min-h-screen bg-sand">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-[#1b4965]/15 bg-[#1b4965] transition-transform md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 border-b border-[#fcfbf8]/10 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#5fa8a0]">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <span className="font-semibold text-white">ShoreStack Vault</span>
        </div>

        <nav className="p-3 space-y-1">
          <button onClick={() => setFilterType('all')} className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors ${filterType === 'all' ? 'bg-[#5fa8a0] text-white' : 'text-[#fcfbf8]/70 hover:bg-[#1b4965]/50 hover:text-white'}`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>
            All Items
            <span className="ml-auto text-xs text-[#fcfbf8]/50">{items.length}</span>
          </button>
          <button onClick={() => setFilterType('favorites')} className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors ${filterType === 'favorites' ? 'bg-[#5fa8a0] text-white' : 'text-[#fcfbf8]/70 hover:bg-[#1b4965]/50 hover:text-white'}`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
            Favorites
            <span className="ml-auto text-xs text-[#fcfbf8]/50">{items.filter(i => i.favorite).length}</span>
          </button>

          <div className="pb-1 pt-4 px-3 text-xs font-medium uppercase tracking-wider text-[#fcfbf8]/50">Categories</div>

          {(Object.keys(TYPE_META) as VaultItemType[]).map((type) => {
            const meta = TYPE_META[type];
            const count = items.filter(i => i.item_type === type).length;
            return (
              <button key={type} onClick={() => setFilterType(type)} className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors ${filterType === type ? 'bg-[#5fa8a0] text-white' : 'text-[#fcfbf8]/70 hover:bg-[#1b4965]/50 hover:text-white'}`}>
                <svg className={`h-4 w-4 ${meta.color}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">{meta.icon}</svg>
                {meta.pluralLabel}
                <span className="ml-auto text-xs text-[#fcfbf8]/50">{count}</span>
              </button>
            );
          })}
        </nav>

        {/* Pages */}
        <div className="px-3 pt-4 pb-1">
          <div className="px-3 text-xs font-medium uppercase tracking-wider text-[#fcfbf8]/50">Pages</div>
        </div>
        <nav className="px-3 space-y-1">
          <Link href="/documents" className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-[#fcfbf8]/70 hover:bg-[#1b4965]/50 hover:text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            Documents
          </Link>
          <Link href="/settings" className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-[#fcfbf8]/70 hover:bg-[#1b4965]/50 hover:text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
            Settings
          </Link>
        </nav>

        {/* Bottom actions */}
        <div className="absolute bottom-0 left-0 w-64 border-t border-[#fcfbf8]/10 p-3 space-y-1">
          <button onClick={handleLock} className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-[#fcfbf8]/70 hover:bg-[#1b4965]/50 hover:text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
            Lock Vault
          </button>
          <button onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-[#fcfbf8]/70 hover:bg-[#1b4965]/50 hover:text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" /></svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b border-[#1b4965]/15 bg-white/80 backdrop-blur">
          <div className="flex items-center gap-4 px-6 py-3">
            {/* Mobile menu button */}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="flex items-center gap-2 md:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#1b4965]">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </div>
            </button>

            {/* Search */}
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1b4965]/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-sm border border-[#1b4965]/15 bg-white py-2 pl-10 pr-4 text-sm text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none"
                placeholder="Search vault..."
              />
            </div>

            {/* Add button */}
            <button
              onClick={() => { setEditItem(null); setShowAddModal(true); }}
              className="flex shrink-0 items-center gap-2 rounded-sm bg-[#5fa8a0] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4d8f87]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="hidden sm:inline">Add Item</span>
            </button>

            {/* Mobile lock/signout */}
            <div className="flex items-center gap-1 md:hidden">
              <button onClick={handleLock} className="rounded-sm p-2 text-[#1b4965]/60 hover:bg-[#1b4965]/10">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
              </button>
            </div>

            {/* Plan badge */}
            <span className="hidden rounded-full bg-[#5fa8a0]/10 px-2.5 py-0.5 text-xs font-medium text-[#5fa8a0] sm:inline">
              {profile?.plan || 'personal'}
            </span>
          </div>

          {/* Mobile filter tabs */}
          <div className="flex gap-1 overflow-x-auto px-6 pb-3 md:hidden">
            {(['all', 'favorites', ...Object.keys(TYPE_META)] as (VaultItemType | 'all' | 'favorites')[]).map((type) => {
              const label = type === 'all' ? 'All' : type === 'favorites' ? 'Favorites' : TYPE_META[type as VaultItemType].pluralLabel;
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterType === type ? 'bg-[#5fa8a0] text-white' : 'bg-white border border-[#1b4965]/15 text-[#1b4965]/60'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </header>

        {/* PWA Install Prompt */}
        <PWAInstallPrompt />

        {/* Items */}
        <div className="p-6">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-sm bg-[#1b4965]/10">
                <svg className="h-8 w-8 text-[#1b4965]/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <h2 className="text-lg font-medium text-[#1b4965]">
                {search ? 'No results found' : items.length === 0 ? 'Your vault is empty' : 'No items in this category'}
              </h2>
              <p className="mt-1 text-sm text-[#1b4965]/60">
                {items.length === 0 ? 'Click "Add Item" to store your first password.' : search ? 'Try a different search term.' : ''}
              </p>
              {items.length === 0 && (
                <button
                  onClick={() => { setEditItem(null); setShowAddModal(true); }}
                  className="mt-4 inline-flex items-center gap-2 rounded-sm bg-[#5fa8a0] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#4d8f87]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Add Your First Item
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const meta = TYPE_META[item.item_type];
                const name = 'name' in item.data ? (item.data as { name: string }).name : 'Untitled';
                const subtitle = item.item_type === 'login' ? (item.data as LoginItem).username : meta.label;

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="flex w-full items-center gap-3 rounded-sm border border-[#1b4965]/15 bg-white p-4 text-left transition-colors hover:border-[#1b4965]/25 hover:bg-[#1b4965]/5"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#1b4965]/10`}>
                      <svg className={`h-5 w-5 ${meta.color}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">{meta.icon}</svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[#1b4965]">{name}</p>
                      <p className="truncate text-sm text-[#1b4965]/60">{subtitle}</p>
                    </div>
                    {item.favorite && (
                      <svg className="h-4 w-4 shrink-0 text-[#d97706]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                      </svg>
                    )}
                    <svg className="h-4 w-4 shrink-0 text-[#1b4965]/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit Modal */}
      <AddItemModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditItem(null); }}
        onSaved={loadItems}
        editItem={editItem ? { id: editItem.id, item_type: editItem.item_type, data: editItem.data as LoginItem, favorite: editItem.favorite } : null}
      />

      {/* Detail View */}
      {selectedItem && (
        <VaultItemDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onEdit={() => {
            setEditItem(selectedItem);
            setSelectedItem(null);
            setShowAddModal(true);
          }}
          onDelete={() => handleDeleteItem(selectedItem.id)}
        />
      )}
    </div>
  );
}
