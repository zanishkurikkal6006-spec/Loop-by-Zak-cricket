import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useGroups } from '@/lib/queries';
import { useLeads, useStaffMembers, useTrials } from '@/lib/crmQueries';
import {
  TRIAL_SKILLS, addLeadActivity, convertLeadToPlayer, createFollowUp,
} from '@/lib/crm';
import { useToast } from '@/lib/toast';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { clsx } from '@/lib/utils';
import type { Lead, TrainingCenter, Trial, TrialAssessment, TrialStatus } from '@/lib/types';

type TrialRow = Trial & { assessment: TrialAssessment | null };
type Tab = 'today' | 'upcoming' | 'attended' | 'no_show' | 'all';
const today = () => new Date().toISOString().slice(0, 10);
const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

const STATUS_TONE: Record<TrialStatus, 'blue' | 'green' | 'red' | 'gold' | 'neutral'> = {
  scheduled: 'blue', attended: 'gold', no_show: 'red', converted: 'green', cancelled: 'neutral',
};

// Trials — the trial calendar, attendance outcomes, and the coach's structured
// trial assessment. An attended trial with an assessment can convert its lead
// straight into a player.
export default function Trials() {
  const [tab, setTab] = useState<Tab>('today');
  const [adding, setAdding] = useState(false);
  const [assessing, setAssessing] = useState<TrialRow | null>(null);
  const { data: trials = [] } = useTrials();

  const filtered = useMemo(() => trials.filter((t) => {
    switch (tab) {
      case 'today': return t.trial_date === today() && (t.status === 'scheduled' || t.status === 'attended');
      case 'upcoming': return t.trial_date >= today() && t.status === 'scheduled';
      case 'attended': return t.status === 'attended' || t.status === 'converted';
      case 'no_show': return t.status === 'no_show';
      default: return true;
    }
  }), [trials, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'attended', label: 'Attended' },
    { key: 'no_show', label: 'No-shows' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Growth" title="Trials" />
        <Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Book Trial</Button>
      </div>

      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'rounded-pill px-3 py-1.5 text-[12px] font-semibold transition',
              tab === t.key ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((t) => <TrialCard key={t.id} trial={t} onAssess={() => setAssessing(t)} />)}
        {!filtered.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">No trials here.</div>
        )}
      </div>

      <AddTrialModal open={adding} onClose={() => setAdding(false)} />
      <AssessModal trial={assessing} onClose={() => setAssessing(null)} />
    </div>
  );
}

function TrialCard({ trial, onAssess }: { trial: TrialRow; onAssess: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);
  const { data: groups = [] } = useGroups();
  const [groupId, setGroupId] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['trials'] });
    qc.invalidateQueries({ queryKey: ['todays-actions'] });
    qc.invalidateQueries({ queryKey: ['command-metrics'] });
  };

  const setStatus = useMutation({
    mutationFn: async (status: TrialStatus) => {
      if (!profile) return;
      const { error } = await supabase.from('trials').update({ status }).eq('id', trial.id);
      if (error) throw error;
      if (trial.lead_id) {
        if (status === 'attended') {
          await supabase.from('leads').update({ stage: 'trial_attended' }).eq('id', trial.lead_id);
          await addLeadActivity({ academyId: profile.academy_id, leadId: trial.lead_id, type: 'trial', body: 'Attended trial', createdBy: profile.id });
          await createFollowUp({ academyId: profile.academy_id, kind: 'post_trial', title: `Post-trial follow-up · ${trial.player_name}`, leadId: trial.lead_id, trialId: trial.id, ownerId: profile.id, dueDate: today(), priority: 'high', createdBy: profile.id });
        } else if (status === 'no_show') {
          await addLeadActivity({ academyId: profile.academy_id, leadId: trial.lead_id, type: 'trial', body: 'No-show', createdBy: profile.id });
          await createFollowUp({ academyId: profile.academy_id, kind: 'trial_no_show', title: `Re-book no-show · ${trial.player_name}`, leadId: trial.lead_id, trialId: trial.id, ownerId: profile.id, dueDate: today(), priority: 'high', createdBy: profile.id });
        }
      }
    },
    onSuccess: () => { toast.show('Trial updated'); invalidate(); qc.invalidateQueries({ queryKey: ['follow-ups'] }); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  const enrol = useMutation({
    mutationFn: async () => {
      if (!profile || !trial.lead_id) throw new Error('No lead linked to this trial');
      const { data } = await supabase.from('leads').select('*').eq('id', trial.lead_id).single();
      if (!data) throw new Error('Lead not found');
      await convertLeadToPlayer({ academyId: profile.academy_id, lead: data as Lead, groupId: groupId || null, createdBy: profile.id });
    },
    onSuccess: () => {
      toast.show(`${trial.player_name} enrolled 🎉`);
      setEnrolling(false); invalidate();
      qc.invalidateQueries({ queryKey: ['players'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  const a = trial.assessment;

  return (
    <Card className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold">{trial.player_name}</div>
          <div className="flex items-center gap-1 text-[12px] text-ink/45">
            <Icon name="calendar" size={12} stroke="#9A938A" />
            {trial.trial_date}{trial.time_slot ? ` · ${trial.time_slot}` : ''}
          </div>
        </div>
        <Chip tone={STATUS_TONE[trial.status]} className="capitalize">{trial.status.replace('_', '-')}</Chip>
      </div>

      {a && (
        <div className="rounded-card bg-hairline p-2.5 text-[12px]">
          <div className="flex flex-wrap gap-1.5">
            {TRIAL_SKILLS.filter((s) => a.ratings[s.key]).map((s) => (
              <span key={s.key} className="rounded-chip bg-white px-2 py-0.5">{s.label} {a.ratings[s.key]}/5</span>
            ))}
          </div>
          {a.recommended_program && <div className="mt-1.5 text-ink/60">Recommended: <b>{a.recommended_program}</b>{a.recommended_level ? ` · ${a.recommended_level}` : ''}</div>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {trial.status === 'scheduled' && (
          <>
            <Button size="sm" onClick={() => setStatus.mutate('attended')}>Mark attended</Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus.mutate('no_show')}>No-show</Button>
          </>
        )}
        {(trial.status === 'attended') && (
          <>
            <Button size="sm" variant={a ? 'ghost' : 'primary'} onClick={onAssess}>{a ? 'Edit assessment' : 'Assess'}</Button>
            {trial.lead_id && <Button size="sm" variant="gold" onClick={() => setEnrolling((v) => !v)}>Enrol player</Button>}
          </>
        )}
        {trial.status === 'converted' && <Chip tone="green">Enrolled</Chip>}
      </div>

      {enrolling && trial.status === 'attended' && (
        <div className="space-y-2 rounded-card border border-gold/60 p-2.5">
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
            <option value="">Assign group later</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <Button size="sm" variant="gold" className="w-full" disabled={enrol.isPending} onClick={() => enrol.mutate()}>
            {enrol.isPending ? 'Enrolling…' : 'Confirm enrolment'}
          </Button>
        </div>
      )}
    </Card>
  );
}

function AddTrialModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: groups = [] } = useGroups();
  const { data: staff = [] } = useStaffMembers();
  const { data: leads = [] } = useLeads();

  const [f, setF] = useState({ player_name: '', trial_date: today(), time_slot: '', center_id: '', group_id: '', coach_id: '', lead_id: '' });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }) as typeof f);

  const centers = useQuery({
    queryKey: ['centers', profile?.academy_id],
    enabled: !!profile && open,
    queryFn: async (): Promise<TrainingCenter[]> => {
      const { data, error } = await supabase.from('training_centers').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as TrainingCenter[];
    },
  });

  const openLeads = leads.filter((l) => l.stage !== 'enrolled' && l.stage !== 'lost');

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      const linked = f.lead_id ? leads.find((l) => l.id === f.lead_id) : null;
      const name = linked?.player_name || f.player_name.trim();
      if (!name) throw new Error('Player name is required');
      const { error } = await supabase.from('trials').insert({
        academy_id: profile.academy_id,
        lead_id: f.lead_id || null,
        player_name: name,
        trial_date: f.trial_date,
        time_slot: f.time_slot || null,
        center_id: f.center_id || null,
        group_id: f.group_id || null,
        coach_id: f.coach_id || null,
        status: 'scheduled',
      });
      if (error) throw error;
      if (f.lead_id) {
        await supabase.from('leads').update({ stage: 'trial_booked', trial_date: f.trial_date }).eq('id', f.lead_id);
        await addLeadActivity({ academyId: profile.academy_id, leadId: f.lead_id, type: 'trial', body: `Trial booked for ${f.trial_date}`, createdBy: profile.id });
      }
    },
    onSuccess: () => {
      toast.show('Trial booked');
      qc.invalidateQueries({ queryKey: ['trials'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['todays-actions'] });
      onClose();
      setF({ player_name: '', trial_date: today(), time_slot: '', center_id: '', group_id: '', coach_id: '', lead_id: '' });
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not book'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Book Trial">
      <div className="space-y-3">
        <Field label="Link to lead (optional)">
          <select value={f.lead_id} onChange={(e) => set('lead_id', e.target.value)} className={inputCls}>
            <option value="">New / walk-in trial</option>
            {openLeads.map((l) => <option key={l.id} value={l.id}>{l.player_name}{l.parent_name ? ` · ${l.parent_name}` : ''}</option>)}
          </select>
        </Field>
        {!f.lead_id && (
          <Field label="Player name"><input value={f.player_name} onChange={(e) => set('player_name', e.target.value)} className={inputCls} /></Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" value={f.trial_date} onChange={(e) => set('trial_date', e.target.value)} className={inputCls} /></Field>
          <Field label="Time slot"><input value={f.time_slot} onChange={(e) => set('time_slot', e.target.value)} placeholder="5–6 PM" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Centre">
            <select value={f.center_id} onChange={(e) => set('center_id', e.target.value)} className={inputCls}>
              <option value="">—</option>
              {(centers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Group">
            <select value={f.group_id} onChange={(e) => set('group_id', e.target.value)} className={inputCls}>
              <option value="">—</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Coach">
          <select value={f.coach_id} onChange={(e) => set('coach_id', e.target.value)} className={inputCls}>
            <option value="">—</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </Field>
        <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Booking…' : 'Book Trial'}
        </Button>
      </div>
    </Modal>
  );
}

function AssessModal({ trial, onClose }: { trial: TrialRow | null; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const existing = trial?.assessment;
  const [ratings, setRatings] = useState<Record<string, number>>(existing?.ratings ?? {});
  const [strength, setStrength] = useState(existing?.strength ?? '');
  const [priority, setPriority] = useState(existing?.development_priority ?? '');
  const [program, setProgram] = useState(existing?.recommended_program ?? '');
  const [level, setLevel] = useState(existing?.recommended_level ?? '');
  const [comments, setComments] = useState(existing?.comments ?? '');

  // Re-seed when a different trial opens.
  const key = trial?.id ?? '';
  const [seeded, setSeeded] = useState('');
  if (trial && key !== seeded) {
    setSeeded(key);
    setRatings(trial.assessment?.ratings ?? {});
    setStrength(trial.assessment?.strength ?? '');
    setPriority(trial.assessment?.development_priority ?? '');
    setProgram(trial.assessment?.recommended_program ?? '');
    setLevel(trial.assessment?.recommended_level ?? '');
    setComments(trial.assessment?.comments ?? '');
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!profile || !trial) return;
      const payload = {
        academy_id: profile.academy_id, trial_id: trial.id, coach_id: profile.id,
        ratings, strength: strength || null, development_priority: priority || null,
        recommended_program: program || null, recommended_level: level || null, comments: comments || null,
      };
      if (existing) {
        const { error } = await supabase.from('trial_assessments').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('trial_assessments').insert(payload);
        if (error) throw error;
      }
      if (trial.status === 'scheduled') await supabase.from('trials').update({ status: 'attended' }).eq('id', trial.id);
      if (trial.lead_id) {
        await supabase.from('leads').update({ stage: 'trial_attended' }).eq('id', trial.lead_id);
        await addLeadActivity({ academyId: profile.academy_id, leadId: trial.lead_id, type: 'trial', body: `Trial assessed${program ? ` · rec. ${program}` : ''}`, createdBy: profile.id });
      }
    },
    onSuccess: () => {
      toast.show('Assessment saved');
      qc.invalidateQueries({ queryKey: ['trials'] });
      qc.invalidateQueries({ queryKey: ['todays-actions'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      onClose();
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  if (!trial) return null;

  return (
    <Modal open={!!trial} onClose={onClose} title={`Assess · ${trial.player_name}`}>
      <div className="space-y-4">
        <div className="space-y-2">
          {TRIAL_SKILLS.map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-[13px] font-medium">{s.label}</span>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRatings((r) => ({ ...r, [s.key]: n }))}
                    className={clsx(
                      'h-8 w-8 rounded-full text-[12px] font-semibold transition',
                      ratings[s.key] >= n ? 'bg-gold text-ink' : 'border border-cardborder bg-white text-ink/40',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Recommended program"><input value={program} onChange={(e) => setProgram(e.target.value)} placeholder="Foundation…" className={inputCls} /></Field>
          <Field label="Recommended level"><input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="U-10…" className={inputCls} /></Field>
        </div>
        <Field label="Key strength"><input value={strength} onChange={(e) => setStrength(e.target.value)} className={inputCls} /></Field>
        <Field label="Development priority"><input value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls} /></Field>
        <Field label="Comments"><textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} className={clsx(inputCls, 'h-auto rounded-card py-2')} /></Field>

        <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save Assessment'}
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
