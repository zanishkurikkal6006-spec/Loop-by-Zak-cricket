import { Link } from 'react-router-dom';
import { useTodaysActions, type ActionItem, type ActionKey } from '@/lib/crmQueries';
import { Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { clsx } from '@/lib/utils';

// Today's Actions — one operational control screen. Every row is derived live
// from academy data and sorted by urgency, so an Operations Manager knows
// exactly what needs attention today. Each row links straight to where the work
// gets done.
const CONFIG: Record<ActionKey, { icon: string; hint: string; go: (b: string) => string }> = {
  overdue_followups: { icon: 'inbox',    hint: 'Past their due date',              go: (b) => `${b}/followups` },
  new_leads:         { icon: 'trending', hint: 'Not yet contacted',                go: (b) => `${b}/leads` },
  todays_trials:     { icon: 'calendar', hint: 'Scheduled for today',              go: (b) => `${b}/trials` },
  trials_to_assess:  { icon: 'badge',    hint: 'Attended, assessment outstanding', go: (b) => `${b}/trials` },
  renewals_due:      { icon: 'bell',     hint: '2 or fewer sessions left',         go: (b) => `${b}/leads` },
  overdue_payments:  { icon: 'card',     hint: 'Awaiting or pending',              go: (b) => `${b}/leads` },
};

const ORDER: Record<ActionItem['priority'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
const TONE: Record<ActionItem['priority'], 'red' | 'amber' | 'blue' | 'neutral'> = {
  critical: 'red', high: 'amber', medium: 'blue', low: 'neutral',
};

export default function TodaysActions({ base }: { base: string }) {
  const { data: actions = [], isLoading } = useTodaysActions();
  const sorted = [...actions].sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);
  const total = actions.reduce((s, a) => s + a.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Command Center" title="Today's Actions" />
        <Chip tone={total ? 'red' : 'green'}>{total} to action</Chip>
      </div>

      {isLoading && <Card className="text-[13px] text-ink/45">Loading today's queue…</Card>}

      {!isLoading && !sorted.length && (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon name="check" size={28} stroke="#1F8A4C" />
          <div className="font-display text-2xl">All clear</div>
          <p className="text-[13px] text-ink/45">Nothing needs attention right now.</p>
        </Card>
      )}

      <div className="space-y-3">
        {sorted.map((a) => {
          const c = CONFIG[a.key];
          return (
            <Link key={a.key} to={c.go(base)}>
              <Card className="flex items-center gap-4">
                <div className={clsx('flex h-11 w-11 items-center justify-center rounded-pill', barColor(a.priority))}>
                  <Icon name={c.icon} size={20} stroke="#fff" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">{a.label}</span>
                    <Chip tone={TONE[a.priority]} className="capitalize">{a.priority}</Chip>
                  </div>
                  <div className="text-[12px] text-ink/45">{c.hint}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-3xl leading-none">{a.count}</div>
                </div>
                <Icon name="chevronRight" size={18} stroke="#C4BDB2" />
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="px-1 text-[12px] text-ink/40">
        More action types — parent complaints, coach reports overdue, school follow-ups and
        capacity warnings — arrive with Phases 2–4.
      </p>
    </div>
  );
}

function barColor(priority: ActionItem['priority']): string {
  switch (priority) {
    case 'critical': return 'bg-danger';
    case 'high': return 'bg-amber-text';
    case 'medium': return 'bg-info';
    default: return 'bg-ink/40';
  }
}
