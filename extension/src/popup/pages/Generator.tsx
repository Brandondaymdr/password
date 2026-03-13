import { useState, useCallback } from 'react';

interface GeneratorProps {
  onBack: () => void;
}

export default function Generator({ onBack }: GeneratorProps) {
  const [password, setPassword] = useState('');
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(() => {
    chrome.runtime.sendMessage(
      {
        type: 'GENERATE_PASSWORD',
        payload: { length, uppercase, lowercase, numbers, symbols, excludeAmbiguous },
      },
      (response) => {
        if (response?.password) setPassword(response.password);
      }
    );
  }, [length, uppercase, lowercase, numbers, symbols, excludeAmbiguous]);

  // Generate on mount and when options change
  useState(() => {
    generate();
  });

  async function handleCopy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getStrength(): { label: string; color: string; width: string } {
    let score = 0;
    if (length >= 12) score++;
    if (length >= 16) score++;
    if (length >= 20) score++;
    if (uppercase && lowercase) score++;
    if (numbers) score++;
    if (symbols) score++;

    if (score >= 5) return { label: 'Very Strong', color: 'bg-green-500', width: 'w-full' };
    if (score >= 4) return { label: 'Strong', color: 'bg-seafoam', width: 'w-4/5' };
    if (score >= 3) return { label: 'Good', color: 'bg-amber-500', width: 'w-3/5' };
    if (score >= 2) return { label: 'Fair', color: 'bg-orange-500', width: 'w-2/5' };
    return { label: 'Weak', color: 'bg-coral', width: 'w-1/5' };
  }

  const strength = getStrength();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-deep-ocean/10 px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-sm p-1 text-deep-ocean/50 hover:bg-deep-ocean/5 hover:text-deep-ocean"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-sm font-semibold text-deep-ocean">Password Generator</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Password display */}
        <div className="rounded-sm border border-deep-ocean/10 bg-white p-3">
          <p className="break-all font-mono text-sm text-deep-ocean leading-relaxed">
            {password || '...'}
          </p>
        </div>

        {/* Strength bar */}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-deep-ocean/8">
            <div className={`h-full rounded-full transition-all ${strength.color} ${strength.width}`} />
          </div>
          <span className="text-[10px] font-medium text-deep-ocean/50">{strength.label}</span>
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={generate}
            className="flex-1 rounded-sm border border-deep-ocean/15 py-2 text-xs font-medium text-deep-ocean/60 hover:bg-deep-ocean/5"
          >
            Regenerate
          </button>
          <button
            onClick={handleCopy}
            className="flex-1 rounded-sm bg-seafoam py-2 text-xs font-medium text-white hover:bg-[#4d8f87]"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Options */}
        <div className="mt-5 flex flex-col gap-4">
          {/* Length slider */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-deep-ocean/70">Length</label>
              <span className="font-mono text-xs text-deep-ocean/50">{length}</span>
            </div>
            <input
              type="range"
              min="8"
              max="64"
              value={length}
              onChange={(e) => {
                setLength(Number(e.target.value));
                setTimeout(generate, 0);
              }}
              className="mt-1 w-full accent-seafoam"
            />
          </div>

          {/* Character options */}
          <div className="flex flex-col gap-2.5">
            {[
              { label: 'Uppercase (A-Z)', checked: uppercase, onChange: setUppercase },
              { label: 'Lowercase (a-z)', checked: lowercase, onChange: setLowercase },
              { label: 'Numbers (0-9)', checked: numbers, onChange: setNumbers },
              { label: 'Symbols (!@#$...)', checked: symbols, onChange: setSymbols },
              { label: 'Exclude ambiguous (Il1O0)', checked: excludeAmbiguous, onChange: setExcludeAmbiguous },
            ].map(({ label, checked, onChange }) => (
              <label key={label} className="flex items-center gap-2.5 text-xs text-deep-ocean/70">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    onChange(e.target.checked);
                    setTimeout(generate, 0);
                  }}
                  className="h-3.5 w-3.5 rounded-sm border-deep-ocean/20 bg-white text-seafoam accent-seafoam"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
