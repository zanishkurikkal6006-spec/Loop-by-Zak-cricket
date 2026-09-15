import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRevenueIntel } from '@/lib/opsQueries';
import { aed, clsx } from '@/lib/utils';
import { Card, ScreenTitle } from '@/components/ui';

const BAR = '#9C1116';
const GOLD = '#C9A84C';

// Revenue Intelligence — read-only view of the money, computed live from the
// payment ledger, match fees and ground fees: what's coming in, what's
// outstanding, where it comes from, and how old the unpaid balances are.
export default function RevenueIntelligence() {
  const { data: r } = useRevenueIntel();

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Commercial" title="Revenue Intelligence" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Today" value={aed(r?.today ?? 0)} />
        <Tile label="This week" value={aed(r?.week ?? 0)} />
        <Tile label="This month" value={aed(r?.month ?? 0)} tone="green" />
        <Tile label="All-time" value={aed(r?.total ?? 0)} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Outstanding" value={aed(r?.outstanding ?? 0)} tone={r?.outstanding ? 'red' : undefined} />
        <Tile label="Collection rate" value={`${r?.collectionPct ?? 0}%`} tone={(r?.collectionPct ?? 100) < 80 ? 'amber' : 'green'} />
        <Tile label="Revenue / player" value={aed(r?.arpu ?? 0)} />
        <Tile label="Match + ground" value={aed((r?.matchRevenue ?? 0) + (r?.groundRevenue ?? 0))} />
      </div>

      {r && <ChartCard title="Revenue by category" data={r.byCategory} color={BAR} money />}
      {r && r.byCentre.length > 0 && <ChartCard title="Revenue by centre" data={r.byCentre} color={GOLD} money />}
      {r && r.bySource.length > 0 && <ChartCard title="Revenue by acquisition source" data={r.bySource} color={BAR} money />}
      {r && <ChartCard title="Outstanding by age" data={r.ageing} color={GOLD} money />}

      <p className="px-1 text-[12px] text-ink/40">
        Forecasting and revenue-by-program arrive with the AI analysts (Phases 5–6), which read
        these same figures through a deterministic analytics layer.
      </p>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' | 'amber' }) {
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-2xl leading-none',
        tone === 'green' && 'text-success', tone === 'red' && 'text-danger', tone === 'amber' && 'text-amber-text')}>
        {value}
      </div>
    </Card>
  );
}

function ChartCard({ title, data, color, money }: { title: string; data: { name: string; value: number }[]; color: string; money?: boolean }) {
  if (!data.length) return null;
  const height = Math.max(130, data.length * 40);
  return (
    <Card>
      <div className="eyebrow mb-3 text-ink/40">{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 60, top: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#6B6660' }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: '#F3EEE8' }}
            contentStyle={{ borderRadius: 10, border: '1px solid #ECE7E1', fontSize: 12 }}
            formatter={(v: number) => (money ? aed(v) : v)}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18} label={{ position: 'right', fontSize: 11, fill: '#6B6660', formatter: (v: number) => (money ? aed(v) : v) }}>
            {data.map((_, i) => <Cell key={i} fill={color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
