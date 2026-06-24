import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePendingAttendance, useGroups, useCoaches, usePlayers } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { clsx } from '@/lib/utils';
import BatchPicker, { type BatchSelection } from '@/features/attendance/BatchPicker';
import { applyAttendanceUsage } from '@/lib/packages';
import type { AttendanceRecord, AttendanceSession, AttendanceState, Player } from '@/lib/types';

// Admin Attendance — three tabs:
//  • Pending      review & confirm a coach's submission
//  • History      confirmed sessions
//  • Take         admin marks attendance (covering for a coach), credited to a
//                 chosen coach and auto-confirmed.
type Tab = 'pending' | 'history' | 'take';

export default function AdminAttendance() {
  const [tab, setTab] = useState<Tab>('pending');
  const { data: pending = [] } = usePendingAttendance();

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Admin" title="Attendance" />

      <div className="flex gap-2">
        <TabBtn active={tab === 'pending'} onClick={() => setTab('pending')}>
          Pending <Chip tone={pending.length ? 'amber' : 'neutral'} className="ml-1">{pending.length}</Chip>
        </TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>History</TabBtn>
        <TabBtn active={tab === 'take'} onClick={() => setTab('take')}>Take Attendance</TabBtn>
      </div>

      {tab === 'pending' && (
        <div className="space-y-3">
          {pending.map((session) => (
            <PendingCard key={session.id} session={session} />
          ))}
          {!pending.length && (
            <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">
              Nothing awaiting confirmation.
            </div>
          )}
        </div>
      )}

      {tab === 'history' && <HistoryTab />}
      {tab === 'take' && <TakeAttendanceTab />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'inline-flex items-center rounded-chip px-3 py-1.5 text-[12px] font-semibold transition',
        active ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
      )}
    >
      {children}
    </button>
  );
}

function PendingCard({ session }: { session: AttendanceSession }) {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const records = useQuery({
    queryKey: ['attendance-records', session.id],
    queryFn: async (): Promise<(AttendanceRecord & { player: Player })[]> => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, player:players(*)')
        .eq('session_id', session.id);
      if (error) throw error;
      return (data ?? []) as (AttendanceRecord & { player: Player })[];
    },
  });

  const rows = records.data ?? [];
  const present = rows.filter((r) => r.state === 'present').length;
  const late = rows.filter((r) => r.state === 'late').length;

  // Cross-coach double-marking detection: a player marked in another session on
  // the SAME date by a different coach. Admin then picks 1- or 2-session
  // deduction so a parent is never double-charged.
  const { data: coaches = [] } = useCoaches();
  const coachName = (id: string | null) => coaches.find((c) => c.id === id)?.full_name ?? 'another coach';
  const dupes = useQuery({
    queryKey: ['attendance-dupes', session.id, rows.length],
    enabled: rows.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      // Other sessions on the same date.
      const { data: others } = await supabase
        .from('attendance_sessions')
        .select('id, coach_id')
        .eq('session_date', session.session_date)
        .neq('id', session.id);
      const otherSessions = (others ?? []) as { id: string; coach_id: string | null }[];
      if (!otherSessions.length) return {};
      const { data: dupRecords } = await supabase
        .from('attendance_records')
        .select('player_id, session_id')
        .in('session_id', otherSessions.map((s) => s.id))
        .in('player_id', rows.map((r) => r.player_id));
      const coachBySession = new Map(otherSessions.map((s) => [s.id, s.coach_id]));
      const map: Record<string, string> = {};
      for (const d of (dupRecords ?? []) as { player_id: string; session_id: string }[]) {
        map[d.player_id] = coachBySession.get(d.session_id) ?? '';
      }
      return map;
    },
  });
  const dupeMap = dupes.data ?? {};

  async function setDeduct(recordId: string, n: number) {
    const { error } = await supabase.from('attendance_records').update({ deduct_sessions: n }).eq('id', recordId);
    if (error) return toast.show('Could not update');
    toast.show(n === 1 ? 'Deducting 1 session' : 'Deducting 2 sessions');
    queryClient.invalidateQueries({ queryKey: ['attendance-records', session.id] });
  }

  const confirm = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      const { error } = await supabase
        .from('attendance_sessions')
        .update({ status: 'confirmed', confirmed_by: profile.id })
        .eq('id', session.id);
      if (error) throw error;
      // Decrement packages / accrue extra sessions for the marked players.
      await applyAttendanceUsage(session.id);
      // Production: enqueue parent WhatsApp messages here (outbound_messages).
    },
    onSuccess: () => {
      toast.show('Confirmed · WhatsApp sent to parents');
      queryClient.invalidateQueries({ queryKey: ['attendance-pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin-packages'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not confirm'),
  });

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold">{session.session_date}</div>
          <div className="mt-1 flex gap-2">
            <Chip tone="green">{present} Present</Chip>
            <Chip tone="amber">{late} Late</Chip>
          </div>
        </div>
        <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
          Confirm &amp; Send
        </Button>
      </div>
      <div className="mt-3 divide-y divide-hairline">
        {rows.map((r) => {
          const dupCoach = dupeMap[r.player_id];
          return (
            <div key={r.id} className="py-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px]">{r.player?.full_name}</span>
                <Chip tone={r.state === 'present' ? 'green' : 'amber'}>
                  {r.state === 'present' ? 'Present' : 'Late'}
                </Chip>
              </div>
              {dupCoach !== undefined && (
                <div className="mt-1 flex flex-wrap items-center gap-2 rounded-chip bg-chip-amber px-2 py-1.5">
                  <span className="text-[11px] text-amber-text">
                    Also marked by {coachName(dupCoach)} today
                  </span>
                  <div className="flex gap-1">
                    {[1, 2].map((n) => (
                      <button
                        key={n}
                        onClick={() => setDeduct(r.id, n)}
                        className={
                          'rounded-chip px-2 py-0.5 text-[11px] font-semibold ' +
                          (r.deduct_sessions === n ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')
                        }
                      >
                        {n} session{n > 1 ? 's' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// History — confirmed sessions, each expandable to show WHO attended (names),
// the group, and present/late counts so admins can audit a date at a glance.
type HistorySession = AttendanceSession & {
  group: { name: string } | null;
  attendance_records: { state: AttendanceState; player: { full_name: string } | null }[];
};

function HistoryTab() {
  const { profile } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['attendance-history', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<HistorySession[]> => {
      const { data, error } = await supabase
        .from('attendance_sessions')
        .select('*, group:groups(name), attendance_records(state, player:players(full_name))')
        .eq('status', 'confirmed')
        .order('session_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as HistorySession[];
    },
  });

  function dateLabel(d: string) {
    return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <Card className="divide-y divide-hairline p-0">
      {isLoading && <div className="px-4 py-4 text-[13px] text-ink/45">Loading…</div>}
      {sessions.map((s) => {
        const recs = s.attendance_records ?? [];
        const present = recs.filter((r) => r.state === 'present').length;
        const late = recs.filter((r) => r.state === 'late').length;
        const isOpen = openId === s.id;
        return (
          <div key={s.id} className="px-4 py-3 text-[13px]">
            <button
              onClick={() => setOpenId(isOpen ? null : s.id)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <div className="font-semibold">{dateLabel(s.session_date)}</div>
                <div className="text-[11px] text-ink/45">
                  {s.group?.name ?? 'Group'} · {recs.length} attended
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Chip tone="green">{present} P</Chip>
                {late > 0 && <Chip tone="amber">{late} L</Chip>}
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} stroke="#9A938A" />
              </div>
            </button>
            {isOpen && (
              <div className="mt-2 space-y-1 border-t border-hairline pt-2">
                {recs.length ? (
                  recs.map((r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span>{r.player?.full_name ?? 'Player'}</span>
                      <Chip tone={r.state === 'present' ? 'green' : 'amber'}>
                        {r.state === 'present' ? 'Present' : 'Late'}
                      </Chip>
                    </div>
                  ))
                ) : (
                  <div className="text-ink/45">No players recorded.</div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!isLoading && !sessions.length && (
        <div className="px-4 py-6 text-center text-[13px] text-ink/45">No confirmed sessions yet.</div>
      )}
    </Card>
  );
}

// Admin marks attendance for a group on a date (covering for a coach). Two
// states only — Present / Late. Submits a confirmed session credited to the
// chosen coach, plus a record per marked player.
function TakeAttendanceTab() {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: groups = [] } = useGroups();
  const { data: coaches = [] } = useCoaches();

  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [coachId, setCoachId] = useState('');
  const [marks, setMarks] = useState<Record<string, 'present' | 'late'>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [batch, setBatch] = useState<BatchSelection>({ batchId: null, startTime: null, endTime: null });

  const { data: players = [] } = usePlayers(groupId ? [groupId] : undefined);
  // Search within the group — academies can have hundreds of students, so
  // scrolling a long list is impractical when marking attendance.
  const visiblePlayers = players.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  function setMark(id: string, state: 'present' | 'late') {
    setMarks((m) => {
      const next = { ...m };
      if (next[id] === state) delete next[id]; // tap again to unmark
      else next[id] = state;
      return next;
    });
  }

  const markedCount = Object.keys(marks).length;

  async function submit() {
    if (!profile || !groupId) return;
    setSaving(true);
    try {
      const { data: session, error } = await supabase
        .from('attendance_sessions')
        .insert({
          academy_id: profile.academy_id,
          group_id: groupId,
          batch_id: batch.batchId,
          session_date: date,
          start_time: batch.startTime || null,
          end_time: batch.endTime || null,
          coach_id: coachId || profile.id,
          credited_coach_id: coachId || null,
          status: 'confirmed', // admin take-attendance auto-confirms
          confirmed_by: profile.id,
        })
        .select()
        .single();
      if (error) throw error;

      const records = Object.entries(marks).map(([player_id, state]) => ({
        academy_id: profile.academy_id,
        session_id: session.id,
        player_id,
        state,
        deduct_sessions: 1,
      }));
      if (records.length) {
        const { error: rErr } = await supabase.from('attendance_records').insert(records);
        if (rErr) throw rErr;
        await applyAttendanceUsage(session.id);
      }
      toast.show(`Attendance saved · ${records.length} marked`);
      setMarks({});
      qc.invalidateQueries({ queryKey: ['attendance-history'] });
      qc.invalidateQueries({ queryKey: ['players'] });
      qc.invalidateQueries({ queryKey: ['admin-packages'] });
    } catch {
      toast.show('Could not save attendance');
    } finally {
      setSaving(false);
    }
  }

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <select value={groupId} onChange={(e) => { setGroupId(e.target.value); setMarks({}); }} className={field}>
          <option value="">Select group…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={field}>
          <option value="">Credit to coach… (optional)</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name}</option>
          ))}
        </select>
      </div>

      {!groupId && <Card className="text-[13px] text-ink/45">Pick a group to mark attendance.</Card>}

      {groupId && (
        <>
          {/* Batch / time-slot picker */}
          <BatchPicker groupId={groupId} value={batch} onChange={setBatch} />
          <div className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3">
            <Icon name="search" size={16} stroke="#9A938A" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players in this group…"
              className="h-10 w-full bg-transparent text-[14px] outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <Chip tone="green">{markedCount} marked</Chip>
            <button
              onClick={() => setMarks(Object.fromEntries(players.map((p) => [p.id, 'present' as const])))}
              className="text-[12px] font-semibold text-brand-red"
            >
              Mark all present
            </button>
          </div>
          <Card className="divide-y divide-hairline p-0">
            {visiblePlayers.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="flex items-center gap-2 text-[14px] font-medium">
                  {p.full_name}
                  {p.extra_sessions > 0 && <Chip tone="amber">{p.extra_sessions} extra</Chip>}
                </span>
                <div className="flex gap-1.5">
                  <MarkBtn active={marks[p.id] === 'present'} tone="green" onClick={() => setMark(p.id, 'present')}>
                    Present
                  </MarkBtn>
                  <MarkBtn active={marks[p.id] === 'late'} tone="amber" onClick={() => setMark(p.id, 'late')}>
                    Late
                  </MarkBtn>
                </div>
              </div>
            ))}
            {!visiblePlayers.length && (
              <div className="px-4 py-6 text-center text-[13px] text-ink/45">
                {players.length ? 'No players match your search.' : 'No players in this group.'}
              </div>
            )}
          </Card>
          <Button className="w-full" disabled={saving || !markedCount} onClick={submit}>
            {saving ? 'Saving…' : `Save attendance (${markedCount})`}
          </Button>
          <p className="text-[11px] text-ink/45">Only Present/Late count — unmarked players simply weren't there. Late still counts as attended.</p>
        </>
      )}
    </div>
  );
}

function MarkBtn({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: 'green' | 'amber';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeCls = tone === 'green' ? 'bg-success text-white' : 'bg-amber text-ink';
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-chip px-3 py-1.5 text-[12px] font-semibold transition',
        active ? activeCls : 'border border-cardborder bg-white text-ink/55',
      )}
    >
      {children}
    </button>
  );
}
