'use client';

import { useState, useCallback } from 'react';
import { generatePassword } from '@/lib/crypto';

interface PasswordGeneratorProps {
  onSelect?: (password: string) => void;
  className?: string;
}

export default function PasswordGenerator({ onSelect, className = '' }: PasswordGeneratorProps) {
  const [password, setPassword] = useState(() => generatePassword(20));
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [copied, setCopied] = useState(false);

  const regenerate = useCallback(() => {
    try {
      const pw = generatePassword(length, {
        length,
        uppercase,
        lowercase,
        numbers,
        symbols,
        excludeAmbiguous,
      });
      setPassword(pw);
      setCopied(false);
    } catch {
      // At least one charset must be enabled
    }
  }, [length, uppercase, lowercase, numbers, symbols, excludeAmbiguous]);

  async function handleCopy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleUse() {
    onSelect?.(password);
  }

  // Password strength color
  function getStrengthColor(): string {
    if (length >= 20 && symbols) return 'text-[#16a34a]';
    if (length >= 16) return 'text-[#5fa8a0]';
    if (length >= 12) return 'text-[#d97706]';
    return 'text-[#e76f51]';
  }

  return (
    <div className={`rounded-sm border border-[#1b4965]/15 bg-white p-4 ${className}`}>
      {/* Generated password display */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex-1 overflow-hidden rounded-sm bg-[#1b4965]/5 px-4 py-3">
          <p className={`break-all font-mono text-sm ${getStrengthColor()}`}>{password}</p>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded-sm border border-[#1b4965]/15 p-2.5 text-[#1b4965]/60 transition-colors hover:bg-[#1b4965]/5 hover:text-[#1b4965]"
          title="Copy"
        >
          {copied ? (
            <svg className="h-5 w-5 text-[#5fa8a0]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
            </svg>
          )}
        </button>
        <button
          onClick={regenerate}
          className="shrink-0 rounded-sm border border-[#1b4965]/15 p-2.5 text-[#1b4965]/60 transition-colors hover:bg-[#1b4965]/5 hover:text-[#1b4965]"
          title="Regenerate"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>

      {/* Length slider */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm text-[#1b4965]/70">Length</label>
          <span className="text-sm font-medium text-[#1b4965]">{length}</span>
        </div>
        <input
          type="range"
          min={8}
          max={64}
          value={length}
          onChange={(e) => {
            setLength(Number(e.target.value));
            setTimeout(regenerate, 0);
          }}
          className="w-full accent-[#5fa8a0]"
        />
      </div>

      {/* Character options */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {[
          { label: 'Uppercase (A-Z)', checked: uppercase, set: setUppercase },
          { label: 'Lowercase (a-z)', checked: lowercase, set: setLowercase },
          { label: 'Numbers (0-9)', checked: numbers, set: setNumbers },
          { label: 'Symbols (!@#$)', checked: symbols, set: setSymbols },
        ].map(({ label, checked, set }) => (
          <label key={label} className="flex items-center gap-2 text-sm text-[#1b4965]/70">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                set(e.target.checked);
                setTimeout(regenerate, 0);
              }}
              className="rounded border-[#1b4965]/20 bg-white text-[#5fa8a0] focus:ring-[#5fa8a0]"
            />
            {label}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-[#1b4965]/70">
          <input
            type="checkbox"
            checked={excludeAmbiguous}
            onChange={(e) => {
              setExcludeAmbiguous(e.target.checked);
              setTimeout(regenerate, 0);
            }}
            className="rounded border-[#1b4965]/20 bg-white text-[#5fa8a0] focus:ring-[#5fa8a0]"
          />
          No ambiguous (Il1O0)
        </label>
      </div>

      {/* Use button (if callback provided) */}
      {onSelect && (
        <button
          onClick={handleUse}
          className="w-full rounded-sm bg-[#5fa8a0] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4d8f87]"
        >
          Use This Password
        </button>
      )}
    </div>
  );
}
