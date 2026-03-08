// ============================================
// ShoreStack Vault — Vault Session Manager
// ============================================
// The vault key is held in memory ONLY.
// It is NEVER stored in localStorage, cookies, or React state.
// It is cleared on lock, logout, or tab close.

let _vaultKey: CryptoKey | null = null;
let _lastActivity: number = Date.now();
let _timeoutId: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function resetTimer() {
  if (_timeoutId) clearTimeout(_timeoutId);
  _lastActivity = Date.now();
  _timeoutId = setTimeout(() => {
    VaultSession.lock();
  }, DEFAULT_TIMEOUT_MS);
}

export const VaultSession = {
  /**
   * Store the derived vault key in memory and start the inactivity timer.
   */
  set(key: CryptoKey) {
    _vaultKey = key;
    resetTimer();
  },

  /**
   * Retrieve the vault key. Returns null if locked.
   */
  get(): CryptoKey | null {
    if (_vaultKey) {
      resetTimer(); // Reset inactivity timer on access
    }
    return _vaultKey;
  },

  /**
   * Lock the vault — clear the key from memory.
   */
  lock() {
    _vaultKey = null;
    if (_timeoutId) {
      clearTimeout(_timeoutId);
      _timeoutId = null;
    }
  },

  /**
   * Check if the vault is currently unlocked.
   */
  isUnlocked(): boolean {
    return _vaultKey !== null;
  },

  /**
   * Get time remaining before auto-lock (in ms).
   */
  timeRemaining(): number {
    if (!_vaultKey) return 0;
    const elapsed = Date.now() - _lastActivity;
    return Math.max(0, DEFAULT_TIMEOUT_MS - elapsed);
  },
};
