import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCapacity, type CapacityBand, type CapacityRow } from '@/lib/opsQueries';
import { useToast } from '@/lib/toast';
import { clsx } from '@/lib/utils';
import { Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';

const BAND: Record<CapacityBand, { label: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'neutral'; bar: string }> = {
  under:    { label: 'Underutilized',      tone: 'blue',    bar: 'bg-info' },
  healthy:  { label: 'Healthy',            tone: 'green',   bar: 'bg-success' },
  warning:  { label: 'Expansion warning',  tone: 'amber',   bar: 'bg-amber-text' },
  critical: { label: 'Critical — full',    tone: 'red',     bar: 'bg-danger' },
  unset:    { label: 'Set capacity',       tone: 'neutral', bar: 'bg-hairline' },
};

// Capacity Intelligence — every batch's registered players against its safe
// capacity, banded so full and empty slots read at a glance. Alerts surface
// where to place new trials and where expansion is needed.
export default function Capacity() {
  const { data: rows = [] } = useCapacity();

  const counts = useMemo(() => {
    const c = { under: 0, healthy: 0, warning: 0, critical: 0, unset: 0 };
    for (const r of rows) c[r.band] += 1;
    return c;
  }, [rows]);

  const critical = rows.filter((r) => r.band === 'critical' || r.band === 'warning');
  const under = rows.filter((r) => r.band === 'under');

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Academy" title="Capacity" />

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Near / at capacity" value={counts.critical + counts.warning} tone="red" />
        <Tile label="Healthy" value={counts.healthy} tone="green" />
        <Tile label="Underutilized" value={counts.under} tone="blue" />
      </div>

      {critical.length > 0 && (
        <Card className="border-danger/40">
          <div className="eyebrow mb-2 text-danger">Expansion signals — add a batch or coach</div>
          <div className="space-y-1.5">
            {critical.map((r) => (
              <div key={r.batchId} className="flex items-center justify-between text-[13px]">
                <span className="font-medium">{r.name} <span className="text-ink/45">· {r.centre}</span></span>
                <Chip tone={BAND[r.band].tone}>{r.utilization}%</Chip>
              </div>
            ))}
          </div>
        </Card>
      )}

      {under.length > 0 && (
        <Card className="border-info/30">
          <div className="eyebrow mb-2 text-info">Place new trials here — spare capacity</div>
          <div className="space-y-1.5">
            {under.map((r) => (
              <div key={r.batchId} className="flex items-center justify-between text-[13px]">
                <span className="font-medium">{r.name} <span className="text-ink/45">· {r.centre} · {r.time}</span></span>
                <span className="text-ink/55">{r.registered}/{r.capacity}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-2.5">
        {rows.map((r) => <CapacityCard key={r.batchId} row={r} />)}
        {!rows.length && (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="gauge" size={24} stroke="#C4BDB2" />
            <p className="text-[13px] text-ink/45">No batches yet. Add batches and set a safe capacity to see utilization.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function CapacityCard({ row }: { row: CapacityRow }) {
  const toast = useToast();
  const qc = useQueryClient();
  const band = BAND[row.band];

  const setCap = useMutation({
    mutationFn: async (value: number) => {
      const { error } = await supabase.from('batches').update({ capacity: value || null }).eq('id', row.batchId);
      if (error) throw error;
    },
    onSuccess: () => { toast.show('Capacity updated'); qc.invalidateQueries({ queryKey: ['capacity'] }); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold">{row.name}</div>
          <div className="text-[12px] text-ink/45">{row.centre}{row.time !== '—' ? ` · ${row.time}` : ''}</div>
        </div>
        <Chip tone={band.tone}>{band.label}</Chip>
      </div>

      {row.capacity ? (
        <>
          <div className="h-2 w-full overflow-hidden rounded-pill bg-hairline">
            <div className={clsx('h-full rounded-pill', band.bar)} style={{ width: `${Math.min(100, row.utilization ?? 0)}%` }} />
          </div>
          <div className="flex items-center justify-between text-[12px] text-ink/55">
            <span>{row.registered} / {row.capacity} registered · {row.utilization}%</span>
            <CapInput value={row.capacity} onSave={(v) => setCap.mutate(v)} />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between text-[12px] text-ink/55">
          <span>{row.registered} registered · no safe capacity set</span>
          <CapInput value={0} onSave={(v) => setCap.mutate(v)} />
        </div>
      )}
    </Card>
  );
}

function CapInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] text-ink/40">Capacity</span>
      <input
        type="number"
        defaultValue={value || ''}
        onBlur={(e) => { const v = Number(e.target.value); if (v !== value) onSave(v); }}
        className="h-8 w-16 rounded-pill border border-cardborder bg-white px-2 text-center text-[13px] outline-none focus:border-gold"
      />
    </label>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: 'red' | 'green' | 'blue' }) {
  const color = tone === 'red' ? 'text-danger' : tone === 'green' ? 'text-success' : 'text-info';
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-3xl leading-none', color)}>{value}</div>
    </Card>
  );
}
