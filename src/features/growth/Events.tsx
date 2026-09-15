import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEvents } from '@/lib/marketingQueries';
import { EVENT_TYPES, eventMetrics, eventTypeLabel } from '@/lib/marketing';
import { useToast } from '@/lib/toast';
import { aed, clsx } from '@/lib/utils';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import type { AcademyEvent, EventType } from '@/lib/types';

const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';
const money = (n: number | null) => (n == null ? '—' : aed(Math.round(n)));

// Events — camps, open days, school activations and more, each with its budget
// and the leads / trials / enrolments / revenue it produced, so cost-per-lead,
// cost-per-enrolment and ROI are visible per event.
export default function Events() {
  const [editing, setEditing] = useState<AcademyEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: events = [] } = useEvents();

  const spend = events.reduce((n, e) => n + Number(e.budget || 0), 0);
  const revenue = events.reduce((n, e) => n + Number(e.revenue || 0), 0);
  const enrol = events.reduce((n, e) => n + e.enrolments, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Growth" title="Events" />
        <Button size="sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> Add Event</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Total budget" value={aed(spend)} />
        <Tile label="Enrolments" value={enrol} />
        <Tile label="Revenue" value={aed(revenue)} tone={revenue >= spend ? 'green' : undefined} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {events.map((e) => {
          const m = eventMetrics(e);
          return (
            <Card key={e.id} className="cursor-pointer space-y-2" onClick={() => setEditing(e)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold">{e.name}</div>
                  <div className="text-[12px] text-ink/45">{eventTypeLabel(e.type)}{e.event_date ? ` · ${e.event_date}` : ''}</div>
                </div>
                {m.roi != null && (
                  <Chip tone={m.roi >= 0 ? 'green' : 'red'}>ROI {Math.round(m.roi)}%</Chip>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Mini label="Attend" value={e.attendance} />
                <Mini label="Leads" value={e.leads} />
                <Mini label="Trials" value={e.trials} />
                <Mini label="Enrol" value={e.enrolments} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink/50">
                <span>Budget {aed(Number(e.budget))}</span>
                <span>Cost/lead {money(m.costPerLead)}</span>
                <span>Cost/enrol {money(m.costPerEnrolment)}</span>
              </div>
            </Card>
          );
        })}
        {!events.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">No events yet.</div>
        )}
      </div>

      <EventModal open={creating} event={null} onClose={() => setCreating(false)} />
      <EventModal open={!!editing} event={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EventModal({ open, event, onClose }: { open: boolean; event: AcademyEvent | null; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(() => seed(event));
  const [seededId, setSeededId] = useState<string | null>(event?.id ?? null);
  if (open && (event?.id ?? null) !== seededId) { setSeededId(event?.id ?? null); setF(seed(event)); }
  const set = (k: keyof ReturnType<typeof seed>, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      if (!f.name.trim()) throw new Error('Event name is required');
      const payload = {
        academy_id: profile.academy_id, name: f.name.trim(), type: f.type as EventType,
        event_date: f.event_date || null, budget: Number(f.budget || 0),
        registrations: Number(f.registrations || 0), attendance: Number(f.attendance || 0),
        leads: Number(f.leads || 0), trials: Number(f.trials || 0),
        enrolments: Number(f.enrolments || 0), revenue: Number(f.revenue || 0), notes: f.notes || null,
      };
      if (event) {
        const { error } = await supabase.from('events').update(payload).eq('id', event.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('events').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.show(event ? 'Event updated' : 'Event added'); qc.invalidateQueries({ queryKey: ['events'] }); onClose(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Modal open={open} onClose={onClose} title={event ? event.name : 'Add Event'}>
      <div className="space-y-3">
        <Field label="Event name"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={f.type} onChange={(e) => set('type', e.target.value)} className={inputCls}>
              {EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Date"><input type="date" value={f.event_date} onChange={(e) => set('event_date', e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Budget (AED)"><input type="number" value={f.budget} onChange={(e) => set('budget', e.target.value)} className={inputCls} /></Field>
        <div className="rounded-card border border-cardborder bg-white p-3">
          <div className="eyebrow mb-2 text-ink/40">Outcomes</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Registrations"><input type="number" value={f.registrations} onChange={(e) => set('registrations', e.target.value)} className={inputCls} /></Field>
            <Field label="Attendance"><input type="number" value={f.attendance} onChange={(e) => set('attendance', e.target.value)} className={inputCls} /></Field>
            <Field label="Leads"><input type="number" value={f.leads} onChange={(e) => set('leads', e.target.value)} className={inputCls} /></Field>
            <Field label="Trials"><input type="number" value={f.trials} onChange={(e) => set('trials', e.target.value)} className={inputCls} /></Field>
            <Field label="Enrolments"><input type="number" value={f.enrolments} onChange={(e) => set('enrolments', e.target.value)} className={inputCls} /></Field>
            <Field label="Revenue (AED)"><input type="number" value={f.revenue} onChange={(e) => set('revenue', e.target.value)} className={inputCls} /></Field>
          </div>
        </div>
        <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : event ? 'Save Changes' : 'Add Event'}
        </Button>
      </div>
    </Modal>
  );
}

function seed(e: AcademyEvent | null) {
  return {
    name: e?.name ?? '', type: (e?.type ?? 'open_day') as string, event_date: e?.event_date ?? '',
    budget: String(e?.budget ?? 0), registrations: String(e?.registrations ?? 0),
    attendance: String(e?.attendance ?? 0), leads: String(e?.leads ?? 0),
    trials: String(e?.trials ?? 0), enrolments: String(e?.enrolments ?? 0),
    revenue: String(e?.revenue ?? 0), notes: e?.notes ?? '',
  };
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: 'green' }) {
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-3xl leading-none', tone === 'green' && 'text-success')}>{value}</div>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-chip bg-hairline py-1.5">
      <div className="font-display text-lg leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-eyebrow text-ink/40">{label}</div>
    </div>
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
