// ============================================
// ShoreStack Vault Extension — Service Worker
// ============================================
// Message router, Supabase auth, vault session management.
// Vault key lives in memory — lost on service worker termination.

import { getSupabase } from '../shared/supabase-client';
import { deriveVaultKey, decryptItem, verifyVaultKey, encryptItem, generateSearchIndex, generatePassword } from '../shared/crypto';
import { unlock, lock, getVaultKey, isUnlocked, getItemCount, setItemCount } from '../shared/vault-session';
import type { VaultStatus, VaultItemRow, DecryptedVaultItem, LoginItem, ExtensionMessage, PasswordOptions } from '../shared/types';

// --- Message Handler ---

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        console.error('[ShoreStack SW]', err);
        sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
      });
    return true; // keep channel open for async response
  }
);

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'GET_STATUS':
      return getStatus();

    case 'LOGIN':
      return handleLogin(message.payload as { email: string; password: string });

    case 'LOGOUT':
      return handleLogout();

    case 'UNLOCK':
      return handleUnlock(message.payload as { masterPassword: string });

    case 'LOCK':
      lock();
      return { success: true };

    case 'SEARCH_VAULT':
      return handleSearchVault(message.payload as { query: string });

    case 'GET_CREDENTIALS':
      return handleGetCredentials(message.payload as { url: string });

    case 'SAVE_CREDENTIAL':
      return handleSaveCredential(
        message.payload as { url: string; username: string; password: string }
      );

    case 'GENERATE_PASSWORD':
      return handleGeneratePassword(message.payload as Partial<PasswordOptions> | undefined);

    case 'FORM_DETECTED':
      return handleFormDetected(message.payload as { url: string; fieldCount: number });

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

// --- Status ---

async function getStatus(): Promise<VaultStatus> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  return {
    isAuthenticated: !!session,
    isUnlocked: isUnlocked(),
    itemCount: getItemCount(),
  };
}

// --- Auth ---

async function handleLogin(payload: { email: string; password: string }) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });

  if (error) return { error: error.message };
  return { success: true, userId: data.user?.id };
}

async function handleLogout() {
  const supabase = getSupabase();
  lock();
  await supabase.auth.signOut();
  return { success: true };
}

// --- Vault Unlock ---

async function handleUnlock(payload: { masterPassword: string }) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Get profile for KDF salt and verifier
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('kdf_salt, kdf_iterations, vault_verifier, vault_verifier_iv')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) return { error: 'Profile not found' };
  if (!profile.vault_verifier || !profile.vault_verifier_iv) {
    return { error: 'Vault not set up — please complete setup in the web app' };
  }

  // Derive vault key from master password
  const vaultKey = await deriveVaultKey(
    payload.masterPassword,
    profile.kdf_salt,
    profile.kdf_iterations
  );

  // Verify with the vault verifier
  const isValid = await verifyVaultKey(
    profile.vault_verifier,
    profile.vault_verifier_iv,
    vaultKey
  );

  if (!isValid) return { error: 'Incorrect master password' };

  // Count vault items
  const { count } = await supabase
    .from('vault_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  unlock(vaultKey, count ?? 0);

  // Update badge
  chrome.action.setBadgeBackgroundColor({ color: '#5fa8a0' });

  return { success: true, itemCount: count ?? 0 };
}

// --- Vault Search ---

async function handleSearchVault(payload: { query: string }): Promise<{ items: DecryptedVaultItem[] } | { error: string }> {
  const vaultKey = getVaultKey();
  if (!vaultKey) return { error: 'Vault is locked' };

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let query = supabase
    .from('vault_items')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  // If search query, use HMAC search index
  if (payload.query.trim()) {
    const searchIndex = await generateSearchIndex(payload.query.trim(), vaultKey);
    query = query.eq('search_index', searchIndex);
  }

  const { data: rows, error } = await query.limit(50);
  if (error) return { error: error.message };

  // Decrypt items
  const items: DecryptedVaultItem[] = [];
  for (const row of (rows || []) as VaultItemRow[]) {
    try {
      const data = await decryptItem(row.encrypted_data, row.iv, vaultKey);
      items.push({
        id: row.id,
        item_type: row.item_type,
        data: data as DecryptedVaultItem['data'],
        favorite: row.favorite,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    } catch {
      // Skip items that fail to decrypt
      console.warn('[ShoreStack SW] Failed to decrypt item:', row.id);
    }
  }

  setItemCount(items.length);
  return { items };
}

// --- Get Credentials by URL ---

async function handleGetCredentials(payload: { url: string }): Promise<{ items: DecryptedVaultItem[] } | { error: string }> {
  const vaultKey = getVaultKey();
  if (!vaultKey) return { error: 'Vault is locked' };

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Fetch all login items
  const { data: rows, error } = await supabase
    .from('vault_items')
    .select('*')
    .eq('user_id', user.id)
    .eq('item_type', 'login')
    .order('updated_at', { ascending: false });

  if (error) return { error: error.message };

  // Decrypt and filter by URL match
  let hostname: string;
  try {
    hostname = new URL(payload.url).hostname.replace(/^www\./, '');
  } catch {
    return { items: [] };
  }

  const items: DecryptedVaultItem[] = [];
  for (const row of (rows || []) as VaultItemRow[]) {
    try {
      const data = await decryptItem(row.encrypted_data, row.iv, vaultKey) as LoginItem;
      // Match by hostname
      let itemHostname = '';
      try {
        const itemUrl = data.url.startsWith('http') ? data.url : `https://${data.url}`;
        itemHostname = new URL(itemUrl).hostname.replace(/^www\./, '');
      } catch {
        // Skip URL parsing errors
      }

      if (itemHostname === hostname) {
        items.push({
          id: row.id,
          item_type: row.item_type,
          data,
          favorite: row.favorite,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      }
    } catch {
      // Skip items that fail to decrypt
    }
  }

  return { items };
}

// --- Save Credential ---

async function handleSaveCredential(payload: { url: string; username: string; password: string }) {
  const vaultKey = getVaultKey();
  if (!vaultKey) return { error: 'Vault is locked' };

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let siteName: string;
  try {
    siteName = new URL(payload.url).hostname.replace(/^www\./, '');
  } catch {
    siteName = payload.url;
  }

  const loginData: LoginItem = {
    name: siteName,
    username: payload.username,
    password: payload.password,
    url: payload.url,
    notes: '',
  };

  const { encrypted, iv } = await encryptItem(loginData, vaultKey);
  const searchIndex = await generateSearchIndex(siteName, vaultKey);

  const { error } = await supabase.from('vault_items').insert({
    user_id: user.id,
    item_type: 'login',
    encrypted_data: encrypted,
    iv,
    search_index: searchIndex,
    favorite: false,
  });

  if (error) return { error: error.message };

  setItemCount(getItemCount() + 1);
  return { success: true };
}

// --- Password Generator ---

function handleGeneratePassword(options?: Partial<PasswordOptions>) {
  const password = generatePassword(options?.length ?? 20, options);
  return { password };
}

// --- Form Detection ---

async function handleFormDetected(payload: { url: string; fieldCount: number }) {
  if (!isUnlocked()) return { matchCount: 0 };

  const result = await handleGetCredentials({ url: payload.url });
  if ('error' in result) return { matchCount: 0 };

  const matchCount = result.items.length;
  if (matchCount > 0) {
    chrome.action.setBadgeText({ text: String(matchCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#5fa8a0' });
  }

  return { matchCount };
}

// --- Service Worker Lifecycle ---

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ShoreStack Vault] Extension installed');
});

// On startup, check if we have a valid auth session
chrome.runtime.onStartup.addListener(async () => {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    chrome.action.setBadgeText({ text: '' });
  }
});
