import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVenues } from '@/lib/opsQueries';
import { useToast } from '@/lib/toast';
import { aed, clsx } from '@/lib/utils';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import type { TrainingCenter, Venue } from '@/lib/types';

const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

// Venue Intelligence — the economics of each venue: rental against the players
// and revenue it carries, so cost-per-hour, revenue-per-hour and margin are
// visible and contract renewals never surprise anyone.
export default function Venues() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const { data } = useVenues();
  const venues = data?.venues ?? [];
  const econ = data?.econ ?? {};
  const centers = data?.centers ?? [];
  const centerName = new Map(centers.map((c) => [c.id, c.name]));

  const totalRent = venues.reduce((n, v) => n + Number(v.rental_cost || 0), 0);
  const totalRev = venues.reduce((n, v) => n + (v.center_id ? econ[v.center_id]?.monthRevenue ?? 0 : 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Academy" title="Venues" />
        <Button size="sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> Add Venue</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Monthly rental" value={aed(totalRent)} />
        <Tile label="Monthly revenue" value={aed(totalRev)} />
        <Tile label="Net" value={aed(totalRev - totalRent)} tone={totalRev - totalRent >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {venues.map((v) => {
          const e = v.center_id ? econ[v.center_id] : undefined;
          const revenue = e?.monthRevenue ?? 0;
          const players = e?.players ?? 0;
          const revPerHour = v.available_hours > 0 ? revenue / v.available_hours : null;
          const net = revenue - Number(v.rental_cost || 0);
          const renewingSoon = v.contract_end && new Date(v.contract_end).getTime() - Date.now() < 60 * 86400_000;
          return (
            <Card key={v.id} className="cursor-pointer space-y-2" onClick={() => setEditing(v)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold">{v.name}</div>
                  <div className="text-[12px] text-ink/45">{v.center_id ? centerName.get(v.center_id) ?? 'Centre' : 'No centre linked'}</div>
                </div>
                <Chip tone={net >= 0 ? 'green' : 'red'}>{net >= 0 ? 'Profitable' : 'Loss'}</Chip>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-ink/55">
                <span>Rental {aed(Number(v.rental_cost))}/mo</span>
                <span>Revenue {aed(revenue)}/mo</span>
                <span>{players} players</span>
                <span>{v.available_hours} hrs/mo</span>
                {revPerHour != null && <span>Rev/hour {aed(Math.round(revPerHour))}</span>}
                <span className={clsx(net >= 0 ? 'text-success' : 'text-danger', 'font-semibold')}>Net {aed(net)}</span>
              </div>
              {renewingSoon && (
                <div className="flex items-center gap-1.5 text-[12px] text-amber-text">
                  <Icon name="alert" size={12} stroke="currentColor" /> Contract ends {v.contract_end}
                </div>
              )}
            </Card>
          );
        })}
        {!venues.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">No venues yet.</div>
        )}
      </div>

      <VenueModal open={creating} venue={null} centers={centers} onClose={() => setCreating(false)} />
      <VenueModal open={!!editing} venue={editing} centers={centers} onClose={() => setEditing(null)} />
    </div>
  );
}

function VenueModal({ open, venue, centers, onClose }: { open: boolean; venue: Venue | null; centers: TrainingCenter[]; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(() => seed(venue));
  const [seededId, setSeededId] = useState<string | null>(venue?.id ?? null);
  if (open && (venue?.id ?? null) !== seededId) { setSeededId(venue?.id ?? null); setF(seed(venue)); }
  const set = (k: keyof ReturnType<typeof seed>, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      if (!f.name.trim()) throw new Error('Venue name is required');
      const payload = {
        academy_id: profile.academy_id, name: f.name.trim(), center_id: f.center_id || null,
        rental_cost: Number(f.rental_cost || 0), available_hours: Number(f.available_hours || 0),
        contract_start: f.contract_start || null, contract_end: f.contract_end || null, notes: f.notes || null,
      };
      if (venue) {
        const { error } = await supabase.from('venues').update(payload).eq('id', venue.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('venues').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.show(venue ? 'Venue updated' : 'Venue added'); qc.invalidateQueries({ queryKey: ['venues'] }); onClose(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Modal open={open} onClose={onClose} title={venue ? venue.name : 'Add Venue'}>
      <div className="space-y-3">
        <Field label="Venue name"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
        <Field label="Linked centre">
          <select value={f.center_id} onChange={(e) => set('center_id', e.target.value)} className={inputCls}>
            <option value="">—</option>
            {centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rental / month (AED)"><input type="number" value={f.rental_cost} onChange={(e) => set('rental_cost', e.target.value)} className={inputCls} /></Field>
          <Field label="Available hours / mo"><input type="number" value={f.available_hours} onChange={(e) => set('available_hours', e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contract start"><input type="date" value={f.contract_start} onChange={(e) => set('contract_start', e.target.value)} className={inputCls} /></Field>
          <Field label="Contract end"><input type="date" value={f.contract_end} onChange={(e) => set('contract_end', e.target.value)} className={inputCls} /></Field>
        </div>
        <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : venue ? 'Save Changes' : 'Add Venue'}
        </Button>
      </div>
    </Modal>
  );
}

function seed(v: Venue | null) {
  return {
    name: v?.name ?? '', center_id: v?.center_id ?? '',
    rental_cost: String(v?.rental_cost ?? 0), available_hours: String(v?.available_hours ?? 0),
    contract_start: v?.contract_start ?? '', contract_end: v?.contract_end ?? '', notes: v?.notes ?? '',
  };
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-2xl leading-none', tone === 'green' && 'text-success', tone === 'red' && 'text-danger')}>{value}</div>
    </Card>
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
