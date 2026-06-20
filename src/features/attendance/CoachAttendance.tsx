import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMyGroups, usePlayers } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { RingAvatar } from '@/components/brand/LoopRing';
import { Icon } from '@/components/ui/Icon';
import { Button, Chip, ScreenTitle } from '@/components/ui';
import { clsx } from '@/lib/utils';
import type { AttendanceState, Player } from '@/lib/types';

// The USP — the fastest screen. Two states only: Present / Late. There is NO
// Absent: you simply don't mark kids who aren't there. A re-confirmation list
// gates the final Submit to Admin.

type Marks = Record<string, AttendanceState | undefined>;

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function dateLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === -1) return 'Yesterday';
  return new Date(isoDate(offset)).toLocaleDateString('en-AE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function CoachAttendance() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: groups = [] } = useMyGroups();

  const [dayOffset, setDayOffset] = useState(0);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [marks, setMarks] = useState<Marks>({});
  const [confirming, setConfirming] = useState(false);

  const activeGroup = groupId ?? groups[0]?.id ?? null;
  const { data: players = [] } = usePlayers(activeGroup ? [activeGroup] : undefined);

  const filtered = useMemo(
    () => players.filter((p) => p.full_name.toLowerCase().includes(search.toLowerCase())),
    [players, search],
  );

  const presentCount = Object.values(marks).filter((m) => m === 'present').length;
  const lateCount = Object.values(marks).filter((m) => m === 'late').length;
  const markedCount = presentCount + lateCount;

  function setMark(playerId: string, state: AttendanceState) {
    setMarks((m) => ({ ...m, [playerId]: m[playerId] === state ? undefined : state }));
  }

  function markAllPresent() {
    const next: Marks = { ...marks };
    for (const p of filtered) if (!next[p.id]) next[p.id] = 'present';
    setMarks(next);
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile || !activeGroup) throw new Error('No group selected');
      const marked = Object.entries(marks).filter(([, s]) => s) as [string, AttendanceState][];
      if (!marked.length) throw new Error('Mark at least one player');

      // 1) Create the session (pending admin confirmation).
      const { data: session, error: sErr } = await supabase
        .from('attendance_sessions')
        .insert({
          academy_id: profile.academy_id,
          group_id: activeGroup,
          session_date: isoDate(dayOffset),
          coach_id: profile.id,
          status: 'pending',
        })
        .select()
        .single();
      if (sErr) throw sErr;

      // 2) Insert one record per marked player. Sessions deduct for present AND late.
      const records = marked.map(([player_id, state]) => ({
        academy_id: profile.academy_id,
        session_id: session.id,
        player_id,
        state,
        deduct_sessions: 1,
      }));
      const { error: rErr } = await supabase.from('attendance_records').insert(records);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      toast.show('Submitted to Admin · parents will be notified');
      setMarks({});
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ['attendance-pending'] });
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not submit'),
  });

  const markedPlayers = filtered.filter((p) => marks[p.id]);

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Coach" title="Attendance" />

      {/* Date stepper — can't go into the future */}
      <div className="flex items-center justify-between rounded-card border border-cardborder bg-white p-2">
        <button
          onClick={() => setDayOffset((d) => d - 1)}
          className="flex h-10 w-10 items-center justify-center rounded-pill hover:bg-hairline"
          aria-label="Previous day"
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <div className="text-center">
          <div className="font-display text-2xl leading-none">{dateLabel(dayOffset)}</div>
          <div className="text-[11px] text-ink/45">{isoDate(dayOffset)}</div>
        </div>
        <button
          onClick={() => setDayOffset((d) => Math.min(0, d + 1))}
          disabled={dayOffset >= 0}
          className="flex h-10 w-10 items-center justify-center rounded-pill hover:bg-hairline disabled:opacity-30"
          aria-label="Next day"
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      {/* Batch / group chips — the coach's own groups only */}
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setGroupId(g.id);
              setMarks({});
            }}
            className={clsx(
              'rounded-pill border px-4 py-2 text-[12px] font-semibold transition',
              activeGroup === g.id
                ? 'border-brand-red bg-brand-red text-paper'
                : 'border-cardborder bg-white text-ink/70',
            )}
          >
            {g.name}
          </button>
        ))}
        {!groups.length && (
          <div className="text-[13px] text-ink/45">No groups assigned to you yet.</div>
        )}
      </div>

      {/* Live counts */}
      <div className="flex gap-2">
        <Chip tone="green">{presentCount} Present</Chip>
        <Chip tone="amber">{lateCount} Late</Chip>
        <Chip tone="neutral">Late counts as attended</Chip>
      </div>

      {/* Search + mark all */}
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-pill border border-cardborder bg-white px-3">
          <Icon name="search" size={16} stroke="#9A938A" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            className="h-10 w-full bg-transparent text-[14px] outline-none"
          />
        </div>
        <Button variant="ghost" size="md" onClick={markAllPresent}>
          Mark all present
        </Button>
      </div>

      {/* Player list */}
      {!confirming ? (
        <div className="space-y-2">
          {filtered.map((p) => (
            <PlayerRow key={p.id} player={p} state={marks[p.id]} onMark={(s) => setMark(p.id, s)} />
          ))}
          {!filtered.length && (
            <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">
              No players in this group.
            </div>
          )}
        </div>
      ) : (
        /* Re-confirmation list before final submit */
        <div className="space-y-2">
          <div className="eyebrow">Re-confirm before submitting</div>
          {markedPlayers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-card border border-cardborder bg-white p-3"
            >
              <div className="flex items-center gap-3">
                <RingAvatar name={p.full_name} size={36} />
                <span className="text-[14px] font-medium">{p.full_name}</span>
              </div>
              <Chip tone={marks[p.id] === 'present' ? 'green' : 'amber'}>
                {marks[p.id] === 'present' ? 'Present' : 'Late'}
              </Chip>
            </div>
          ))}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-20 flex gap-2 md:bottom-4">
        {!confirming ? (
          <Button
            className="flex-1"
            disabled={markedCount === 0}
            onClick={() => setConfirming(true)}
          >
            Review {markedCount} player{markedCount === 1 ? '' : 's'}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? 'Submitting…' : 'Submit to Admin'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  state,
  onMark,
}: {
  player: Player;
  state: AttendanceState | undefined;
  onMark: (s: AttendanceState) => void;
}) {
  const edge =
    state === 'present' ? 'border-l-success' : state === 'late' ? 'border-l-amber' : 'border-l-transparent';
  return (
    <div
      className={clsx(
        'flex items-center justify-between rounded-card border border-cardborder border-l-4 bg-white p-3 transition',
        edge,
      )}
    >
      <div className="flex items-center gap-3">
        <RingAvatar name={player.full_name} size={40} color={state === 'late' ? '#C9A84C' : '#1F8A4C'} />
        <div>
          <div className="text-[14px] font-medium">{player.full_name}</div>
          {player.age && <div className="text-[11px] text-ink/45">Age {player.age}</div>}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onMark('present')}
          className={clsx(
            'h-9 rounded-pill px-4 text-[12px] font-semibold transition',
            state === 'present' ? 'bg-success text-white' : 'bg-chip-green text-success',
          )}
        >
          P
        </button>
        <button
          onClick={() => onMark('late')}
          className={clsx(
            'h-9 rounded-pill px-4 text-[12px] font-semibold transition',
            state === 'late' ? 'bg-amber text-white' : 'bg-chip-amber text-amber-text',
          )}
        >
          L
        </button>
      </div>
    </div>
  );
}
