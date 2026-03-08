'use client';

interface ShorestackLogoProps {
  variant?: 'horizontal' | 'stacked' | 'mark';
  subbrand?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function ShorestackLogo({
  variant = 'horizontal',
  subbrand,
  color = '#1b4965',
  size = 'md',
}: ShorestackLogoProps) {
  const sizeMap = {
    sm: { mark: 20, fontSize: '0.875rem', gap: '0.375rem' },
    md: { mark: 28, fontSize: '1.125rem', gap: '0.5rem' },
    lg: { mark: 40, fontSize: '1.75rem', gap: '0.625rem' },
  };

  const dims = sizeMap[size];

  // Wave mark: simplified wave icon matching the actual Shorestack logo
  const WaveMark = () => {
    const s = dims.mark;
    return (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Top frame line */}
        <line x1="2" y1="4" x2="38" y2="4" stroke={color} strokeWidth="1.5" />
        {/* 11 wave lines */}
        {Array.from({ length: 11 }).map((_, i) => {
          const y = 6 + i * 2.8;
          const amp = 3 + Math.sin((i / 10) * Math.PI) * 4;
          const d = `M 2 ${y} Q 12 ${y - amp}, 20 ${y} Q 28 ${y + amp}, 38 ${y}`;
          return (
            <path
              key={i}
              d={d}
              stroke={color}
              strokeWidth="1"
              fill="none"
            />
          );
        })}
        {/* Bottom frame line */}
        <line x1="2" y1="37" x2="38" y2="37" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  };

  if (variant === 'mark') {
    return <WaveMark />;
  }

  // Build the text: "SHORESTACK" + optional subbrand like "VAULT"
  const brandText = subbrand ? `SHORESTACK ${subbrand.toUpperCase()}` : 'SHORESTACK';

  if (variant === 'stacked') {
    return (
      <div className="flex flex-col items-center" style={{ gap: dims.gap }}>
        <WaveMark />
        <span
          style={{
            fontSize: dims.fontSize,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 700,
            color,
            letterSpacing: '0.05em',
            lineHeight: 1,
          }}
        >
          {brandText}
        </span>
      </div>
    );
  }

  // horizontal — matches shorestack.io nav: [wave icon] SHORESTACK VAULT
  return (
    <div className="flex items-center" style={{ gap: dims.gap }}>
      <WaveMark />
      <span
        style={{
          fontSize: dims.fontSize,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 700,
          color,
          letterSpacing: '0.05em',
          lineHeight: 1,
        }}
      >
        {brandText}
      </span>
    </div>
  );
}
