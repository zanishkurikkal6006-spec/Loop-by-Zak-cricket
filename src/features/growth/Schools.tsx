import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSchools, useSchoolActivities } from '@/lib/marketingQueries';
import { SCHOOL_STAGES, schoolMetrics, schoolStageLabel, schoolStageTone } from '@/lib/marketing';
import { useToast } from '@/lib/toast';
import { aed, clsx } from '@/lib/utils';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import type { School, SchoolStage } from '@/lib/types';

const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';
const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n)}%`);

// School CRM — the partnership pipeline. Move a school from target to active
// partner, log every touch, and track the students / leads / trials /
// enrolments / revenue it produces so partnership value is visible.
export default function Schools() {
  const [stage, setStage] = useState<SchoolStage | 'all'>('all');
  const [editing, setEditing] = useState<School | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: schools = [] } = useSchools();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of schools) c[s.stage] = (c[s.stage] ?? 0) + 1;
    return c;
  }, [schools]);

  const active = schools.filter((s) => s.stage === 'active_partner');
  const totalEnrol = schools.reduce((n, s) => n + s.enrolments, 0);
  const totalRev = schools.reduce((n, s) => n + Number(s.revenue || 0), 0);

  const shown = stage === 'all' ? schools : schools.filter((s) => s.stage === stage);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Growth" title="Schools" />
        <Button size="sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> Add School</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Active partners" value={active.length} tone="green" />
        <Tile label="Enrolments" value={totalEnrol} />
        <Tile label="Revenue" value={aed(totalRev)} />
      </div>

      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        <StageChip active={stage === 'all'} onClick={() => setStage('all')}>All · {schools.length}</StageChip>
        {SCHOOL_STAGES.map((s) => (
          <StageChip key={s.key} active={stage === s.key} onClick={() => setStage(s.key)}>
            {s.label}{counts[s.key] ? ` · ${counts[s.key]}` : ''}
          </StageChip>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((s) => {
          const m = schoolMetrics(s);
          return (
            <Card key={s.id} className="cursor-pointer space-y-2" onClick={() => setEditing(s)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold">{s.name}</div>
                  <div className="text-[12px] text-ink/45">{[s.area, s.curriculum].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <Chip tone={schoolStageTone(s.stage) as never}>{schoolStageLabel(s.stage)}</Chip>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink/55">
                <span>{s.leads} leads → {s.trials} trials → <b className="text-ink/80">{s.enrolments} enrolled</b></span>
                <span>Trial→enrol {pct(m.trialToEnrol)}</span>
                {s.revenue > 0 && <span>{aed(Number(s.revenue))}</span>}
              </div>
              {s.next_action && (
                <div className="flex items-center gap-1.5 text-[12px] text-brand-red">
                  <Icon name="flag" size={12} stroke="currentColor" /> {s.next_action}
                  {s.next_action_date ? ` · ${s.next_action_date}` : ''}
                </div>
              )}
            </Card>
          );
        })}
        {!shown.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">No schools here yet.</div>
        )}
      </div>

      <SchoolModal open={creating} school={null} onClose={() => setCreating(false)} />
      <SchoolModal open={!!editing} school={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SchoolModal({ open, school, onClose }: { open: boolean; school: School | null; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: activities = [] } = useSchoolActivities(school?.id ?? null);
  const [note, setNote] = useState('');

  const [f, setF] = useState(() => seed(school));
  // Re-seed when opening a different school.
  const [seededId, setSeededId] = useState<string | null>(school?.id ?? null);
  if (open && (school?.id ?? null) !== seededId) {
    setSeededId(school?.id ?? null);
    setF(seed(school));
  }
  const set = (k: keyof ReturnType<typeof seed>, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      if (!f.name.trim()) throw new Error('School name is required');
      const payload = {
        academy_id: profile.academy_id,
        name: f.name.trim(),
        area: f.area || null,
        curriculum: f.curriculum || null,
        contact_name: f.contact_name || null,
        contact_role: f.contact_role || null,
        phone: f.phone || null,
        email: f.email || null,
        stage: f.stage as SchoolStage,
        potential_students: f.potential_students ? Number(f.potential_students) : null,
        next_action: f.next_action || null,
        next_action_date: f.next_action_date || null,
        students_reached: Number(f.students_reached || 0),
        leads: Number(f.leads || 0),
        trials: Number(f.trials || 0),
        enrolments: Number(f.enrolments || 0),
        revenue: Number(f.revenue || 0),
        notes: f.notes || null,
      };
      if (school) {
        const { error } = await supabase.from('schools').update(payload).eq('id', school.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('schools').insert({ ...payload, first_contact: new Date().toISOString().slice(0, 10) });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.show(school ? 'School updated' : 'School added'); qc.invalidateQueries({ queryKey: ['schools'] }); onClose(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!profile || !school || !note.trim()) return;
      await supabase.from('school_activities').insert({ academy_id: profile.academy_id, school_id: school.id, body: note.trim(), created_by: profile.id });
      await supabase.from('schools').update({ last_contact: new Date().toISOString().slice(0, 10) }).eq('id', school.id);
    },
    onSuccess: () => { setNote(''); toast.show('Logged'); qc.invalidateQueries({ queryKey: ['school-activities', school?.id] }); qc.invalidateQueries({ queryKey: ['schools'] }); },
  });

  return (
    <Modal open={open} onClose={onClose} title={school ? school.name : 'Add School'}>
      <div className="space-y-3">
        <Field label="School name"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area"><input value={f.area} onChange={(e) => set('area', e.target.value)} className={inputCls} /></Field>
          <Field label="Curriculum"><input value={f.curriculum} onChange={(e) => set('curriculum', e.target.value)} placeholder="British / IB / CBSE" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact"><input value={f.contact_name} onChange={(e) => set('contact_name', e.target.value)} className={inputCls} /></Field>
          <Field label="Role"><input value={f.contact_role} onChange={(e) => set('contact_role', e.target.value)} placeholder="Head of PE" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} /></Field>
          <Field label="Email"><input value={f.email} onChange={(e) => set('email', e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage">
            <select value={f.stage} onChange={(e) => set('stage', e.target.value)} className={inputCls}>
              {SCHOOL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Potential students"><input type="number" value={f.potential_students} onChange={(e) => set('potential_students', e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Next action"><input value={f.next_action} onChange={(e) => set('next_action', e.target.value)} className={inputCls} /></Field>
          <Field label="Next action date"><input type="date" value={f.next_action_date} onChange={(e) => set('next_action_date', e.target.value)} className={inputCls} /></Field>
        </div>

        <div className="rounded-card border border-cardborder bg-white p-3">
          <div className="eyebrow mb-2 text-ink/40">Outcomes produced</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Reached"><input type="number" value={f.students_reached} onChange={(e) => set('students_reached', e.target.value)} className={inputCls} /></Field>
            <Field label="Leads"><input type="number" value={f.leads} onChange={(e) => set('leads', e.target.value)} className={inputCls} /></Field>
            <Field label="Trials"><input type="number" value={f.trials} onChange={(e) => set('trials', e.target.value)} className={inputCls} /></Field>
            <Field label="Enrolled"><input type="number" value={f.enrolments} onChange={(e) => set('enrolments', e.target.value)} className={inputCls} /></Field>
            <Field label="Revenue (AED)"><input type="number" value={f.revenue} onChange={(e) => set('revenue', e.target.value)} className={inputCls} /></Field>
          </div>
        </div>

        <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : school ? 'Save Changes' : 'Add School'}
        </Button>

        {school && (
          <div className="border-t border-hairline pt-3">
            <div className="eyebrow mb-2 text-ink/40">Activity</div>
            <div className="mb-2 flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log a call / meeting…" className={inputCls} />
              <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Log</Button>
            </div>
            <div className="space-y-2">
              {activities.map((a) => (
                <div key={a.id} className="flex gap-2.5 text-[12px]">
                  <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-gold" />
                  <div>
                    <div className="text-ink/80">{a.body}</div>
                    <div className="text-[10.5px] text-ink/40">{new Date(a.created_at).toLocaleDateString('en-AE', { dateStyle: 'medium' })}{a.author ? ` · ${a.author.full_name}` : ''}</div>
                  </div>
                </div>
              ))}
              {!activities.length && <p className="text-[12px] text-ink/40">No activity yet.</p>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function seed(s: School | null) {
  return {
    name: s?.name ?? '', area: s?.area ?? '', curriculum: s?.curriculum ?? '',
    contact_name: s?.contact_name ?? '', contact_role: s?.contact_role ?? '',
    phone: s?.phone ?? '', email: s?.email ?? '',
    stage: (s?.stage ?? 'target') as string,
    potential_students: s?.potential_students != null ? String(s.potential_students) : '',
    next_action: s?.next_action ?? '', next_action_date: s?.next_action_date ?? '',
    students_reached: String(s?.students_reached ?? 0), leads: String(s?.leads ?? 0),
    trials: String(s?.trials ?? 0), enrolments: String(s?.enrolments ?? 0),
    revenue: String(s?.revenue ?? 0), notes: s?.notes ?? '',
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

function StageChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={clsx('rounded-pill px-3 py-1.5 text-[12px] font-semibold transition', active ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')}>
      {children}
    </button>
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
