import { Link } from 'react-router-dom';
import { useCommandMetrics, useTodaysActions } from '@/lib/crmQueries';
import { GROWTH_TARGETS } from '@/lib/crm';
import { academyName } from '@/lib/branding';
import { Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { aed, clsx } from '@/lib/utils';

// Executive Command Center — the whole academy in five minutes. Every figure is
// live academy data; the growth ladder measures actual active players against
// the 24-month path to 500. Modules still to come (Phase 2/4) are labelled so
// nothing is faked.
export default function CommandCenter({ base }: { base: string }) {
  const { data: m } = useCommandMetrics();
  const { data: actions = [] } = useTodaysActions();

  const active = m?.activePlayers ?? 0;
  const target6 = GROWTH_TARGETS[5]; // Month 6 → 75
  const target24 = GROWTH_TARGETS[23]; // Month 24 → 500
  const nextMilestone = GROWTH_TARGETS.find((t) => t > active) ?? target24;
  const openActions = actions.reduce((s, a) => s + a.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <ScreenTitle eyebrow={`${academyName()} · Command Center`} title="Executive Dashboard" />
        <Link
          to={`${base}/actions`}
          className="hidden items-center gap-2 rounded-pill bg-ink px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-paper md:inline-flex"
        >
          <Icon name="check" size={14} /> Today · {openActions}
        </Link>
      </div>

      {/* ── Growth to 500 ── */}
      <Card className="bg-brand-panel text-paper">
        <div className="flex items-center justify-between">
          <div className="eyebrow text-gold-light">The path to 500</div>
          <Chip tone="gold">Next milestone · {nextMilestone}</Chip>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
          <Milestone value={active} label="Active now" big />
          <Milestone value={target6} label="Month 6 target" />
          <Milestone value={target24} label="Month 24 target" gold />
        </div>
        <GrowthLadder active={active} />
      </Card>

      {/* ── Funnel + growth ── */}
      <section>
        <div className="eyebrow mb-2 text-ink/40">Growth this period</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric to={`${base}/leads`} label="New leads · 30d" value={m?.newLeads30 ?? 0} icon="trending" />
          <Metric to={`${base}/trials`} label="Trials booked" value={m?.trialsBooked ?? 0} icon="calendar" />
          <Metric to={`${base}/trials`} label="Trials attended · mo" value={m?.trialsAttendedMonth ?? 0} icon="check" />
          <Metric to={`${base}/players`} label="New enrolments · mo" value={m?.newEnrolmentsMonth ?? 0} icon="users" tone="green" />
        </div>
      </section>

      {/* ── Commercial ── */}
      <section>
        <div className="eyebrow mb-2 text-ink/40">Commercial</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Revenue · this month" value={aed(m?.monthRevenue ?? 0)} icon="wallet" tone="green" />
          <Metric label="Outstanding" value={aed(m?.outstanding ?? 0)} icon="card" tone={m?.outstanding ? 'amber' : undefined} />
          <Metric label="Avg revenue / player" value={aed(m?.arpu ?? 0)} icon="chart" />
          <Metric label="Renewals due" value={m?.renewalsDue ?? 0} icon="bell" tone={m?.renewalsDue ? 'amber' : undefined} />
        </div>
      </section>

      {/* ── Retention (early signal + what's coming) ── */}
      <section>
        <div className="eyebrow mb-2 text-ink/40">Retention &amp; experience</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="At-risk (not seen 14d)" value={m?.atRisk ?? 0} icon="flag" tone={m?.atRisk ? 'red' : undefined} />
          <Metric label="Exited players" value={m?.exitedPlayers ?? 0} icon="users" />
          <ComingSoon label="Player health score" phase="Phase 2" />
          <ComingSoon label="Open parent issues" phase="Phase 2" />
        </div>
      </section>

      {/* ── Today's priorities preview ── */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="eyebrow text-ink/40">Needs attention today</div>
          <Link to={`${base}/actions`} className="text-[12px] font-semibold text-brand-red">
            Open Today's Actions →
          </Link>
        </div>
        {actions.length ? (
          <div className="mt-3 space-y-2">
            {actions.slice(0, 5).map((a) => (
              <div key={a.key} className="flex items-center justify-between rounded-pill bg-hairline px-3 py-2">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <PriorityDot priority={a.priority} /> {a.label}
                </span>
                <span className="font-display text-lg leading-none">{a.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-ink/45">Nothing outstanding right now. 🎉</p>
        )}
      </Card>
    </div>
  );
}

function Milestone({ value, label, big, gold }: { value: number; label: string; big?: boolean; gold?: boolean }) {
  return (
    <div>
      <div className={clsx('font-display leading-none', big ? 'text-5xl' : 'text-3xl', gold && 'text-gold-light')}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-paper/55">{label}</div>
    </div>
  );
}

function GrowthLadder({ active }: { active: number }) {
  const max = GROWTH_TARGETS[GROWTH_TARGETS.length - 1];
  return (
    <div className="mt-4">
      <div className="flex h-14 items-end gap-[3px]">
        {GROWTH_TARGETS.map((t, i) => {
          const reached = active >= t;
          const milestone = i === 2 || i === 5 || i === 11 || i === 23;
          return (
            <div
              key={i}
              title={`Month ${i + 1}: ${t}`}
              className={clsx(
                'flex-1 rounded-[2px]',
                reached ? 'bg-gold' : milestone ? 'bg-white/35' : 'bg-white/15',
              )}
              style={{ height: `${(t / max) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-[0.15em] text-paper/40">
        <span>M1 · 10</span><span>M6 · 75</span><span>M12 · 200</span><span>M24 · 500</span>
      </div>
    </div>
  );
}

function Metric({
  label, value, icon, tone, to,
}: {
  label: string; value: string | number; icon: string;
  tone?: 'green' | 'amber' | 'red'; to?: string;
}) {
  const body = (
    <Card className={clsx('flex flex-col gap-1', to && 'cursor-pointer')}>
      <div className="flex items-center justify-between">
        <div className="eyebrow text-ink/40">{label}</div>
        <Icon name={icon} size={15} stroke="#B9B2A8" />
      </div>
      <div
        className={clsx(
          'font-display text-3xl leading-none',
          tone === 'green' && 'text-success',
          tone === 'amber' && 'text-amber-text',
          tone === 'red' && 'text-danger',
        )}
      >
        {value}
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function ComingSoon({ label, phase }: { label: string; phase: string }) {
  return (
    <Card className="flex flex-col gap-1 opacity-70">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className="font-display text-3xl leading-none text-ink/25">—</div>
      <Chip tone="neutral" className="mt-0.5 w-fit">{phase}</Chip>
    </Card>
  );
}

function PriorityDot({ priority }: { priority: 'critical' | 'high' | 'medium' | 'low' }) {
  const color = priority === 'critical' ? 'bg-danger'
    : priority === 'high' ? 'bg-amber-text'
    : priority === 'medium' ? 'bg-info' : 'bg-ink/30';
  return <span className={clsx('inline-block h-2 w-2 rounded-full', color)} />;
}
