import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCommandMetrics, useTodaysActions, type ActionItem } from '@/lib/crmQueries';
import { computeGrowthForecast } from '@/lib/forecast';
import { GROWTH_TARGETS } from '@/lib/crm';
import { academyName } from '@/lib/branding';
import { Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { aed, clsx } from '@/lib/utils';

type Variant = 'director' | 'ops';

// Command Center — two distinct views on the same academy:
//   • Director  → strategic: growth vs the 500 plan, forecast, revenue, expansion.
//   • Ops       → operational: what needs attention today, funnel, retention.
// Every figure is live academy data.
export default function CommandCenter({ base, variant = 'director' }: { base: string; variant?: Variant }) {
  return variant === 'ops' ? <OpsDashboard base={base} /> : <DirectorDashboard base={base} />;
}

// ── Director: the whole business in five minutes ───────────────────────────────
function DirectorDashboard({ base }: { base: string }) {
  const { data: m } = useCommandMetrics();
  const forecast = useQuery({ queryKey: ['forecast'], queryFn: computeGrowthForecast });
  const f = forecast.data;

  const active = m?.activePlayers ?? 0;
  const target6 = GROWTH_TARGETS[5];
  const target24 = GROWTH_TARGETS[23];
  const nextMilestone = GROWTH_TARGETS.find((t) => t > active) ?? target24;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <ScreenTitle eyebrow={`${academyName()} · Director`} title="Executive Dashboard" />
        <Link to={`${base}/strategy`} className="hidden items-center gap-2 rounded-pill bg-ink px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-paper md:inline-flex">
          <Icon name="compass" size={14} /> Strategy
        </Link>
      </div>

      {/* Growth to 500 */}
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

      {/* Forecast — strategic, Director-only */}
      <section>
        <div className="eyebrow mb-2 text-ink/40">Forecast</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Net growth / month" value={f ? `${f.net >= 0 ? '+' : ''}${f.net}` : '—'} icon="trending" tone={f && f.net > 0 ? 'green' : f && f.net < 0 ? 'red' : undefined} />
          <Metric label="On track vs plan" value={f ? `${f.onTrackDelta >= 0 ? '+' : ''}${f.onTrackDelta}` : '—'} icon="gauge" tone={f && f.onTrackDelta >= 0 ? 'green' : 'red'} />
          <Metric label="Projected to 500" value={f?.reachDate ?? '—'} icon="compass" />
          <Metric label="Avg revenue / player" value={aed(m?.arpu ?? 0)} icon="chart" />
        </div>
      </section>

      {/* Commercial */}
      <section>
        <div className="eyebrow mb-2 text-ink/40">Commercial</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric to={`${base}/revenue`} label="Revenue · this month" value={aed(m?.monthRevenue ?? 0)} icon="wallet" tone="green" />
          <Metric to={`${base}/revenue`} label="Outstanding" value={aed(m?.outstanding ?? 0)} icon="card" tone={m?.outstanding ? 'amber' : undefined} />
          <Metric to={`${base}/churn`} label="Exited players" value={m?.exitedPlayers ?? 0} icon="users" />
          <Metric to={`${base}/retention`} label="At-risk players" value={m?.atRisk ?? 0} icon="flag" tone={m?.atRisk ? 'red' : undefined} />
        </div>
      </section>

      {/* Growth this period */}
      <section>
        <div className="eyebrow mb-2 text-ink/40">Growth this period</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric to={`${base}/leads`} label="New leads · 30d" value={m?.newLeads30 ?? 0} icon="trending" />
          <Metric to={`${base}/trials`} label="Trials booked" value={m?.trialsBooked ?? 0} icon="calendar" />
          <Metric to={`${base}/trials`} label="Trials attended · mo" value={m?.trialsAttendedMonth ?? 0} icon="check" />
          <Metric to={`${base}/players`} label="New enrolments · mo" value={m?.newEnrolmentsMonth ?? 0} icon="users" tone="green" />
        </div>
      </section>

      {/* Strategy teaser */}
      <Link to={`${base}/strategy`}>
        <Card className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-pill bg-gold-light/30"><Icon name="compass" size={22} stroke="#937328" /></div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold">Strategy &amp; forecasting</div>
            <div className="text-[12px] text-ink/50">500-player plan, scenario planner, expansion signals and the Monthly Business Review.</div>
          </div>
          <Icon name="chevronRight" size={18} stroke="#C4BDB2" />
        </Card>
      </Link>
    </div>
  );
}

// ── Operations Manager: what needs attention today ─────────────────────────────
function OpsDashboard({ base }: { base: string }) {
  const { data: m } = useCommandMetrics();
  const { data: actions = [] } = useTodaysActions();
  const openActions = actions.reduce((s, a) => s + a.count, 0);
  const ordered = [...actions].sort((a, b) => order(a.priority) - order(b.priority));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <ScreenTitle eyebrow={`${academyName()} · Operations`} title="Operations Dashboard" />
        <Chip tone={openActions ? 'red' : 'green'}>{openActions} to action</Chip>
      </div>

      {/* Today's Actions — front and centre for Ops */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="eyebrow text-ink/40">Needs attention today</div>
          <Link to={`${base}/actions`} className="text-[12px] font-semibold text-brand-red">Open full queue →</Link>
        </div>
        {ordered.length ? (
          <div className="mt-3 space-y-2">
            {ordered.map((a) => (
              <Link key={a.key} to={actionLink(base, a)} className="flex items-center justify-between rounded-pill bg-hairline px-3 py-2.5 hover:bg-chip-gold">
                <span className="flex items-center gap-2 text-[13px] font-medium"><PriorityDot priority={a.priority} /> {a.label}</span>
                <span className="font-display text-lg leading-none">{a.count}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-ink/45">All clear — nothing needs attention right now. 🎉</p>
        )}
      </Card>

      {/* Operational health */}
      <section>
        <div className="eyebrow mb-2 text-ink/40">Operational health</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric to={`${base}/retention`} label="At-risk players" value={m?.atRisk ?? 0} icon="flag" tone={m?.atRisk ? 'red' : undefined} />
          <Metric to={`${base}/payments`} label="Renewals due" value={m?.renewalsDue ?? 0} icon="bell" tone={m?.renewalsDue ? 'amber' : undefined} />
          <Metric to={`${base}/payments`} label="Outstanding" value={aed(m?.outstanding ?? 0)} icon="card" tone={m?.outstanding ? 'amber' : undefined} />
          <Metric to={`${base}/capacity`} label="Active players" value={m?.activePlayers ?? 0} icon="users" />
        </div>
      </section>

      {/* Funnel this period */}
      <section>
        <div className="eyebrow mb-2 text-ink/40">Pipeline this period</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric to={`${base}/leads`} label="New leads · 30d" value={m?.newLeads30 ?? 0} icon="trending" />
          <Metric to={`${base}/trials`} label="Trials booked" value={m?.trialsBooked ?? 0} icon="calendar" />
          <Metric to={`${base}/trials`} label="Trials attended · mo" value={m?.trialsAttendedMonth ?? 0} icon="check" />
          <Metric to={`${base}/players`} label="New enrolments · mo" value={m?.newEnrolmentsMonth ?? 0} icon="users" tone="green" />
        </div>
      </section>
    </div>
  );
}

function order(p: ActionItem['priority']): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[p];
}
function actionLink(base: string, a: ActionItem): string {
  if (a.key === 'new_leads' || a.key === 'renewals_due') return `${base}/leads`;
  if (a.key === 'overdue_followups') return `${base}/followups`;
  if (a.key === 'todays_trials' || a.key === 'trials_to_assess') return `${base}/trials`;
  if (a.key === 'overdue_payments') return `${base}/payments`;
  return `${base}/actions`;
}

function Milestone({ value, label, big, gold }: { value: number; label: string; big?: boolean; gold?: boolean }) {
  return (
    <div>
      <div className={clsx('font-display leading-none', big ? 'text-5xl' : 'text-3xl', gold && 'text-gold-light')}>{value}</div>
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
            <div key={i} title={`Month ${i + 1}: ${t}`}
              className={clsx('flex-1 rounded-[2px]', reached ? 'bg-gold' : milestone ? 'bg-white/35' : 'bg-white/15')}
              style={{ height: `${(t / max) * 100}%` }} />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-[0.15em] text-paper/40">
        <span>M1 · 10</span><span>M6 · 75</span><span>M12 · 200</span><span>M24 · 500</span>
      </div>
    </div>
  );
}

function Metric({ label, value, icon, tone, to }: {
  label: string; value: string | number; icon: string; tone?: 'green' | 'amber' | 'red'; to?: string;
}) {
  const body = (
    <Card className={clsx('flex flex-col gap-1', to && 'cursor-pointer')}>
      <div className="flex items-center justify-between">
        <div className="eyebrow text-ink/40">{label}</div>
        <Icon name={icon} size={15} stroke="#B9B2A8" />
      </div>
      <div className={clsx('font-display text-3xl leading-none', tone === 'green' && 'text-success', tone === 'amber' && 'text-amber-text', tone === 'red' && 'text-danger')}>
        {value}
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function PriorityDot({ priority }: { priority: ActionItem['priority'] }) {
  const color = priority === 'critical' ? 'bg-danger' : priority === 'high' ? 'bg-amber-text' : priority === 'medium' ? 'bg-info' : 'bg-ink/30';
  return <span className={clsx('inline-block h-2 w-2 rounded-full', color)} />;
}
