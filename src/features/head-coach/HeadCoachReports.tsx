import { useState } from 'react';
import { useAllReports } from '@/lib/queries';
import { ScreenTitle, Card, Chip } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { clsx } from '@/lib/utils';

// Academy-wide report stream. Every row is clickable → a reader modal showing
// the full report text exactly as the parent received it. The coach still owns
// sending; the head coach only reviews/monitors.

type Filter = 'all' | 'sent' | 'draft';

export default function HeadCoachReports() {
  const { data: reports = [], isLoading } = useAllReports();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const open = reports.find((r) => r.id === openId) ?? null;

  const filtered = reports.filter((r) => (filter === 'all' ? true : r.status === filter));

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Head Coach" title="All Reports" />

      <div className="flex gap-2">
        {(['all', 'sent', 'draft'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'rounded-chip px-3 py-1.5 text-[12px] font-semibold capitalize transition',
              filter === f ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
            )}
          >
            {f === 'draft' ? 'Drafts' : f}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-[13px] text-ink/45">Loading reports…</div>}

      <Card className="divide-y divide-hairline p-0">
        {filtered.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenId(r.id)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hairline/50"
          >
            <div className="flex-1 min-w-0">
              <div className="truncate text-[14px] font-medium">{r.player?.full_name ?? 'Player'}</div>
              <div className="text-[11px] text-ink/45">
                {r.coach?.full_name ?? 'Coach'} · {r.type === 'quick' ? 'Quick feedback' : 'Development'} ·{' '}
                {new Date(r.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
              </div>
            </div>
            <Chip tone={r.status === 'sent' ? 'green' : 'amber'}>{r.status === 'sent' ? 'Sent' : 'Draft'}</Chip>
          </button>
        ))}
        {!filtered.length && !isLoading && (
          <div className="px-4 py-6 text-center text-[13px] text-ink/45">No reports match this filter.</div>
        )}
      </Card>

      {/* Reader modal — exact parent-facing text. */}
      <Modal
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.player?.full_name ?? 'Report'}
      >
        {open && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[12px] text-ink/55">
              <Chip tone="neutral">{open.coach?.full_name}</Chip>
              <Chip tone="gold">{open.type === 'quick' ? 'Quick feedback' : 'Development report'}</Chip>
              <Chip tone={open.status === 'sent' ? 'green' : 'amber'}>
                {open.status === 'sent' ? 'Sent to parent' : 'Draft'}
              </Chip>
            </div>
            <div className="whitespace-pre-wrap rounded-card border border-cardborder bg-white p-4 text-[14px] leading-relaxed">
              {open.final_text || open.ai_draft || open.raw_notes || 'No content.'}
            </div>
            <p className="text-[11px] text-ink/45">
              You review &amp; monitor — the coach still owns sending.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
