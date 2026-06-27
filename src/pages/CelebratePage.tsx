import { useSearchParams } from 'react-router-dom';
import { Wordmark } from '@/components/brand/LoopMark';
import { downloadBadgeImage } from '@/lib/badgeImage';
import BadgeMedallion from '@/features/badges/BadgeMedallion';

// Public, no-auth "unboxing" a parent opens from a shared link — the same
// celebratory reveal the coach saw, in the parent's own browser.
const CONFETTI = ['#9C1116', '#C9A84C', '#1F8A4C', '#2563EB', '#C9A84C', '#9C1116'];

export default function CelebratePage() {
  const [params] = useSearchParams();
  const childName = params.get('n') ?? 'Your child';
  const badgeName = params.get('b') ?? 'a badge';
  const emblem = params.get('e');
  const criteria = params.get('c');
  const accent = params.get('a') || '#9C1116';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-brand-deep to-ink p-6 text-center text-paper">
      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className="absolute block h-2.5 w-2.5 rounded-[2px]"
            style={{
              left: `${(i * 4.5 + 3) % 98}%`,
              top: '-12px',
              background: CONFETTI[i % CONFETTI.length],
              animation: `confetti-fall ${1.8 + (i % 5) * 0.3}s ease-in ${0.1 + (i % 7) * 0.13}s both`,
            }}
          />
        ))}
      </div>

      <div className="mb-6"><Wordmark size={22} light /></div>

      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold">Badge earned</div>

      <div className="my-6">
        <BadgeMedallion emblem={emblem} accent={accent} size={150} />
      </div>

      <div className="animate-badge-rise">
        <div className="font-display text-4xl leading-none">{badgeName}</div>
        {criteria && <div className="mt-2 text-[13px] text-paper/60">{criteria}</div>}
        <div className="mt-5 text-[15px]">
          Congratulations <span className="font-semibold text-gold">{childName}</span>! 🎉
        </div>
        <p className="mx-auto mt-2 max-w-xs text-[12px] text-paper/55">
          Awarded at Loop by Zak Cricket for outstanding effort on and off the pitch.
        </p>

        <button
          onClick={() =>
            downloadBadgeImage({ childName, badgeName, emblem, criteria, accent })
          }
          className="mt-6 rounded-pill bg-gold px-5 py-2.5 text-[13px] font-semibold text-ink"
        >
          Save the certificate
        </button>
      </div>
    </div>
  );
}
