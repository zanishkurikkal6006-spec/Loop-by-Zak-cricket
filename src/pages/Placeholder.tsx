import { ScreenTitle } from '@/components/ui';

/** Temporary screen used until a feature module lands. */
export default function Placeholder({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow={eyebrow} title={title} />
      <div className="card flex h-48 items-center justify-center text-[13px] text-ink/40">
        Coming together — this screen is being built.
      </div>
    </div>
  );
}
