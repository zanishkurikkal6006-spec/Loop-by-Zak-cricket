import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingAttendance, useCoaches, usePlayerBadges, usePrograms } from '@/lib/queries';
import { StatCard, InfoCallout, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { aed, firstName } from '@/lib/utils';

// Admin dashboard — a detailed academy snapshot: headline stats, financial +
// match/ground P&L, a "needs attention" action list, this-week activity, top
// programs, and per-coach status.
export default function AdminDashboard() {
  const { profile } = useAuth();
  const { data: pending = [] } = usePendingAttendance();
  const { data: coaches = [] } = useCoaches();
  const { data: pendingBadges = [] } = usePlayerBadges(true);
  const { data: programs = [] } = usePrograms();

  const stats = useQuery({
    queryKey: ['admin-stats', profile?.academy_id],
    enabled: !!profile,
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
      const [players, reports, payments, packages, sessionsWeek, reportsWeek, matchFees, groundFees] =
        await Promise.all([
          supabase.from('players').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
          supabase.from('payments').select('amount, status'),
          supabase.from('packages').select('sessions_remaining'),
          supabase
            .from('attendance_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'confirmed')
            .gte('session_date', weekAgo),
          supabase.from('reports').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
          supabase.from('match_fees').select('fee, state'),
          supabase.from('ground_fees').select('amount, status'),
        ]);

      const pay = (payments.data ?? []) as { amount: number; status: string }[];
      const collected = pay.filter((r) => r.status === 'confirmed').reduce((s, r) => s + Number(r.amount), 0);
      const outstanding = pay.filter((r) => r.status !== 'confirmed').reduce((s, r) => s + Number(r.amount), 0);
      const pendingPayments = pay.filter((r) => r.status !== 'confirmed').length;

      const pkg = (packages.data ?? []) as { sessions_remaining: number | null }[];
      const activePackages = pkg.filter((p) => p.sessions_remaining == null || p.sessions_remaining > 0).length;
      const renewals = pkg.filter((p) => p.sessions_remaining != null && p.sessions_remaining <= 2 && p.sessions_remaining >= 0).length;

      const mf = (matchFees.data ?? []) as { fee: number; state: string }[];
      const matchCollected = mf.filter((f) => f.state === 'confirmed').reduce((s, f) => s + Number(f.fee), 0);
      const matchPending = mf.filter((f) => f.state !== 'confirmed').reduce((s, f) => s + Number(f.fee), 0);
      const gf = (groundFees.data ?? []) as { amount: number; status: string }[];
      const groundCost = gf.reduce((s, f) => s + Number(f.amount), 0);

      return {
        players: players.count ?? 0,
        reports: reports.count ?? 0,
        collected,
        outstanding,
        pendingPayments,
        activePackages,
        renewals,
        sessionsWeek: sessionsWeek.count ?? 0,
        reportsWeek: reportsWeek.count ?? 0,
        matchCollected,
        matchPending,
        groundCost,
        matchProfit: matchCollected - groundCost,
      };
    },
  });

  const s = stats.data;
  const activeCoaches = coaches.filter((c) => c.status === 'active').length;

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Admin" title={profile ? `Welcome back, ${firstName(profile.full_name)}` : 'Dashboard'} />

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active Players" value={s?.players ?? '—'} />
        <StatCard label="Active Packages" value={s?.activePackages ?? '—'} />
        <StatCard label="Reports Sent" value={s?.reports ?? '—'} />
        <StatCard
          label="Pending Payments"
          value={s?.pendingPayments ?? '—'}
          tone={(s?.pendingPayments ?? 0) > 0 ? 'amber' : undefined}
        />
      </div>

      <InfoCallout>Sessions still count for every player — even with payment pending.</InfoCallout>

      {/* Financial overview */}
      <div className="rounded-card bg-gradient-to-br from-brand-deep to-ink p-5 text-paper shadow-card-lg">
        <div className="eyebrow text-gold">Financial Overview</div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <div className="font-display text-3xl leading-none text-success">{s ? aed(s.collected) : '—'}</div>
            <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/50">Collected</div>
          </div>
          <div>
            <div className="font-display text-3xl leading-none text-amber">{s ? aed(s.outstanding) : '—'}</div>
            <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/50">Outstanding</div>
          </div>
          <div>
            <div className="font-display text-3xl leading-none">{s ? aed(s.collected - s.outstanding) : '—'}</div>
            <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/50">Net</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-paper/80">
          <div>
            <div className="font-display text-xl leading-none">{s ? aed(s.matchCollected) : '—'}</div>
            <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/40">Match fees in</div>
          </div>
          <div>
            <div className="font-display text-xl leading-none">{s ? aed(s.groundCost) : '—'}</div>
            <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/40">Ground cost</div>
          </div>
          <div>
            <div className="font-display text-xl leading-none text-gold">{s ? aed(s.matchProfit) : '—'}</div>
            <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/40">Match profit</div>
          </div>
        </div>
      </div>

      {/* Needs attention */}
      <div>
        <div className="eyebrow mb-2 text-ink/40">Needs attention</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ActionCard
            to="/admin/attendance"
            icon="check"
            label="Attendance to confirm"
            count={pending.length}
            tone={pending.length ? 'amber' : 'green'}
          />
          <ActionCard
            to="/admin/payments"
            icon="card"
            label="Renewals due"
            count={s?.renewals ?? 0}
            tone={(s?.renewals ?? 0) > 0 ? 'amber' : 'green'}
          />
          <ActionCard
            to="/admin/badges"
            icon="badge"
            label="Badge approvals"
            count={pendingBadges.length}
            tone={pendingBadges.length ? 'amber' : 'green'}
          />
        </div>
      </div>

      {/* This week */}
      <Card>
        <div className="eyebrow text-ink/40">Last 7 days</div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <div className="font-display text-2xl leading-none">{s?.sessionsWeek ?? '—'}</div>
            <div className="mt-1 text-[11px] text-ink/45">Sessions run</div>
          </div>
          <div>
            <div className="font-display text-2xl leading-none">{s?.reportsWeek ?? '—'}</div>
            <div className="mt-1 text-[11px] text-ink/45">Reports written</div>
          </div>
          <div>
            <div className="font-display text-2xl leading-none">{aed(s?.matchPending ?? 0)}</div>
            <div className="mt-1 text-[11px] text-ink/45">Match fees pending</div>
          </div>
        </div>
      </Card>

      {/* Programs overview */}
      {programs.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow text-ink/40">Programs</span>
            <Link to="/admin/programs" className="text-[12px] font-semibold text-brand-red">Manage</Link>
          </div>
          <div className="divide-y divide-hairline">
            {programs.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-[13px]">
                <span className="flex items-center gap-2 font-medium">
                  <span>{p.emoji}</span>
                  {p.name}
                </span>
                <Chip tone="neutral">{p.enrolled} enrolled</Chip>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Coach activity */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <span className="eyebrow text-ink/40">Coach Activity</span>
          <Chip tone="green">{activeCoaches} active</Chip>
        </div>
        <div className="divide-y divide-hairline">
          {coaches.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2.5">
              <span className="text-[14px] font-medium">{c.full_name}</span>
              <Chip tone={c.status === 'active' ? 'green' : 'neutral'}>{c.status}</Chip>
            </div>
          ))}
          {!coaches.length && <div className="py-2 text-[13px] text-ink/45">No coaches yet.</div>}
        </div>
      </Card>
    </div>
  );
}

function ActionCard({
  to,
  icon,
  label,
  count,
  tone,
}: {
  to: string;
  icon: string;
  label: string;
  count: number;
  tone: 'amber' | 'green';
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-card border border-cardborder bg-white p-4 transition hover:border-gold"
    >
      <div className="flex items-center gap-3">
        <span
          className={
            'flex h-10 w-10 items-center justify-center rounded-pill ' +
            (tone === 'amber' ? 'bg-chip-amber text-amber-text' : 'bg-chip-green text-success')
          }
        >
          <Icon name={icon} size={18} stroke="currentColor" />
        </span>
        <div>
          <div className="font-display text-2xl leading-none">{count}</div>
          <div className="text-[11px] text-ink/45">{label}</div>
        </div>
      </div>
      <Icon name="chevronRight" size={16} stroke="#9A938A" />
    </Link>
  );
}
