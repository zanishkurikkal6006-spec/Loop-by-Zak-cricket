import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCoaches } from '@/lib/queries';
import { ScreenTitle, Card, StatCard, Chip } from '@/components/ui';
import { RingAvatar } from '@/components/brand/LoopRing';

// Head Coach landing — development oversight across all coaches. NO finance.
// Per-coach card: sessions delivered, reports sent / pending, players, status.

interface CoachMetrics {
  coachId: string;
  sessions: number;
  reportsSent: number;
  reportsPending: number;
  players: number;
}

export default function HeadCoachDashboard() {
  const { profile } = useAuth();
  const { data: coaches = [] } = useCoaches();

  const { data: metrics } = useQuery({
    queryKey: ['head-coach-metrics', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Record<string, CoachMetrics>> => {
      const [sessions, reports, groups] = await Promise.all([
        supabase.from('one_to_one_sessions').select('logged_by'),
        supabase.from('reports').select('coach_id, status'),
        supabase.from('coach_groups').select('coach_id, group_id'),
      ]);

      const acc: Record<string, CoachMetrics> = {};
      const get = (id: string) =>
        (acc[id] ??= { coachId: id, sessions: 0, reportsSent: 0, reportsPending: 0, players: 0 });

      for (const s of (sessions.data ?? []) as { logged_by: string | null }[]) {
        if (s.logged_by) get(s.logged_by).sessions += 1;
      }
      for (const r of (reports.data ?? []) as { coach_id: string; status: string }[]) {
        const m = get(r.coach_id);
        if (r.status === 'sent') m.reportsSent += 1;
        else m.reportsPending += 1;
      }
      // Players reachable per coach = players in that coach's groups.
      const groupRows = (groups.data ?? []) as { coach_id: string; group_id: string }[];
      const groupIds = [...new Set(groupRows.map((g) => g.group_id))];
      if (groupIds.length) {
        const { data: players } = await supabase
          .from('players')
          .select('group_id')
          .in('group_id', groupIds);
        const countByGroup = new Map<string, number>();
        for (const p of (players ?? []) as { group_id: string }[]) {
          countByGroup.set(p.group_id, (countByGroup.get(p.group_id) ?? 0) + 1);
        }
        for (const g of groupRows) {
          get(g.coach_id).players += countByGroup.get(g.group_id) ?? 0;
        }
      }
      return acc;
    },
  });

  const totalSessions = Object.values(metrics ?? {}).reduce((s, m) => s + m.sessions, 0);
  const totalSent = Object.values(metrics ?? {}).reduce((s, m) => s + m.reportsSent, 0);
  const totalPending = Object.values(metrics ?? {}).reduce((s, m) => s + m.reportsPending, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Head Coach" title="Coaches" />
        <Chip tone="green">Development view · no finance</Chip>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Coaches" value={coaches.length} />
        <StatCard label="Sessions delivered" value={totalSessions} />
        <StatCard label="Reports sent" value={totalSent} tone="green" />
        <StatCard label="Reports pending" value={totalPending} tone={totalPending > 0 ? 'amber' : undefined} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {coaches.map((c) => {
          const m = metrics?.[c.id];
          const quiet = (m?.reportsSent ?? 0) === 0 && (m?.sessions ?? 0) === 0;
          return (
            <Card key={c.id} className="flex items-start gap-3">
              <RingAvatar name={c.full_name} size={48} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-semibold">{c.full_name}</div>
                  <Chip tone={quiet ? 'amber' : 'green'}>{quiet ? 'Quiet' : 'Reporting well'}</Chip>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <Metric label="Sessions" value={m?.sessions ?? 0} />
                  <Metric label="Sent" value={m?.reportsSent ?? 0} />
                  <Metric label="Pending" value={m?.reportsPending ?? 0} />
                  <Metric label="Players" value={m?.players ?? 0} />
                </div>
              </div>
            </Card>
          );
        })}
        {!coaches.length && <Card className="text-[13px] text-ink/45">No coaches yet.</Card>}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-eyebrow text-ink/40">{label}</div>
    </div>
  );
}
