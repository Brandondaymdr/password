import { useState } from 'react';

interface UnlockProps {
  onSuccess: () => void;
  onLogout: () => void;
}

export default function Unlock({ onSuccess, onLogout }: UnlockProps) {
  const [masterPassword, setMasterPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    chrome.runtime.sendMessage(
      { type: 'UNLOCK', payload: { masterPassword } },
      (response) => {
        setLoading(false);
        if (response?.error) {
          setError(response.error);
          setMasterPassword('');
        } else {
          onSuccess();
        }
      }
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-deep-ocean/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="12" fill="#1b4965" />
            <rect x="10" y="13" width="8" height="7" rx="1" fill="#5fa8a0" />
            <path d="M11.5 13V10.5a2.5 2.5 0 015 0V13" stroke="#fcfbf8" strokeWidth="1.5" fill="none" />
          </svg>
          <div>
            <h1 className="text-base font-semibold text-deep-ocean">Vault Locked</h1>
            <p className="text-xs text-deep-ocean/50">Enter your master password</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-deep-ocean/40 hover:text-coral"
        >
          Sign out
        </button>
      </div>

      {/* Unlock Form */}
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 p-5">
        {error && (
          <div className="rounded-sm border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
            {error}
          </div>
        )}

        {/* Lock icon */}
        <div className="flex justify-center py-6">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" fill="#1b4965" opacity="0.08" />
            <rect x="22" y="30" width="20" height="16" rx="2" fill="#1b4965" opacity="0.15" />
            <path d="M25 30V24a7 7 0 0114 0v6" stroke="#1b4965" strokeWidth="2.5" fill="none" opacity="0.3" />
            <circle cx="32" cy="38" r="2.5" fill="#1b4965" opacity="0.3" />
          </svg>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-deep-ocean/70">Master Password</label>
          <input
            type="password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            placeholder="Enter your master password"
            required
            autoFocus
            className="rounded-sm border border-deep-ocean/15 bg-white px-3 py-2.5 text-sm text-deep-ocean placeholder-deep-ocean/40 outline-none focus:border-seafoam"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !masterPassword}
          className="rounded-sm bg-seafoam py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4d8f87] disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Unlocking...
            </span>
          ) : (
            'Unlock Vault'
          )}
        </button>
      </form>
    </div>
  );
}
