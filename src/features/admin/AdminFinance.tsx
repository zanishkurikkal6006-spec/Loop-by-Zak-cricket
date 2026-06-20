import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenTitle, Card, StatCard, Button, Chip } from '@/components/ui';
import { aed, clsx } from '@/lib/utils';
import { exportToExcel } from '@/lib/excel';
import MonthEndReport from './MonthEndReport';
import type { Payment, PaymentState } from '@/lib/types';

type FinanceTab = 'overview' | 'month-end' | 'by-center';

// Finance — Overview with filter bar + Excel export and a monthly revenue chart
// (packages green + match fees gold), mirroring the design. Admin-only (RLS also
// denies finance tables to coach / head-coach roles).

type StatusFilter = 'all' | PaymentState;

export default function AdminFinance() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<FinanceTab>('overview');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['finance-payments', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      const d = p.paid_at ?? p.created_at.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [payments, status, from, to]);

  const totals = useMemo(() => {
    const collected = filtered.filter((p) => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = filtered.filter((p) => p.status !== 'confirmed').reduce((s, p) => s + Number(p.amount), 0);
    const cash = filtered.filter((p) => p.mode === 'cash' && p.status === 'confirmed').reduce((s, p) => s + Number(p.amount), 0);
    const bank = filtered.filter((p) => p.mode === 'bank' && p.status === 'confirmed').reduce((s, p) => s + Number(p.amount), 0);
    return { collected, outstanding, cash, bank };
  }, [filtered]);

  // Monthly revenue split: packages (green) vs match fees (gold).
  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; packages: number; matchFees: number }>();
    for (const p of filtered) {
      if (p.status !== 'confirmed') continue;
      const month = (p.paid_at ?? p.created_at).slice(0, 7);
      const row = map.get(month) ?? { month, packages: 0, matchFees: 0 };
      if (p.category === 'match_fee') row.matchFees += Number(p.amount);
      else row.packages += Number(p.amount);
      map.set(month, row);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const { data: centers = [] } = useQuery({
    queryKey: ['centers', profile?.academy_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase.from('training_centers').select('id, name');
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // Collected revenue grouped by training center.
  const byCenter = useMemo(() => {
    const name = new Map(centers.map((c) => [c.id, c.name]));
    const map = new Map<string, number>();
    for (const p of filtered) {
      if (p.status !== 'confirmed') continue;
      const label = p.center_id ? (name.get(p.center_id) ?? 'Unknown') : 'Unassigned';
      map.set(label, (map.get(label) ?? 0) + Number(p.amount));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered, centers]);

  function handleExport() {
    exportToExcel(
      filtered.map((p) => ({
        Date: p.paid_at ?? p.created_at.slice(0, 10),
        Category: p.category,
        Amount: Number(p.amount),
        Mode: p.mode,
        Status: p.status,
      })),
      'loop-finance',
      'Finance',
    );
  }

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Admin" title="Finance" />

      <div className="flex gap-2">
        {(['overview', 'month-end', 'by-center'] as FinanceTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'rounded-chip px-3 py-1.5 text-[12px] font-semibold capitalize transition',
              tab === t ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
            )}
          >
            {t === 'by-center' ? 'By Center' : t === 'month-end' ? 'Month-End' : 'Overview'}
          </button>
        ))}
      </div>

      {tab === 'month-end' && <MonthEndReport />}

      {tab === 'by-center' && (
        <Card className="divide-y divide-hairline p-0">
          {byCenter.map(([center, amount]) => (
            <div key={center} className="flex items-center justify-between px-4 py-3 text-[14px]">
              <span className="font-medium">{center}</span>
              <span className="font-display text-xl text-success">{aed(amount)}</span>
            </div>
          ))}
          {!byCenter.length && (
            <div className="px-4 py-6 text-center text-[13px] text-ink/45">No confirmed revenue yet.</div>
          )}
        </Card>
      )}

      {tab === 'overview' && (
      <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Collected" value={aed(totals.collected)} tone="green" />
        <StatCard label="Outstanding" value={aed(totals.outstanding)} tone={totals.outstanding > 0 ? 'amber' : undefined} />
        <StatCard label="Cash" value={aed(totals.cash)} />
        <StatCard label="Bank" value={aed(totals.bank)} />
      </div>

      {/* Filter bar */}
      <Card className="flex flex-wrap items-end gap-3">
        <label className="text-[12px]">
          <div className="mb-1 text-ink/45">From</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-chip border border-cardborder bg-white px-3 py-2" />
        </label>
        <label className="text-[12px]">
          <div className="mb-1 text-ink/45">To</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-chip border border-cardborder bg-white px-3 py-2" />
        </label>
        <div className="flex gap-1.5">
          {(['all', 'confirmed', 'pending', 'awaiting'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={clsx(
                'rounded-chip px-3 py-2 text-[11px] font-semibold capitalize transition',
                status === s ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Button variant="gold" size="sm" className="ml-auto" onClick={handleExport}>
          ⬇ Export to Excel
        </Button>
      </Card>

      {/* Monthly revenue */}
      <Card>
        <div className="eyebrow text-ink/40">Monthly Revenue</div>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1ECE6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => aed(v)} />
              <Bar dataKey="packages" stackId="a" fill="#1F8A4C" name="Packages" radius={[0, 0, 0, 0]} />
              <Bar dataKey="matchFees" stackId="a" fill="#C9A84C" name="Match fees" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Breakdown table */}
      <Card className="p-0">
        <div className="border-b border-hairline px-4 py-3 text-[12px] font-semibold uppercase tracking-eyebrow text-ink/40">
          Breakdown ({filtered.length})
        </div>
        <div className="divide-y divide-hairline">
          {isLoading && <div className="px-4 py-4 text-[13px] text-ink/45">Loading…</div>}
          {filtered.slice(0, 60).map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
              <span className="text-ink/55">{p.paid_at ?? p.created_at.slice(0, 10)}</span>
              <span className="flex-1 px-3 capitalize">{p.category.replace('_', ' ')}</span>
              <Chip tone={p.status === 'confirmed' ? 'green' : p.status === 'pending' ? 'amber' : 'neutral'}>
                {p.status}
              </Chip>
              <span className="ml-3 w-20 text-right font-semibold">{aed(Number(p.amount))}</span>
            </div>
          ))}
          {!isLoading && !filtered.length && (
            <div className="px-4 py-6 text-center text-[13px] text-ink/45">No payments match these filters.</div>
          )}
        </div>
      </Card>
      </>
      )}
    </div>
  );
}
