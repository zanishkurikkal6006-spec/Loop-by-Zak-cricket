// The signature loop/ring — a gold ring is the brand's core mark. It frames the
// logo, every badge, the 1-on-1 session tracker (filling progress ring) and
// attendance gauges. One ring component, reused everywhere (per the handoff).

interface LoopRingProps {
  /** 0–1 fill fraction. Omit for a static decorative ring. */
  progress?: number;
  size?: number;
  stroke?: number;
  /** Ring color; defaults to gold. Use success/amber/danger for trackers. */
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
  className?: string;
}

export function LoopRing({
  progress,
  size = 56,
  stroke = 4,
  color = '#C9A84C',
  trackColor = '#ECE7E1',
  children,
  className,
}: LoopRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = progress == null ? 1 : Math.max(0, Math.min(1, progress));
  const dash = c * clamped;

  return (
    <div
      className={className}
      style={{ position: 'relative', width: size, height: size, flex: 'none' }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        {progress != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        )}
        {progress == null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} />
        )}
      </svg>
      {children != null && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Loop-ring framed avatar (initials), used across player/coach lists. */
export function RingAvatar({
  name,
  size = 44,
  color = '#C9A84C',
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <LoopRing size={size} stroke={2} color={color}>
      <div
        className="flex items-center justify-center rounded-full font-semibold text-white"
        style={{
          width: size - 8,
          height: size - 8,
          background: 'linear-gradient(180deg,#9C1116,#6E0C10)',
          fontSize: size * 0.3,
        }}
      >
        {initials}
      </div>
    </LoopRing>
  );
}
