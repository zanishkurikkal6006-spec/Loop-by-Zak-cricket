import { useAuth } from '@/contexts/AuthContext';
import { sendWhatsApp } from '@/lib/whatsapp';
import { firstName } from '@/lib/utils';
import { academyName, academyLogoUrl } from '@/lib/branding';
import { downloadBadgeImage } from '@/lib/badgeImage';
import { Icon } from '@/components/ui/Icon';
import BadgeMedallion from './BadgeMedallion';
import type { GlyphKey } from './badgeArt';

export interface RevealBadge {
  childName: string;
  badgeName: string;
  glyph: GlyphKey;
  criteria: string | null;
  accent?: string | null;
  parentPhone?: string | null;
  playerId?: string | null;
}

// Celebratory "unboxing" — a full-screen reveal with a popping medallion, gold
// rays, and confetti so awarding a badge feels like a moment, then lets you
// download the certificate or share it with the parent.
const CONFETTI = ['#9C1116', '#C9A84C', '#1F8A4C', '#2563EB', '#C9A84C', '#9C1116'];

export default function BadgeReveal({ badge, onClose }: { badge: RevealBadge | null; onClose: () => void }) {
  const { profile } = useAuth();
  if (!badge) return null;
  const accent = badge.accent || '#9C1116';

  function celebrateUrl() {
    if (!badge) return '';
    const p = new URLSearchParams({
      n: firstName(badge.childName),
      b: badge.badgeName,
      g: badge.glyph,
      ac: academyName(),
      ...(academyLogoUrl() ? { lo: academyLogoUrl() as string } : {}),
      ...(badge.criteria ? { c: badge.criteria } : {}),
      ...(badge.accent ? { a: badge.accent } : {}),
    });
    return `${window.location.origin}/celebrate?${p.toString()}`;
  }

  function share() {
    if (!badge || !profile || !badge.parentPhone) return;
    const link = celebrateUrl();
    const body = `🏅 ${badge.childName} just earned the "${badge.badgeName}" badge at ${academyName()}! Tap to open their celebration:\n${link}`;
    sendWhatsApp(badge.parentPhone, body, {
      academyId: profile.academy_id,
      playerId: badge.playerId ?? null,
      templateKey: 'badgeEarned',
    });
  }

  function download() {
    if (!badge) return;
    void downloadBadgeImage({
      childName: badge.childName,
      badgeName: badge.badgeName,
      glyph: badge.glyph,
      criteria: badge.criteria,
      accent: badge.accent ?? undefined,
      academyName: academyName(),
      logoUrl: academyLogoUrl(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-card bg-paper p-6 text-center shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Confetti */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="absolute block h-2 w-2 rounded-[2px]"
              style={{
                left: `${(i * 7 + 6) % 96}%`,
                top: '-10px',
                background: CONFETTI[i % CONFETTI.length],
                animation: `confetti-fall ${1.6 + (i % 5) * 0.25}s ease-in ${0.2 + (i % 6) * 0.12}s both`,
              }}
            />
          ))}
        </div>

        <div className="text-[11px] font-semibold uppercase tracking-eyebrow text-brand-red">Badge earned</div>

        {/* Medallion with rotating rays */}
        <div className="mx-auto mt-4 flex justify-center">
          <BadgeMedallion glyph={badge.glyph} accent={accent} size={128} />
        </div>

        <div className="animate-badge-rise">
          <div className="mt-5 font-display text-3xl leading-none">{badge.badgeName}</div>
          {badge.criteria && <div className="mt-1 text-[12px] text-ink/55">{badge.criteria}</div>}
          <div className="mt-3 text-[13px] text-ink/70">
            Congratulations <span className="font-semibold text-ink">{badge.childName}</span>! 🎉
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={download}
              className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand-red px-4 py-2.5 text-[13px] font-semibold text-paper"
            >
              <Icon name="download" size={15} /> Download certificate
            </button>
            {badge.parentPhone && (
              <button
                onClick={share}
                className="inline-flex items-center justify-center gap-2 rounded-pill bg-whatsapp px-4 py-2.5 text-[13px] font-semibold text-white"
              >
                <Icon name="whatsapp" size={15} /> Share with parent
              </button>
            )}
            <button onClick={onClose} className="rounded-pill px-4 py-2 text-[12px] font-semibold text-ink/50">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
