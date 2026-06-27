// The animated badge medallion (popping disc + gold ring + rotating rays +
// shimmer). Shared by the in-app reveal and the parent celebrate page.
export default function BadgeMedallion({
  emblem,
  accent = '#9C1116',
  size = 128,
}: {
  emblem: string | null;
  accent?: string;
  size?: number;
}) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size * 1.25, height: size * 1.25 }}>
      <div
        className="animate-badge-rays absolute inset-0"
        style={{
          background: `conic-gradient(from 0deg, transparent 0 18deg, ${accent}22 18deg 22deg, transparent 22deg 40deg, ${accent}22 40deg 44deg, transparent 44deg)`,
          borderRadius: '9999px',
        }}
      />
      <div
        className="animate-badge-pop relative flex items-center justify-center rounded-full"
        style={{ width: size, height: size, background: accent, boxShadow: `0 10px 30px ${accent}66` }}
      >
        <div className="absolute inset-2 rounded-full border-2" style={{ borderColor: '#C9A84C' }} />
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <div
            className="absolute top-0 h-full w-1/3 bg-white/25 blur-md"
            style={{ animation: 'badge-shimmer 2.4s ease-in-out 0.8s infinite' }}
          />
        </div>
        <span style={{ fontSize: size * 0.4, lineHeight: 1 }}>{emblem || '🏅'}</span>
      </div>
    </div>
  );
}
