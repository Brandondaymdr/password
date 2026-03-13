import { useState } from 'react';

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    chrome.runtime.sendMessage(
      { type: 'LOGIN', payload: { email, password } },
      (response) => {
        setLoading(false);
        if (response?.error) {
          setError(response.error);
        } else {
          onSuccess();
        }
      }
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-deep-ocean/10 px-5 py-4">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="12" fill="#1b4965" />
          <rect x="10" y="13" width="8" height="7" rx="1" fill="#5fa8a0" />
          <path d="M11.5 13V10.5a2.5 2.5 0 015 0V13" stroke="#fcfbf8" strokeWidth="1.5" fill="none" />
        </svg>
        <div>
          <h1 className="text-base font-semibold text-deep-ocean">ShoreStack Vault</h1>
          <p className="text-xs text-deep-ocean/50">Sign in to your account</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 p-5">
        {error && (
          <div className="rounded-sm border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-deep-ocean/70">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="rounded-sm border border-deep-ocean/15 bg-white px-3 py-2 text-sm text-deep-ocean placeholder-deep-ocean/40 outline-none focus:border-seafoam"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-deep-ocean/70">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Account password"
            required
            className="rounded-sm border border-deep-ocean/15 bg-white px-3 py-2 text-sm text-deep-ocean placeholder-deep-ocean/40 outline-none focus:border-seafoam"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-sm bg-seafoam py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4d8f87] disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <p className="mt-auto text-center text-[10px] text-deep-ocean/40">
          Don't have an account? Sign up at password-mu.vercel.app
        </p>
      </form>
    </div>
  );
}
