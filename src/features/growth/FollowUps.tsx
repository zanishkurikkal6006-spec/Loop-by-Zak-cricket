import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useFollowUps, useStaffMembers } from '@/lib/crmQueries';
import { TASK_KIND_LABELS, createFollowUp } from '@/lib/crm';
import { useToast } from '@/lib/toast';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { clsx } from '@/lib/utils';
import type { FollowUpTask, Lead, Profile, TaskPriority } from '@/lib/types';

type Row = FollowUpTask & { owner: Profile | null; lead: Lead | null };
const today = () => new Date().toISOString().slice(0, 10);
const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';
const P_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const P_TONE: Record<TaskPriority, 'red' | 'amber' | 'blue' | 'neutral'> = { critical: 'red', high: 'amber', medium: 'blue', low: 'neutral' };

// Follow-up Center — the single sales / action queue. Overdue first, then by
// priority and due date. Every task has an owner, a due date and an outcome.
export default function FollowUps() {
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data: open = [] } = useFollowUps('open');
  const { data: done = [] } = useFollowUps('done');
  const list = showDone ? done : open;

  const sorted = useMemo(() => [...list].sort((a, b) => {
    if (!showDone) {
      const ao = (a.due_date ?? '') && a.due_date! < today() ? 0 : 1;
      const bo = (b.due_date ?? '') && b.due_date! < today() ? 0 : 1;
      if (ao !== bo) return ao - bo;
    }
    if (P_ORDER[a.priority] !== P_ORDER[b.priority]) return P_ORDER[a.priority] - P_ORDER[b.priority];
    return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  }), [list, showDone]);

  const overdue = open.filter((t) => t.due_date && t.due_date < today()).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Growth" title="Follow-ups" />
        <Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add Task</Button>
      </div>

      <div className="flex items-center gap-2">
        <Toggle active={!showDone} onClick={() => setShowDone(false)}>Open · {open.length}</Toggle>
        <Toggle active={showDone} onClick={() => setShowDone(true)}>Done · {done.length}</Toggle>
        {overdue > 0 && !showDone && <Chip tone="red" className="ml-auto">{overdue} overdue</Chip>}
      </div>

      <div className="space-y-2.5">
        {sorted.map((t) => <TaskRow key={t.id} task={t} />)}
        {!sorted.length && (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="inbox" size={26} stroke="#C4BDB2" />
            <p className="text-[13px] text-ink/45">{showDone ? 'No completed tasks yet.' : 'Queue is clear. 🎉'}</p>
          </Card>
        )}
      </div>

      <AddTaskModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function TaskRow({ task }: { task: Row }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const isOverdue = task.status === 'open' && task.due_date && task.due_date < today();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['follow-ups'] });
    qc.invalidateQueries({ queryKey: ['todays-actions'] });
  };

  const complete = useMutation({
    mutationFn: async () => {
      const outcome = window.prompt('Outcome / note (optional)') ?? null;
      const { error } = await supabase.from('follow_up_tasks')
        .update({ status: 'done', outcome, completed_at: new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.show('Marked done'); invalidate(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  const snooze = useMutation({
    mutationFn: async () => {
      const next = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
      const { error } = await supabase.from('follow_up_tasks').update({ due_date: next }).eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.show('Snoozed 2 days'); invalidate(); },
  });

  return (
    <Card className={clsx('flex items-center gap-3', isOverdue && 'border-danger/40')}>
      <Chip tone={P_TONE[task.priority]} className="capitalize">{task.priority}</Chip>
      <div className="flex-1">
        <div className="text-[14px] font-semibold">{task.title}</div>
        {task.notes && (
          <div className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-amber-text">
            <Icon name="alert" size={12} stroke="currentColor" />{task.notes}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink/45">
          <span>{TASK_KIND_LABELS[task.kind]}</span>
          {task.due_date && (
            <span className={clsx('flex items-center gap-1', isOverdue && 'font-semibold text-danger')}>
              <Icon name="calendar" size={11} stroke="currentColor" />{task.due_date}
            </span>
          )}
          {task.owner && <span>· {task.owner.full_name}</span>}
          {task.status === 'done' && task.outcome && <span className="text-ink/60">· {task.outcome}</span>}
        </div>
      </div>
      {task.status === 'open' && profile && (
        <div className="flex gap-1.5">
          <button onClick={() => snooze.mutate()} className="rounded-pill border border-cardborder px-2.5 py-1.5 text-[11px] font-semibold text-ink/55" title="Snooze 2 days">
            Snooze
          </button>
          <button onClick={() => complete.mutate()} className="rounded-pill bg-success px-2.5 py-1.5 text-[11px] font-semibold text-white" title="Complete">
            Done
          </button>
        </div>
      )}
    </Card>
  );
}

function AddTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: staff = [] } = useStaffMembers();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today());
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [owner, setOwner] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      if (!title.trim()) throw new Error('Title is required');
      await createFollowUp({
        academyId: profile.academy_id, kind: 'other', title: title.trim(),
        ownerId: owner || profile.id, dueDate: due || null, priority, createdBy: profile.id,
      });
    },
    onSuccess: () => {
      toast.show('Task added');
      qc.invalidateQueries({ queryKey: ['follow-ups'] });
      qc.invalidateQueries({ queryKey: ['todays-actions'] });
      onClose(); setTitle(''); setDue(today()); setPriority('medium'); setOwner('');
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not add'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Add Task">
      <div className="space-y-3">
        <Label label="Task"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call the Al Barsha family…" className={inputCls} /></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label label="Due date"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} /></Label>
          <Label label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputCls}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Label>
        </div>
        <Label label="Owner">
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls}>
            <option value="">Me</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </Label>
        <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Saving…' : 'Add Task'}
        </Button>
      </div>
    </Modal>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx('rounded-pill px-3 py-1.5 text-[12px] font-semibold transition', active ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')}
    >
      {children}
    </button>
  );
}

function Label({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">{label}</span>
      {children}
    </label>
  );
}
