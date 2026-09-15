import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayers } from '@/lib/queries';
import { useStaffMembers } from '@/lib/crmQueries';
import { useIssues, useParentTimeline, type TimelineEvent } from '@/lib/experienceQueries';
import { ISSUE_CATEGORIES, ISSUE_SLA_HOURS, issueCategoryLabel } from '@/lib/experience';
import { useToast } from '@/lib/toast';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { clsx } from '@/lib/utils';
import type { Issue, IssueCategory, TaskPriority } from '@/lib/types';

type Tab = 'issues' | 'timeline';
const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';
const P_TONE: Record<TaskPriority, 'red' | 'amber' | 'blue' | 'neutral'> = { critical: 'red', high: 'amber', medium: 'blue', low: 'neutral' };

// Parent Experience — Issues & Feedback with an SLA clock, plus a unified
// interaction timeline per player (reports, assessments, badges, messages,
// issues), so the whole relationship reads in one place.
export default function ParentExperience() {
  const [tab, setTab] = useState<Tab>('issues');
  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Experience" title="Parent Experience" />
      <div className="flex gap-2">
        <TabBtn active={tab === 'issues'} onClick={() => setTab('issues')}>Issues &amp; Feedback</TabBtn>
        <TabBtn active={tab === 'timeline'} onClick={() => setTab('timeline')}>Timeline</TabBtn>
      </div>
      {tab === 'issues' ? <IssuesTab /> : <TimelineTab />}
    </div>
  );
}

function IssuesTab() {
  const [showResolved, setShowResolved] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data: issues = [] } = useIssues(showResolved ? 'resolved' : 'open');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <TabBtn active={!showResolved} onClick={() => setShowResolved(false)}>Open</TabBtn>
          <TabBtn active={showResolved} onClick={() => setShowResolved(true)}>Resolved</TabBtn>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Log Issue</Button>
      </div>

      <div className="space-y-3">
        {issues.map((i) => <IssueCard key={i.id} issue={i} />)}
        {!issues.length && (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="message" size={24} stroke="#C4BDB2" />
            <p className="text-[13px] text-ink/45">{showResolved ? 'No resolved issues yet.' : 'No open issues. 🎉'}</p>
          </Card>
        )}
      </div>

      <AddIssueModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue & { player: { full_name: string } | null; owner: { full_name: string } | null } }) {
  const toast = useToast();
  const qc = useQueryClient();
  const sla = slaState(issue);

  const resolve = useMutation({
    mutationFn: async () => {
      const resolution = window.prompt('Resolution note') ?? null;
      const { error } = await supabase.from('issues')
        .update({ status: 'resolved', resolution, resolved_at: new Date().toISOString() })
        .eq('id', issue.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.show('Issue resolved'); qc.invalidateQueries({ queryKey: ['issues'] }); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  const progress = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('issues').update({ status: 'in_progress' }).eq('id', issue.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.show('Marked in progress'); qc.invalidateQueries({ queryKey: ['issues'] }); },
  });

  return (
    <Card className={clsx('space-y-2', sla.breached && issue.status !== 'resolved' && 'border-danger/40')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold">{issue.title}</div>
          <div className="text-[12px] text-ink/45">
            {issueCategoryLabel(issue.category)}{issue.player ? ` · ${issue.player.full_name}` : ''}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Chip tone={P_TONE[issue.priority]} className="capitalize">{issue.priority}</Chip>
          <Chip tone={issue.status === 'resolved' ? 'green' : issue.status === 'in_progress' ? 'blue' : 'neutral'} className="capitalize">
            {issue.status.replace('_', ' ')}
          </Chip>
        </div>
      </div>
      {issue.body && <p className="text-[13px] text-ink/70">{issue.body}</p>}
      <div className="flex items-center justify-between">
        <span className={clsx('text-[11px]', sla.breached && issue.status !== 'resolved' ? 'font-semibold text-danger' : 'text-ink/45')}>
          {issue.status === 'resolved' ? (issue.resolution ? `Resolved: ${issue.resolution}` : 'Resolved') : sla.label}
          {issue.owner ? ` · ${issue.owner.full_name}` : ''}
        </span>
        {issue.status !== 'resolved' && (
          <div className="flex gap-1.5">
            {issue.status === 'open' && (
              <button onClick={() => progress.mutate()} className="rounded-pill border border-cardborder px-2.5 py-1.5 text-[11px] font-semibold text-ink/55">
                Start
              </button>
            )}
            <button onClick={() => resolve.mutate()} className="rounded-pill bg-success px-2.5 py-1.5 text-[11px] font-semibold text-white">
              Resolve
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function slaState(issue: Issue): { label: string; breached: boolean } {
  const hours = ISSUE_SLA_HOURS[issue.priority] ?? 72;
  const due = new Date(issue.created_at).getTime() + hours * 3600_000;
  const remainingMs = due - Date.now();
  if (remainingMs < 0) return { label: `SLA breached (${hours}h target)`, breached: true };
  const h = Math.round(remainingMs / 3600_000);
  return { label: h >= 24 ? `${Math.round(h / 24)}d to SLA` : `${h}h to SLA`, breached: false };
}

function AddIssueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: players = [] } = usePlayers();
  const { data: staff = [] } = useStaffMembers();
  const [f, setF] = useState({ title: '', body: '', player_id: '', category: 'other' as IssueCategory, priority: 'medium' as TaskPriority, owner_id: '' });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }) as typeof f);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      if (!f.title.trim()) throw new Error('Title is required');
      const { error } = await supabase.from('issues').insert({
        academy_id: profile.academy_id,
        title: f.title.trim(),
        body: f.body || null,
        player_id: f.player_id || null,
        category: f.category,
        priority: f.priority,
        owner_id: f.owner_id || profile.id,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.show('Issue logged');
      qc.invalidateQueries({ queryKey: ['issues'] });
      onClose();
      setF({ title: '', body: '', player_id: '', category: 'other', priority: 'medium', owner_id: '' });
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not log'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Log Issue / Feedback">
      <div className="space-y-3">
        <Field label="Summary"><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Parent unhappy with…" className={inputCls} /></Field>
        <Field label="Details"><textarea value={f.body} onChange={(e) => set('body', e.target.value)} rows={3} className={clsx(inputCls, 'h-auto rounded-card py-2')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={f.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
              {ISSUE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={f.priority} onChange={(e) => set('priority', e.target.value)} className={inputCls}>
              <option value="critical">Critical</option><option value="high">High</option>
              <option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Player (optional)">
            <select value={f.player_id} onChange={(e) => set('player_id', e.target.value)} className={inputCls}>
              <option value="">—</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </Field>
          <Field label="Owner">
            <select value={f.owner_id} onChange={(e) => set('owner_id', e.target.value)} className={inputCls}>
              <option value="">Me</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </Field>
        </div>
        <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Saving…' : 'Log Issue'}
        </Button>
      </div>
    </Modal>
  );
}

function TimelineTab() {
  const [search, setSearch] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const { data: players = [] } = usePlayers();
  const { data: events = [], isLoading } = useParentTimeline(playerId);
  const selected = players.find((p) => p.id === playerId);

  const matches = useMemo(
    () => (search ? players.filter((p) => p.full_name.toLowerCase().includes(search.toLowerCase())).slice(0, 6) : []),
    [players, search],
  );

  return (
    <div className="space-y-4">
      {!selected && (
        <>
          <div className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3">
            <Icon name="search" size={16} stroke="#9A938A" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a player…" className="h-10 w-full bg-transparent text-[14px] outline-none" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {matches.map((p) => (
              <button key={p.id} onClick={() => setPlayerId(p.id)} className="rounded-card border border-cardborder bg-white px-4 py-3 text-left text-[14px] font-semibold hover:border-gold">
                {p.full_name}
                <span className="ml-2 text-[12px] font-normal text-ink/45">{p.parent_name ?? ''}</span>
              </button>
            ))}
            {search && !matches.length && <p className="text-[13px] text-ink/40">No match.</p>}
            {!search && <p className="text-[13px] text-ink/40">Search for a player to see their full interaction history.</p>}
          </div>
        </>
      )}

      {selected && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[16px] font-semibold">{selected.full_name}</div>
              <div className="text-[12px] text-ink/45">{selected.parent_name ?? ''}{selected.parent_phone ? ` · ${selected.parent_phone}` : ''}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { setPlayerId(null); setSearch(''); }}>Change</Button>
          </div>

          {isLoading && <Card className="text-[13px] text-ink/45">Loading history…</Card>}
          <div className="space-y-2">
            {events.map((e) => <TimelineRow key={e.id} event={e} />)}
            {!isLoading && !events.length && <Card className="text-[13px] text-ink/45">No recorded interactions yet.</Card>}
          </div>
        </>
      )}
    </div>
  );
}

const KIND_ICON: Record<TimelineEvent['kind'], string> = {
  attendance: 'check', report: 'message', assessment: 'badge', badge: 'trophy', payment: 'card', message: 'whatsapp', issue: 'alert',
};

function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <Card className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-pill bg-hairline">
        <Icon name={KIND_ICON[event.kind]} size={15} stroke="#7A756C" />
      </div>
      <div className="flex-1">
        <div className="text-[13.5px] font-semibold">{event.title}</div>
        {event.detail && <div className="text-[12px] text-ink/55">{event.detail}</div>}
      </div>
      <div className="text-[11px] text-ink/40">
        {event.at ? new Date(event.at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' }) : ''}
      </div>
    </Card>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
