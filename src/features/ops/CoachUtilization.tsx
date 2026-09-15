import { useCoachUtilization, type CoachScore } from '@/lib/opsQueries';
import { useAuth } from '@/contexts/AuthContext';
import { sendWhatsApp, templates } from '@/lib/whatsapp';
import { firstName, clsx } from '@/lib/utils';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';

// Coach Utilization — a balanced scorecard per coach, never a single ranking.
// Load, output and freshness sit side by side so the picture is fair.
export default function CoachUtilization() {
  const { data: coaches = [] } = useCoachUtilization();

  const totals = coaches.reduce(
    (a, c) => ({ sessions: a.sessions + c.sessions, players: a.players + c.playersCoached, reports: a.reports + c.reports }),
    { sessions: 0, players: 0, reports: 0 },
  );

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Team" title="Coach Utilization" />

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Sessions led" value={totals.sessions} />
        <Tile label="Players coached" value={totals.players} />
        <Tile label="Reports written" value={totals.reports} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {coaches.map((c) => <CoachCard key={c.coach.id} score={c} />)}
        {!coaches.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">No coaches yet.</div>
        )}
      </div>

      <p className="px-1 text-[12px] text-ink/40">
        Balanced scorecards, not a league table — load and output are shown together. Parent feedback,
        CPD and retention-by-coach join in with the AI coaching analyst (Phase 6).
      </p>
    </div>
  );
}

function CoachCard({ score }: { score: CoachScore }) {
  const { profile } = useAuth();
  const { coach } = score;
  const stale = score.daysSinceReport != null && score.daysSinceReport > 14;
  const never = score.daysSinceReport == null;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold">{coach.full_name}</div>
          <div className="text-[12px] text-ink/45 capitalize">{coach.role.replace('_', ' ')}</div>
        </div>
        {never ? <Chip tone="red">No reports</Chip>
          : stale ? <Chip tone="amber">{score.daysSinceReport}d since report</Chip>
          : <Chip tone="green">Reporting current</Chip>}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <Metric label="Sessions" value={score.sessions} />
        <Metric label="Players" value={score.playersCoached} />
        <Metric label="Avg group" value={score.avgGroupSize} />
        <Metric label="Assess." value={score.assessments} />
      </div>

      <div className="flex items-center justify-between text-[12px] text-ink/55">
        <span>{score.reportsSent}/{score.reports} reports sent · {score.groups} group{score.groups === 1 ? '' : 's'}</span>
        {coach.phone && (stale || never) && (
          <Button
            size="sm" variant="whatsapp"
            onClick={() => sendWhatsApp(
              coach.phone!,
              templates.coachReminder(firstName(coach.full_name), score.daysSinceReport),
              { academyId: profile!.academy_id, templateKey: 'coach_reminder', refType: 'coach', refId: coach.id },
            )}
          >
            <Icon name="whatsapp" size={13} stroke="#fff" /> Nudge
          </Button>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-chip bg-hairline py-1.5">
      <div className="font-display text-lg leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-eyebrow text-ink/40">{label}</div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-3xl leading-none')}>{value}</div>
    </Card>
  );
}
