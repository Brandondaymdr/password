// ============================================
// ShoreStack Vault Extension — Vault Session
// ============================================
// Manages the vault key in service worker memory.
// Key is NEVER persisted — lost on service worker termination.

const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let vaultKey: CryptoKey | null = null;
let lockTimeout: ReturnType<typeof setTimeout> | null = null;
let itemCount = 0;

function resetLockTimer(): void {
  if (lockTimeout) clearTimeout(lockTimeout);
  lockTimeout = setTimeout(() => {
    lock();
  }, LOCK_TIMEOUT_MS);
}

export function unlock(key: CryptoKey, count: number = 0): void {
  vaultKey = key;
  itemCount = count;
  resetLockTimer();
}

export function lock(): void {
  vaultKey = null;
  itemCount = 0;
  if (lockTimeout) {
    clearTimeout(lockTimeout);
    lockTimeout = null;
  }
  // Update badge to show locked state
  chrome.action.setBadgeText({ text: '' });
}

export function getVaultKey(): CryptoKey | null {
  if (vaultKey) resetLockTimer();
  return vaultKey;
}

export function isUnlocked(): boolean {
  return vaultKey !== null;
}

export function getItemCount(): number {
  return itemCount;
}

export function setItemCount(count: number): void {
  itemCount = count;
}
