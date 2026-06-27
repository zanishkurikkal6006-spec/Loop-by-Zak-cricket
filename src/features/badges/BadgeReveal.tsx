import { useAuth } from '@/contexts/AuthContext';
import { sendWhatsApp, templates } from '@/lib/whatsapp';
import { firstName } from '@/lib/utils';
import { downloadBadgeCertificate } from '@/lib/badgePdf';
import { Icon } from '@/components/ui/Icon';

export interface RevealBadge {
  childName: string;
  badgeName: string;
  emblem: string | null;
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

  function share() {
    if (!badge || !profile || !badge.parentPhone) return;
    sendWhatsApp(
      badge.parentPhone,
      templates.badgeEarned(firstName(badge.childName), badge.badgeName),
      { academyId: profile.academy_id, playerId: badge.playerId ?? null, templateKey: 'badgeEarned' },
    );
  }

  function download() {
    if (!badge) return;
    downloadBadgeCertificate({
      childName: badge.childName,
      badgeName: badge.badgeName,
      emblem: badge.emblem,
      criteria: badge.criteria,
      academyName: 'Loop by Zak Cricket',
      date: new Date().toISOString().slice(0, 10),
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
        <div className="relative mx-auto mt-4 flex h-40 w-40 items-center justify-center">
          <div
            className="animate-badge-rays absolute inset-0"
            style={{
              background: `conic-gradient(from 0deg, transparent 0 18deg, ${accent}22 18deg 22deg, transparent 22deg 40deg, ${accent}22 40deg 44deg, transparent 44deg)`,
              borderRadius: '9999px',
            }}
          />
          <div
            className="animate-badge-pop relative flex h-32 w-32 items-center justify-center rounded-full"
            style={{ background: accent, boxShadow: `0 10px 30px ${accent}66` }}
          >
            <div className="absolute inset-2 rounded-full border-2" style={{ borderColor: '#C9A84C' }} />
            {/* shimmer sweep */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
              <div
                className="absolute top-0 h-full w-1/3 bg-white/25 blur-md"
                style={{ animation: 'badge-shimmer 2.4s ease-in-out 0.8s infinite' }}
              />
            </div>
            <span className="text-5xl">{badge.emblem || '🏅'}</span>
          </div>
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
