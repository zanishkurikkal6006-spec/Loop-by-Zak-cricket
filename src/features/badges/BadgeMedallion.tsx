import PremiumBadge, { type GlyphKey } from './badgeArt';

// Animated premium medallion: rotating gold rays behind a crafted coin that
// pops in. Shared by the in-app reveal and the parent celebrate page.
export default function BadgeMedallion({
  glyph,
  accent = '#9C1116',
  size = 128,
}: {
  glyph: GlyphKey;
  accent?: string;
  size?: number;
}) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size * 1.3, height: size * 1.3 }}>
      <div
        className="animate-badge-rays absolute inset-0"
        style={{
          background: `conic-gradient(from 0deg, transparent 0 16deg, ${accent}1f 16deg 20deg, transparent 20deg 38deg, #C9A84C33 38deg 42deg, transparent 42deg)`,
          borderRadius: '9999px',
        }}
      />
      <div className="animate-badge-pop relative" style={{ filter: 'drop-shadow(0 12px 26px rgba(0,0,0,0.35))' }}>
        <PremiumBadge glyph={glyph} accent={accent} size={size} />
      </div>
    </div>
  );
}
