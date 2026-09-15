import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useGroups } from '@/lib/queries';
import { useLeads, useLeadActivities, useStaffMembers } from '@/lib/crmQueries';
import {
  LEAD_SOURCES, LEAD_STAGES, addLeadActivity, ageFromDob, convertLeadToPlayer,
  createFollowUp, setLeadStage, sourceLabel, stageLabel, stageTone,
} from '@/lib/crm';
import { sendWhatsApp } from '@/lib/whatsapp';
import { academyName } from '@/lib/branding';
import { useToast } from '@/lib/toast';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { clsx } from '@/lib/utils';
import type { Lead, LeadStage, LeadSource } from '@/lib/types';

// Lead CRM — the front of the funnel. Capture, qualify, and move a lead through
// its stages, log every interaction, book a trial, and — the key moment —
// convert it into a player (in the existing players table) carrying its
// acquisition history forever.
export default function LeadCRM({ base }: { base: string }) {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<LeadStage | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const { data: leads = [] } = useLeads();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const l of leads) c[l.stage] = (c[l.stage] ?? 0) + 1;
    return c;
  }, [leads]);

  const filtered = useMemo(
    () => leads.filter((l) => {
      const q = search.toLowerCase();
      const hit = l.player_name.toLowerCase().includes(q)
        || (l.parent_name ?? '').toLowerCase().includes(q)
        || (l.phone ?? '').includes(q);
      if (!hit) return false;
      return stage === 'all' ? true : l.stage === stage;
    }),
    [leads, search, stage],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Growth" title="Lead CRM" />
        <Button size="sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> New Lead
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3">
        <Icon name="search" size={16} stroke="#9A938A" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, parent, phone…"
          className="h-10 w-full bg-transparent text-[14px] outline-none"
        />
      </div>

      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        <StageChip active={stage === 'all'} onClick={() => setStage('all')}>All · {counts.all ?? 0}</StageChip>
        {LEAD_STAGES.map((s) => (
          <StageChip key={s.key} active={stage === s.key} onClick={() => setStage(s.key)}>
            {s.label}{counts[s.key] ? ` · ${counts[s.key]}` : ''}
          </StageChip>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((l) => (
          <Card key={l.id} className="cursor-pointer" onClick={() => setSelected(l)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[15px] font-semibold">{l.player_name}</div>
                <div className="text-[12px] text-ink/45">
                  {l.parent_name ?? 'Parent —'}{l.age ? ` · Age ${l.age}` : ''}{l.area ? ` · ${l.area}` : ''}
                </div>
              </div>
              <Chip tone={stageTone(l.stage) as never}>{stageLabel(l.stage)}</Chip>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink/45">
              <Chip tone="neutral">{sourceLabel(l.source)}</Chip>
              {l.phone && <span className="flex items-center gap-1"><Icon name="phone" size={12} stroke="#9A938A" />{l.phone}</span>}
              {l.next_follow_up && (
                <span className={clsx('flex items-center gap-1', l.next_follow_up < today() && 'text-danger')}>
                  <Icon name="calendar" size={12} stroke="currentColor" />{l.next_follow_up}
                </span>
              )}
            </div>
          </Card>
        ))}
        {!filtered.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">
            No leads here yet.
          </div>
        )}
      </div>

      <AddLeadModal open={adding} onClose={() => setAdding(false)} />
      <LeadDetail base={base} lead={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

// ── Add Lead ──────────────────────────────────────────────────────────────────
function AddLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: staff = [] } = useStaffMembers();

  const [f, setF] = useState({
    player_name: '', parent_name: '', phone: '', email: '', dob: '', area: '',
    school: '', playing_level: '', preferred_timing: '', notes: '',
    source: 'other' as LeadSource, assigned_to: '', next_follow_up: '',
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }) as typeof f);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      if (!f.player_name.trim()) throw new Error('Player name is required');
      const { data, error } = await supabase.from('leads').insert({
        academy_id: profile.academy_id,
        player_name: f.player_name.trim(),
        parent_name: f.parent_name || null,
        phone: f.phone || null,
        email: f.email || null,
        dob: f.dob || null,
        age: ageFromDob(f.dob),
        area: f.area || null,
        school: f.school || null,
        playing_level: f.playing_level || null,
        preferred_timing: f.preferred_timing || null,
        notes: f.notes || null,
        source: f.source,
        assigned_to: f.assigned_to || null,
        next_follow_up: f.next_follow_up || null,
      }).select('id').single();
      if (error) throw error;
      const leadId = (data as { id: string }).id;
      await addLeadActivity({ academyId: profile.academy_id, leadId, type: 'system', body: 'Lead created', createdBy: profile.id });
      // The "Call parent" follow-up task is created automatically by a database
      // trigger (autotask_on_lead), so every lead — manual or webhook — gets one.
    },
    onSuccess: () => {
      toast.show('Lead added');
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['follow-ups'] });
      qc.invalidateQueries({ queryKey: ['todays-actions'] });
      qc.invalidateQueries({ queryKey: ['command-metrics'] });
      onClose();
      setF({ player_name: '', parent_name: '', phone: '', email: '', dob: '', area: '', school: '', playing_level: '', preferred_timing: '', notes: '', source: 'other', assigned_to: '', next_follow_up: '' });
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not add'),
  });

  return (
    <Modal open={open} onClose={onClose} title="New Lead">
      <div className="space-y-3">
        <Field label="Player name"><input value={f.player_name} onChange={(e) => set('player_name', e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Parent name"><input value={f.parent_name} onChange={(e) => set('parent_name', e.target.value)} className={inputCls} /></Field>
          <Field label="Phone (WhatsApp)"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+9715…" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth"><input type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} className={inputCls} /></Field>
          <Field label="Area"><input value={f.area} onChange={(e) => set('area', e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <select value={f.source} onChange={(e) => set('source', e.target.value)} className={inputCls}>
              {LEAD_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Assign to">
            <select value={f.assigned_to} onChange={(e) => set('assigned_to', e.target.value)} className={inputCls}>
              <option value="">—</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="School"><input value={f.school} onChange={(e) => set('school', e.target.value)} className={inputCls} /></Field>
          <Field label="Next follow-up"><input type="date" value={f.next_follow_up} onChange={(e) => set('next_follow_up', e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Playing level"><input value={f.playing_level} onChange={(e) => set('playing_level', e.target.value)} placeholder="Beginner / club…" className={inputCls} /></Field>
          <Field label="Preferred timing"><input value={f.preferred_timing} onChange={(e) => set('preferred_timing', e.target.value)} placeholder="Weekends AM…" className={inputCls} /></Field>
        </div>
        <Field label="Notes"><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={clsx(inputCls, 'h-auto rounded-card py-2')} /></Field>
        <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Saving…' : 'Add Lead'}
        </Button>
      </div>
    </Modal>
  );
}

// ── Lead detail ───────────────────────────────────────────────────────────────
function LeadDetail({ base, lead, onClose }: { base: string; lead: Lead | null; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: activities = [] } = useLeadActivities(lead?.id ?? null);
  const { data: groups = [] } = useGroups();
  const [note, setNote] = useState('');
  const [converting, setConverting] = useState(false);
  const [groupId, setGroupId] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['lead-activities', lead?.id] });
    qc.invalidateQueries({ queryKey: ['todays-actions'] });
    qc.invalidateQueries({ queryKey: ['command-metrics'] });
  };

  const changeStage = useMutation({
    mutationFn: async (s: LeadStage) => {
      if (!profile || !lead) return;
      const reason = s === 'lost' ? window.prompt('Reason lost? (price, location, timing…)') ?? undefined : undefined;
      await setLeadStage({ academyId: profile.academy_id, leadId: lead.id, stage: s, createdBy: profile.id, lostReason: reason });
    },
    onSuccess: () => { toast.show('Stage updated'); invalidate(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!profile || !lead || !note.trim()) return;
      await addLeadActivity({ academyId: profile.academy_id, leadId: lead.id, type: 'note', body: note.trim(), createdBy: profile.id });
    },
    onSuccess: () => { setNote(''); toast.show('Note added'); invalidate(); },
  });

  const bookTrial = useMutation({
    mutationFn: async () => {
      if (!profile || !lead) return;
      const date = window.prompt('Trial date (YYYY-MM-DD)?', today());
      if (!date) return;
      const { error } = await supabase.from('trials').insert({
        academy_id: profile.academy_id, lead_id: lead.id, player_name: lead.player_name,
        trial_date: date, center_id: lead.preferred_center_id, status: 'scheduled',
      });
      if (error) throw error;
      await supabase.from('leads').update({ stage: 'trial_booked', trial_date: date }).eq('id', lead.id);
      await addLeadActivity({ academyId: profile.academy_id, leadId: lead.id, type: 'trial', body: `Trial booked for ${date}`, createdBy: profile.id });
      await createFollowUp({ academyId: profile.academy_id, kind: 'trial_reminder', title: `Trial reminder · ${lead.player_name}`, leadId: lead.id, ownerId: lead.assigned_to ?? profile.id, dueDate: date, priority: 'high', createdBy: profile.id });
    },
    onSuccess: () => { toast.show('Trial booked'); invalidate(); qc.invalidateQueries({ queryKey: ['trials'] }); qc.invalidateQueries({ queryKey: ['follow-ups'] }); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!profile || !lead) return;
      await convertLeadToPlayer({ academyId: profile.academy_id, lead, groupId: groupId || null, createdBy: profile.id });
    },
    onSuccess: () => {
      toast.show(`${lead?.player_name} enrolled as a player 🎉`);
      setConverting(false); setGroupId('');
      invalidate();
      qc.invalidateQueries({ queryKey: ['players'] });
      qc.invalidateQueries({ queryKey: ['trials'] });
      onClose();
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not convert'),
  });

  if (!lead) return null;
  const isEnrolled = lead.stage === 'enrolled';

  return (
    <Modal open={!!lead} onClose={onClose} title={lead.player_name}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={stageTone(lead.stage) as never}>{stageLabel(lead.stage)}</Chip>
          <Chip tone="neutral">{sourceLabel(lead.source)}</Chip>
          {lead.age ? <Chip tone="neutral">Age {lead.age}</Chip> : null}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <Info label="Parent" value={lead.parent_name} />
          <Info label="Phone" value={lead.phone} />
          <Info label="Area" value={lead.area} />
          <Info label="School" value={lead.school} />
          <Info label="Level" value={lead.playing_level} />
          <Info label="Preferred" value={lead.preferred_timing} />
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          {lead.phone && (
            <Button
              size="sm" variant="whatsapp"
              onClick={() => {
                sendWhatsApp(lead.phone!, `Hi${lead.parent_name ? ` ${lead.parent_name.split(' ')[0]}` : ''}! Thanks for your interest in ${academyName()} for ${lead.player_name}. When would suit you for a free trial session? 🏏`, { academyId: profile!.academy_id, templateKey: 'lead_outreach', refType: 'lead', refId: lead.id });
                addLeadActivity({ academyId: profile!.academy_id, leadId: lead.id, type: 'whatsapp', body: 'WhatsApp outreach sent', createdBy: profile!.id }).then(invalidate);
              }}
            >
              <Icon name="whatsapp" size={14} stroke="#fff" /> WhatsApp
            </Button>
          )}
          {!isEnrolled && <Button size="sm" variant="ghost" onClick={() => bookTrial.mutate()}>Book trial</Button>}
          {!isEnrolled && <Button size="sm" variant="gold" onClick={() => setConverting((v) => !v)}>Convert to player</Button>}
          {isEnrolled && lead.converted_player_id && (
            <Chip tone="green">Enrolled · in Players</Chip>
          )}
        </div>

        {/* Convert panel */}
        {converting && !isEnrolled && (
          <Card className="space-y-3 border-gold/60">
            <div className="text-[13px] font-semibold">Enrol {lead.player_name} as a player</div>
            <p className="text-[12px] text-ink/50">
              Creates a player record and carries over the source ({sourceLabel(lead.source)}), school and
              area so the acquisition history stays attached permanently.
            </p>
            <Field label="Group / squad">
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
                <option value="">Assign later</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Button className="w-full" variant="gold" disabled={convert.isPending} onClick={() => convert.mutate()}>
              {convert.isPending ? 'Enrolling…' : 'Confirm enrolment'}
            </Button>
          </Card>
        )}

        {/* Stage mover */}
        <div>
          <div className="eyebrow mb-1.5 text-ink/40">Move stage</div>
          <div className="flex flex-wrap gap-1.5">
            {LEAD_STAGES.filter((s) => s.key !== 'enrolled').map((s) => (
              <button
                key={s.key}
                onClick={() => changeStage.mutate(s.key)}
                disabled={lead.stage === s.key}
                className={clsx(
                  'rounded-chip px-2.5 py-1 text-[11px] font-semibold transition',
                  lead.stage === s.key ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60 hover:border-gold',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Add note */}
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log a note / call outcome…" className={inputCls} />
          <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Log</Button>
        </div>

        {/* Timeline */}
        <div>
          <div className="eyebrow mb-2 text-ink/40">Activity</div>
          <div className="space-y-2">
            {activities.map((a) => (
              <div key={a.id} className="flex gap-2.5 text-[12px]">
                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-gold" />
                <div>
                  <div className="text-ink/80">{a.body}</div>
                  <div className="text-[10.5px] text-ink/40">
                    {new Date(a.created_at).toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' })}
                    {a.author ? ` · ${a.author.full_name}` : ''}
                  </div>
                </div>
              </div>
            ))}
            {!activities.length && <p className="text-[12px] text-ink/40">No activity yet.</p>}
          </div>
        </div>

        <Link to={`${base}/trials`} className="block text-center text-[12px] font-semibold text-brand-red">
          View trials →
        </Link>
      </div>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-eyebrow text-ink/35">{label}</div>
      <div className="text-ink/80">{value || '—'}</div>
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

function StageChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-pill px-3 py-1.5 text-[12px] font-semibold transition',
        active ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
      )}
    >
      {children}
    </button>
  );
}
