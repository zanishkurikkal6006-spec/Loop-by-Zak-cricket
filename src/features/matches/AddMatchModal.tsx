import { useState } from 'react';
import { useGroups, useMyGroups, usePlayers } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { Button, Chip } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';

// Create a match and (optionally) per-player match fees in one step. Shared by
// the coach Match Payments view and the admin Match Fees tab — both need a way
// to ADD matches, not just confirm existing fees.
//
// `coachScoped` limits the group picker to the signed-in coach's groups and
// credits the match to them. Admin sees every group and leaves coach_id null.
export default function AddMatchModal({
  open,
  onClose,
  onSaved,
  coachScoped = false,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  coachScoped?: boolean;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const adminGroups = useGroups();
  const coachGroups = useMyGroups();
  const groups = (coachScoped ? coachGroups.data : adminGroups.data) ?? [];

  const [groupId, setGroupId] = useState('');
  const [opponent, setOpponent] = useState('');
  const [matchDate, setMatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState('Won');
  const [teamScore, setTeamScore] = useState('');
  const [fee, setFee] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: players = [] } = usePlayers(groupId ? [groupId] : undefined);

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setGroupId('');
    setOpponent('');
    setResult('Won');
    setTeamScore('');
    setFee('');
    setPicked(new Set());
  }

  function close() {
    reset();
    onClose();
  }

  async function save() {
    if (!profile) return;
    if (!groupId) return toast.show('Pick a group');
    if (!picked.size) return toast.show('Select at least one player');
    setSaving(true);
    try {
      const { data: match, error } = await supabase
        .from('matches')
        .insert({
          academy_id: profile.academy_id,
          group_id: groupId,
          coach_id: coachScoped ? profile.id : null,
          match_date: matchDate,
          opponent: opponent.trim() || 'Opponent',
          team_score: teamScore.trim() || null,
          result,
          source: 'manual',
          season: String(new Date(matchDate).getFullYear()),
        })
        .select()
        .single();
      if (error) throw error;

      const feeNum = Number(fee);
      if (feeNum > 0) {
        const rows = [...picked].map((player_id) => ({
          academy_id: profile.academy_id,
          match_id: match.id,
          player_id,
          fee: feeNum,
          state: 'awaiting' as const,
        }));
        const { error: fErr } = await supabase.from('match_fees').insert(rows);
        if (fErr) throw fErr;
      }
      toast.show(feeNum > 0 ? `Match added · ${picked.size} fee${picked.size === 1 ? '' : 's'} created` : 'Match added');
      onSaved?.();
      close();
    } catch {
      toast.show('Could not add match');
    } finally {
      setSaving(false);
    }
  }

  const field =
    'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <Modal open={open} onClose={close} title="Add Match">
      <div className="space-y-3">
        <select value={groupId} onChange={(e) => { setGroupId(e.target.value); setPicked(new Set()); }} className={field}>
          <option value="">Select group…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Opponent" className={field} />
          <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} className={field} />
          <select value={result} onChange={(e) => setResult(e.target.value)} className={field}>
            <option>Won</option>
            <option>Lost</option>
            <option>Tied</option>
            <option>No result</option>
          </select>
          <input value={teamScore} onChange={(e) => setTeamScore(e.target.value)} placeholder="Team score e.g. 142/6" className={field} />
        </div>
        <input
          type="number"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          placeholder="Match fee per player (AED, optional)"
          className={field}
        />

        {groupId && (
          <div className="rounded-card border border-cardborder">
            <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">
                Squad ({picked.size} selected)
              </span>
              <button
                onClick={() => setPicked(new Set(players.map((p) => p.id)))}
                className="text-[12px] font-semibold text-brand-red"
              >
                Select all
              </button>
            </div>
            <div className="max-h-56 divide-y divide-hairline overflow-auto">
              {players.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center justify-between px-3 py-2 text-[13px]">
                  <span>{p.full_name}</span>
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                </label>
              ))}
              {!players.length && (
                <div className="px-3 py-4 text-center text-[12px] text-ink/45">No players in this group.</div>
              )}
            </div>
          </div>
        )}

        {Number(fee) > 0 && picked.size > 0 && (
          <Chip tone="green">Total fees: AED {Number(fee) * picked.size}</Chip>
        )}

        <Button className="w-full" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Add match'}
        </Button>
      </div>
    </Modal>
  );
}
