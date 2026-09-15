import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayers } from '@/lib/queries';
import { useChurn } from '@/lib/experienceQueries';
import { CHURN_REASONS, churnReasonLabel, markPlayerExited } from '@/lib/experience';
import { sourceLabel } from '@/lib/crm';
import { useToast } from '@/lib/toast';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { clsx } from '@/lib/utils';
import type { ChurnReason, LeadSource } from '@/lib/types';

const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';
const BAR = '#14387F';
const GOLD = '#FFC72C';

// Churn Management — every exit has a reason, and the reasons are analysed by
// cause, acquisition source and month so patterns surface. Marking a player
// exited stamps them inactive and captures the reason for cohort analysis.
export default function Churn() {
  const [logging, setLogging] = useState(false);
  const { data: churn = [] } = useChurn();
  const { data: active = [] } = usePlayers();

  const thisMonth = new Date().toISOString().slice(0, 7);
  const exitsThisMonth = churn.filter((c) => (c.exit_date ?? '').startsWith(thisMonth)).length;
  const denom = active.length + exitsThisMonth;
  const churnRate = denom ? Math.round((exitsThisMonth / denom) * 100) : 0;

  const byReason = useMemo(() => aggregate(churn.map((c) => churnReasonLabel(c.reason))), [churn]);
  const bySource = useMemo(
    () => aggregate(churn.map((c) => (c.lead_source ? sourceLabel(c.lead_source as LeadSource) : 'Unknown'))),
    [churn],
  );
  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of churn) {
      const m = (c.exit_date ?? '').slice(0, 7);
      if (m) map.set(m, (map.get(m) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name: name.slice(5), value }));
  }, [churn]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Experience" title="Churn" />
        <Button size="sm" onClick={() => setLogging(true)}><Icon name="plus" size={14} /> Log Exit</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Active players" value={active.length} />
        <Tile label="Exits this month" value={exitsThisMonth} tone={exitsThisMonth ? 'amber' : undefined} />
        <Tile label="Monthly churn" value={`${churnRate}%`} tone={churnRate > 5 ? 'red' : undefined} />
      </div>

      {!churn.length ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon name="chart" size={24} stroke="#C4BDB2" />
          <p className="text-[13px] text-ink/45">No exits recorded yet. Log one to start building churn analysis.</p>
        </Card>
      ) : (
        <>
          <ChartCard title="By reason" data={byReason} color={BAR} />
          <ChartCard title="By acquisition source" data={bySource} color={GOLD} />
          {byMonth.length > 1 && <ChartCard title="By month" data={byMonth} color={BAR} />}

          <Card>
            <div className="eyebrow mb-2 text-ink/40">Recent exits</div>
            <div className="space-y-2">
              {churn.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-center justify-between border-b border-hairline pb-2 last:border-0">
                  <div>
                    <div className="text-[13.5px] font-semibold">{c.player?.full_name ?? 'Player'}</div>
                    <div className="text-[11px] text-ink/45">{c.exit_date}{c.reason_detail ? ` · ${c.reason_detail}` : ''}</div>
                  </div>
                  <Chip tone="neutral">{churnReasonLabel(c.reason)}</Chip>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <LogExitModal open={logging} onClose={() => setLogging(false)} />
    </div>
  );
}

function aggregate(labels: string[]): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const l of labels) map.set(l, (map.get(l) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: 'amber' | 'red' }) {
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-3xl leading-none', tone === 'amber' && 'text-amber-text', tone === 'red' && 'text-danger')}>
        {value}
      </div>
    </Card>
  );
}

function ChartCard({ title, data, color }: { title: string; data: { name: string; value: number }[]; color: string }) {
  const height = Math.max(140, data.length * 34);
  return (
    <Card>
      <div className="eyebrow mb-3 text-ink/40">{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#6B6660' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#F3EEE8' }} contentStyle={{ borderRadius: 10, border: '1px solid #ECE7E1', fontSize: 12 }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
            {data.map((_, i) => <Cell key={i} fill={color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function LogExitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: players = [] } = usePlayers();
  const [playerId, setPlayerId] = useState('');
  const [reason, setReason] = useState<ChurnReason>('other');
  const [detail, setDetail] = useState('');

  const log = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      const player = players.find((p) => p.id === playerId);
      if (!player) throw new Error('Select a player');
      await markPlayerExited({
        academyId: profile.academy_id,
        player: { id: player.id, lead_source: player.lead_source, joined_at: player.joined_at },
        reason, detail: detail || undefined, recordedBy: profile.id,
      });
    },
    onSuccess: () => {
      toast.show('Exit recorded');
      qc.invalidateQueries({ queryKey: ['churn'] });
      qc.invalidateQueries({ queryKey: ['players'] });
      qc.invalidateQueries({ queryKey: ['retention'] });
      qc.invalidateQueries({ queryKey: ['command-metrics'] });
      onClose(); setPlayerId(''); setReason('other'); setDetail('');
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not record'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Log Player Exit">
      <div className="space-y-3">
        <p className="text-[12px] text-ink/50">Records the reason and marks the player inactive. Every exit needs a reason so churn patterns become visible.</p>
        <Field label="Player">
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
        <Field label="Reason">
          <select value={reason} onChange={(e) => setReason(e.target.value as ChurnReason)} className={inputCls}>
            {CHURN_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Detail (optional)"><textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} className={clsx(inputCls, 'h-auto rounded-card py-2')} /></Field>
        <Button className="w-full" disabled={log.isPending} onClick={() => log.mutate()}>
          {log.isPending ? 'Recording…' : 'Record Exit'}
        </Button>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">{label}</span>
      {children}
    </label>
  );
}
