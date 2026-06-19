import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingAttendance, useCoaches } from '@/lib/queries';
import { StatCard, InfoCallout, Card, ScreenTitle } from '@/components/ui';
import { aed } from '@/lib/utils';

// Admin dashboard: stat cards, the permanent payment policy callout, a financial
// overview, and per-coach activity.
export default function AdminDashboard() {
  const { profile } = useAuth();
  const { data: pending = [] } = usePendingAttendance();
  const { data: coaches = [] } = useCoaches();

  const stats = useQuery({
    queryKey: ['admin-stats', profile?.academy_id],
    enabled: !!profile,
    queryFn: async () => {
      const [players, reports, programs, payments] = await Promise.all([
        supabase.from('players').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
        supabase.from('programs').select('id', { count: 'exact', head: true }),
        supabase.from('payments').select('amount, status'),
      ]);
      const rows = (payments.data ?? []) as { amount: number; status: string }[];
      const collected = rows.filter((r) => r.status === 'confirmed').reduce((s, r) => s + Number(r.amount), 0);
      const outstanding = rows
        .filter((r) => r.status !== 'confirmed')
        .reduce((s, r) => s + Number(r.amount), 0);
      const pendingCount = rows.filter((r) => r.status !== 'confirmed').length;
      return {
        players: players.count ?? 0,
        reports: reports.count ?? 0,
        programs: programs.count ?? 0,
        pendingPayments: pendingCount,
        collected,
        outstanding,
      };
    },
  });

  const s = stats.data;

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Admin" title="Dashboard" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Players" value={s?.players ?? '—'} />
        <StatCard label="Reports Sent" value={s?.reports ?? '—'} />
        <StatCard label="Programs" value={s?.programs ?? '—'} />
        <StatCard
          label="Pending Payments"
          value={s?.pendingPayments ?? '—'}
          tone={(s?.pendingPayments ?? 0) > 0 ? 'amber' : undefined}
        />
      </div>

      <InfoCallout>
        Sessions still count for every player — even with payment pending.
      </InfoCallout>

      {/* Financial overview */}
      <div className="rounded-card bg-gradient-to-br from-brand-deep to-ink p-5 text-paper shadow-card-lg">
        <div className="eyebrow text-gold">Financial Overview</div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <div className="font-display text-3xl leading-none text-success">
              {s ? aed(s.collected) : '—'}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/50">Collected</div>
          </div>
          <div>
            <div className="font-display text-3xl leading-none text-amber">
              {s ? aed(s.outstanding) : '—'}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/50">
              Outstanding
            </div>
          </div>
          <div>
            <div className="font-display text-3xl leading-none">
              {s ? aed(s.collected - s.outstanding) : '—'}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/50">Net</div>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <InfoCallout>
          {pending.length} attendance submission{pending.length === 1 ? '' : 's'} awaiting your
          confirmation.
        </InfoCallout>
      )}

      {/* Coach activity */}
      <Card>
        <div className="eyebrow text-ink/40">Coach Activity</div>
        <div className="mt-3 divide-y divide-hairline">
          {coaches.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2.5">
              <span className="text-[14px] font-medium">{c.full_name}</span>
              <span className="text-[12px] text-ink/45">{c.status}</span>
            </div>
          ))}
          {!coaches.length && <div className="py-2 text-[13px] text-ink/45">No coaches yet.</div>}
        </div>
      </Card>
    </div>
  );
}
