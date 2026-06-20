import { clsx } from '@/lib/utils';

// ── Buttons ──────────────────────────────────────────────────────────────────
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'gold' | 'dark' | 'ghost' | 'whatsapp';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-[0.12em] rounded-pill cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-[1.07]';
  const variants = {
    primary: 'text-paper border-none shadow-btn bg-gradient-to-b from-[#b1141a] to-[#7c0f14]',
    gold: 'text-ink border-none bg-gradient-to-b from-gold-light to-gold-dark',
    dark: 'text-paper bg-ink border-none',
    ghost: 'bg-white border border-cardborder text-ink/70',
    whatsapp: 'text-white border-none bg-whatsapp',
  };
  const sizes = {
    sm: 'h-9 px-4 text-[11px]',
    md: 'h-11 px-5 text-[12px]',
    lg: 'h-14 px-6 text-[14px]',
  };
  return <button className={clsx(base, variants[variant], sizes[size], className)} {...props} />;
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('card p-4 transition hover:border-gold/60', className)} {...props}>
      {children}
    </div>
  );
}

// ── Chip / state pill ────────────────────────────────────────────────────────
type ChipTone = 'green' | 'amber' | 'red' | 'blue' | 'gold' | 'comp' | 'neutral';

const chipTones: Record<ChipTone, string> = {
  green: 'bg-chip-green text-success',
  amber: 'bg-chip-amber text-amber-text',
  red: 'bg-chip-red text-danger',
  blue: 'bg-chip-blue text-info',
  gold: 'bg-chip-gold text-gold-dark',
  comp: 'bg-chip-comp text-[#7C3AED]',
  neutral: 'bg-hairline text-ink/60',
};

export function Chip({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-chip px-2.5 py-1 text-[11px] font-semibold',
        chipTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Eyebrow + title pair ─────────────────────────────────────────────────────
export function ScreenTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="display-title mt-1 text-3xl leading-none">{title}</h1>
    </div>
  );
}

// ── Info callout (blue policy note) ──────────────────────────────────────────
export function InfoCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-pill border border-[#C3D7F2] bg-chip-blue px-4 py-3 text-[13px] text-info">
      <span aria-hidden>ℹ️</span>
      <span>{children}</span>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  tone?: ChipTone;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-4xl leading-none', tone === 'amber' && 'text-amber-text', tone === 'red' && 'text-danger', tone === 'green' && 'text-success')}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink/45">{hint}</div>}
    </Card>
  );
}
