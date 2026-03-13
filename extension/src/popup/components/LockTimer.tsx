import { useState, useEffect } from 'react';

const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export default function LockTimer() {
  const [remaining, setRemaining] = useState(LOCK_TIMEOUT_MS);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  return (
    <span className="text-[10px] text-deep-ocean/35" title="Auto-lock timer">
      {minutes}:{String(seconds).padStart(2, '0')}
    </span>
  );
}
