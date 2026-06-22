import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMatches, useMatchScorecard, useMyGroups, usePlayers } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { parseCricHerosScorecard, type ParsedScorecard } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { ScreenTitle, Card, Chip, Button } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import AddMatchModal from './AddMatchModal';
import VenuePicker from './VenuePicker';
import GroundFeesPanel from '@/features/finance/GroundFeesPanel';

// Match log + per-match scorecard (the coach's accountability/evidence record).
// `mine` scopes to the signed-in coach's matches; Head Coach passes mine=false
// for academy-wide read-only oversight.

function resultTone(result: string | null): 'green' | 'red' | 'neutral' {
  if (!result) return 'neutral';
  const r = result.toLowerCase();
  if (r.includes('won') || r.includes('win')) return 'green';
  if (r.includes('lost') || r.includes('loss')) return 'red';
  return 'neutral';
}

export default function MatchesList({
  eyebrow = 'Coach',
  mine = true,
}: {
  eyebrow?: string;
  mine?: boolean;
}) {
  const { data: matches = [], isLoading } = useMatches(mine);
  const [openId, setOpenId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [view, setView] = useState<'log' | 'payments' | 'grounds'>('log');
  const open = matches.find((m) => m.id === openId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <ScreenTitle eyebrow={eyebrow} title="Matches" />
        {/* Coaches log/import matches; head-coach view is read-only. */}
        {mine && view === 'log' && (
          <Button size="sm" variant="gold" onClick={() => setLogOpen(true)}>
            + Log match
          </Button>
        )}
      </div>

      {/* Coaches coordinate matches, so they collect/confirm fees too. */}
      {mine && (
        <div className="flex gap-2">
          {(['log', 'payments', 'grounds'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                'rounded-chip px-3 py-1.5 text-[12px] font-semibold capitalize transition ' +
                (view === v ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')
              }
            >
              {v === 'log' ? 'Match Log' : v === 'payments' ? 'Match Payments' : 'Grounds'}
            </button>
          ))}
        </div>
      )}

      {mine && view === 'payments' && <CoachMatchPayments />}
      {mine && view === 'grounds' && <GroundFeesPanel />}

      {!(mine && (view === 'payments' || view === 'grounds')) && (
      <>
      {isLoading && <div className="text-[13px] text-ink/45">Loading matches…</div>}
      {!isLoading && !matches.length && (
        <Card className="text-[13px] text-ink/45">No matches logged yet.</Card>
      )}

      <div className="space-y-3">
        {matches.map((m) => (
          <Card
            key={m.id}
            className="cursor-pointer"
            onClick={() => setOpenId(m.id)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold">vs {m.opponent ?? 'Opponent'}</div>
                <div className="text-[12px] text-ink/45">
                  {new Date(m.match_date).toLocaleDateString('en-AE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {m.team_score ? ` · ${m.team_score}` : ''}
                </div>
              </div>
              {m.result && <Chip tone={resultTone(m.result)}>{m.result}</Chip>}
            </div>
            {m.pom && (
              <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-3">
                <RingAvatar name={m.pom.full_name} size={28} color="#C9A84C" />
                <span className="text-[12px] text-ink/60">
                  Player of the match · <span className="font-semibold text-ink">{m.pom.full_name}</span>
                </span>
              </div>
            )}
          </Card>
        ))}
      </div>

      </>
      )}

      <ScorecardModal match={open} editable={mine} onClose={() => setOpenId(null)} />
      {mine && <LogMatchModal open={logOpen} onClose={() => setLogOpen(false)} />}
    </div>
  );
}

function ScorecardModal({
  match,
  editable = false,
  onClose,
}: {
  match: { id: string; opponent: string | null } | null;
  editable?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: rows = [] } = useMatchScorecard(match?.id ?? null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Save the coach "why" note — the accountability/evidence record.
  async function saveNote(rowId: string) {
    setSavingId(rowId);
    const { error } = await supabase
      .from('match_players')
      .update({ coach_why_note: notes[rowId] ?? '' })
      .eq('id', rowId);
    setSavingId(null);
    if (error) return toast.show('Could not save note');
    toast.show('Note saved');
    qc.invalidateQueries({ queryKey: ['scorecard', match?.id] });
  }

  return (
    <Modal open={!!match} onClose={onClose} title={match ? `vs ${match.opponent ?? 'Opponent'}` : ''}>
      <div className="space-y-3">
        {!rows.length && <div className="text-[13px] text-ink/45">No scorecard entries.</div>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-card border border-cardborder bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RingAvatar name={r.player.full_name} size={32} />
                <div>
                  <div className="text-[14px] font-semibold">{r.player.full_name}</div>
                  {r.batting_position != null && (
                    <div className="text-[11px] text-ink/45">Batting #{r.batting_position}</div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-xl leading-none">
                  {r.runs ?? 0}
                  <span className="text-[12px] text-ink/45"> ({r.balls ?? 0})</span>
                </div>
                <div className="text-[11px] text-ink/45">
                  {r.how_out ?? '—'}
                  {r.wickets ? ` · ${r.wickets} wkt` : ''}
                </div>
              </div>
            </div>
            {/* The coach "why" note — read-only for oversight, editable for the
                owning coach (e.g. "moved to 4 to face spin"). */}
            {editable ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  defaultValue={r.coach_why_note ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  placeholder="Why note (e.g. moved to 4 to face spin)"
                  className="h-9 flex-1 rounded-chip border border-cardborder bg-white px-3 text-[12px] outline-none focus:border-gold"
                />
                <button
                  onClick={() => saveNote(r.id)}
                  disabled={savingId === r.id || notes[r.id] === undefined}
                  className="rounded-chip border border-cardborder px-2 py-1 text-[11px] font-semibold text-brand-red disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            ) : (
              r.coach_why_note && (
                <div className="mt-2 rounded-chip bg-chip-gold px-3 py-2 text-[12px] text-gold-dark">
                  <span className="font-semibold">Coach's note: </span>
                  {r.coach_why_note}
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// Coach match-payments — the coach coordinates the match, so collects/confirms
// fees. Coaches can update their own match_fees (RLS), but not the academy-wide
// payments ledger; admin's confirmation writes that.
function CoachMatchPayments() {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const { data: fees = [], isLoading } = useQuery({
    queryKey: ['coach-match-fees', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_fees')
        .select('*, player:players(*), match:matches(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (import('@/lib/types').MatchFee & {
        player: { full_name: string } | null;
        match: { opponent: string | null } | null;
      })[];
    },
  });

  async function collect(id: string, mode: 'bank' | 'cash') {
    if (!profile) return;
    const { error } = await supabase
      .from('match_fees')
      .update({ state: 'confirmed', mode, confirmed_by: profile.id })
      .eq('id', id);
    if (error) return toast.show('Could not update');
    toast.show(mode === 'bank' ? 'Bank confirmed' : 'Cash collected');
    qc.invalidateQueries({ queryKey: ['coach-match-fees'] });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="gold" onClick={() => setAddOpen(true)}>
          + Add match
        </Button>
      </div>
      <AddMatchModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        coachScoped
        onSaved={() => qc.invalidateQueries({ queryKey: ['coach-match-fees'] })}
      />
    <Card className="divide-y divide-hairline p-0">
      {isLoading && <div className="px-4 py-4 text-[13px] text-ink/45">Loading…</div>}
      {fees.map((f) => (
        <div key={f.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
          <div>
            <div className="font-medium">{f.player?.full_name ?? 'Player'}</div>
            <div className="text-[11px] text-ink/45">vs {f.match?.opponent ?? '—'}</div>
          </div>
          <div className="flex items-center gap-2">
            {f.state === 'confirmed' ? (
              <Chip tone="green">{f.mode === 'cash' ? 'Cash' : 'Bank'} ✓</Chip>
            ) : (
              <>
                <button onClick={() => collect(f.id, 'bank')} className="rounded-chip border border-cardborder px-2 py-1 text-[11px] font-semibold text-info">Confirm bank</button>
                <button onClick={() => collect(f.id, 'cash')} className="rounded-chip border border-cardborder px-2 py-1 text-[11px] font-semibold text-success">Collect cash</button>
              </>
            )}
          </div>
        </div>
      ))}
      {!isLoading && !fees.length && (
        <div className="px-4 py-6 text-center text-[13px] text-ink/45">No match fees for your matches yet.</div>
      )}
    </Card>
    </div>
  );
}

// Log a match — CricHeros import (AI scorecard reading, placeholder for now) or
// manual entry. Both paths save real data to matches + match_players.
type LogStep = 'choose' | 'reading' | 'verify' | 'manual';

function LogMatchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: groups = [] } = useMyGroups();
  const groupIds = groups.map((g) => g.id);
  const { data: roster = [] } = usePlayers(groupIds.length ? groupIds : undefined);

  const [step, setStep] = useState<LogStep>('choose');
  const [parsed, setParsed] = useState<ParsedScorecard | null>(null);
  const [opponent, setOpponent] = useState('');
  const [matchDate, setMatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState('Won');
  const [teamScore, setTeamScore] = useState('');
  const [matchFee, setMatchFee] = useState('');
  const [venueId, setVenueId] = useState(''); // ground the match was played at
  const [groundFee, setGroundFee] = useState(''); // ground booking cost (AED)
  const [saving, setSaving] = useState(false);
  // Manual entry: which group, who played (the squad), and a name search so a
  // coach with a big roster can find players fast.
  const [manualGroup, setManualGroup] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [squadSearch, setSquadSearch] = useState('');

  const manualGroupId = manualGroup || groups[0]?.id || '';
  const squad = roster.filter(
    (p) =>
      (!manualGroupId || p.group_id === manualGroupId) &&
      p.full_name.toLowerCase().includes(squadSearch.toLowerCase()),
  );
  function togglePicked(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function close() {
    setStep('choose');
    setParsed(null);
    setOpponent('');
    setResult('Won');
    setTeamScore('');
    setMatchFee('');
    setVenueId('');
    setGroundFee('');
    setManualGroup('');
    setPicked(new Set());
    setSquadSearch('');
    onClose();
  }

  async function importFromCricHeros() {
    setStep('reading');
    const sc = await parseCricHerosScorecard(roster);
    setParsed(sc);
    setOpponent(sc.opponent);
    setResult(sc.result);
    setTeamScore(sc.teamScore);
    setStep('verify');
  }

  // Insert the match, then its per-player scorecard rows (mapped back to real
  // player ids by name), then set player-of-match.
  async function save(withScorecard: boolean) {
    if (!profile) return;
    setSaving(true);
    try {
      const byName = new Map(roster.map((p) => [p.full_name, p]));
      const pom = parsed?.playerOfMatchName ? byName.get(parsed.playerOfMatchName) : undefined;
      const { data: match, error } = await supabase
        .from('matches')
        .insert({
          academy_id: profile.academy_id,
          group_id: (withScorecard ? groupIds[0] : manualGroupId) || null,
          coach_id: profile.id,
          center_id: venueId || null,
          match_date: matchDate,
          opponent: opponent.trim() || 'Opponent',
          team_score: teamScore.trim() || null,
          result,
          player_of_match: pom?.id ?? null,
          source: withScorecard ? 'cricheros' : 'manual',
          season: String(new Date(matchDate).getFullYear()),
        })
        .select()
        .single();
      if (error) throw error;

      // Venue + ground fee → auto-create a ground booking against that centre so
      // its payment can be tracked (Payments → Ground Fees / Finance).
      const ground = Number(groundFee);
      if (venueId && ground > 0) {
        const { error: gErr } = await supabase.from('ground_fees').insert({
          academy_id: profile.academy_id,
          center_id: venueId,
          booking_date: matchDate,
          amount: ground,
          status: 'pending',
        });
        if (gErr) throw gErr;
      }

      // Manual entry: record the squad who played, and (if a fee was entered)
      // create a match fee per player so they show up in Match Payments for the
      // coach to mark Bank / Cash.
      if (!withScorecard) {
        const ids = [...picked];
        if (ids.length) {
          const mpRows = ids.map((player_id) => ({
            academy_id: profile.academy_id,
            match_id: match.id,
            player_id,
          }));
          const { error: mpErr } = await supabase.from('match_players').insert(mpRows);
          if (mpErr) throw mpErr;

          const fee = Number(matchFee);
          if (fee > 0) {
            const feeRows = ids.map((player_id) => ({
              academy_id: profile.academy_id,
              match_id: match.id,
              player_id,
              fee,
              state: 'awaiting' as const,
            }));
            const { error: fErr } = await supabase.from('match_fees').insert(feeRows);
            if (fErr) throw fErr;
          }
        }
      }

      if (withScorecard && parsed) {
        const rows = parsed.players
          .map((row) => {
            const p = byName.get(row.full_name);
            if (!p) return null;
            return {
              academy_id: profile.academy_id,
              match_id: match.id,
              player_id: p.id,
              batting_position: row.batting_position,
              runs: row.runs,
              balls: row.balls,
              how_out: row.how_out,
              wickets: row.wickets,
            };
          })
          .filter(Boolean);
        if (rows.length) {
          const { error: rErr } = await supabase.from('match_players').insert(rows as object[]);
          if (rErr) throw rErr;
        }

        // Optional: create a per-player match fee (awaiting collection). Admin
        // (and the coach) can then Confirm bank / Collect cash on these.
        const fee = Number(matchFee);
        if (fee > 0) {
          const feeRows = parsed.players
            .map((row) => {
              const p = byName.get(row.full_name);
              if (!p) return null;
              return {
                academy_id: profile.academy_id,
                match_id: match.id,
                player_id: p.id,
                fee,
                state: 'awaiting' as const,
              };
            })
            .filter(Boolean);
          if (feeRows.length) {
            const { error: fErr } = await supabase.from('match_fees').insert(feeRows as object[]);
            if (fErr) throw fErr;
          }
        }
      }
      toast.show('Match logged');
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['coach-match-fees'] });
      qc.invalidateQueries({ queryKey: ['admin-match-fees'] });
      qc.invalidateQueries({ queryKey: ['ground-fees'] });
      close();
    } catch {
      toast.show('Could not save match');
    } finally {
      setSaving(false);
    }
  }

  const field =
    'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <Modal open={open} onClose={close} title="Log a Match">
      {step === 'choose' && (
        <div className="space-y-3">
          <button
            onClick={importFromCricHeros}
            className="w-full rounded-card bg-gradient-to-b from-gold-light to-gold-dark p-4 text-left text-ink"
          >
            <div className="text-[15px] font-semibold">Import from CricHeros</div>
            <div className="text-[12px] text-ink/70">AI reads the scorecard and pre-fills everything.</div>
          </button>
          <button
            onClick={() => setStep('manual')}
            className="w-full rounded-card border border-cardborder bg-white p-4 text-left"
          >
            <div className="text-[15px] font-semibold">Log manually</div>
            <div className="text-[12px] text-ink/45">Enter the result, pick who played, and set the match fee.</div>
          </button>
        </div>
      )}

      {step === 'reading' && (
        <div className="flex h-56 flex-col items-center justify-center gap-4">
          <LoopRing size={64} className="animate-spin" />
          <div className="text-[13px] text-ink/55">AI reading scorecard…</div>
        </div>
      )}

      {(step === 'verify' || step === 'manual') && (
        <div className="space-y-3">
          {step === 'verify' && (
            <div className="rounded-chip bg-chip-gold px-3 py-2 text-[12px] text-gold-dark">
              Imported — please verify the details below before saving.
            </div>
          )}
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

          {/* Venue + ground booking cost (auto-creates a ground booking) */}
          <VenuePicker value={venueId} onChange={setVenueId} enabled={open} />
          <input
            type="number"
            value={groundFee}
            onChange={(e) => setGroundFee(e.target.value)}
            placeholder="Ground fee (AED)"
            className={field}
          />

          <input
            type="number"
            value={matchFee}
            onChange={(e) => setMatchFee(e.target.value)}
            placeholder="Match fee per player (AED, optional)"
            className={field}
          />

          {/* Manual: choose the group + search and tick who played. Each picked
              player gets a fee row in Match Payments. */}
          {step === 'manual' && (
            <div className="space-y-2">
              {groups.length > 1 && (
                <select
                  value={manualGroupId}
                  onChange={(e) => { setManualGroup(e.target.value); setPicked(new Set()); }}
                  className={field}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3">
                <Icon name="search" size={16} stroke="#9A938A" />
                <input
                  value={squadSearch}
                  onChange={(e) => setSquadSearch(e.target.value)}
                  placeholder="Search players…"
                  className="h-10 w-full bg-transparent text-[14px] outline-none"
                />
              </div>
              <div className="rounded-card border border-cardborder">
                <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">
                    Who played ({picked.size} selected)
                  </span>
                  <button
                    onClick={() => setPicked(new Set(squad.map((p) => p.id)))}
                    className="text-[12px] font-semibold text-brand-red"
                  >
                    Select all
                  </button>
                </div>
                <div className="max-h-52 divide-y divide-hairline overflow-auto">
                  {squad.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center justify-between px-3 py-2 text-[13px]">
                      <span>{p.full_name}</span>
                      <input type="checkbox" checked={picked.has(p.id)} onChange={() => togglePicked(p.id)} />
                    </label>
                  ))}
                  {!squad.length && (
                    <div className="px-3 py-4 text-center text-[12px] text-ink/45">
                      {roster.length ? 'No players match.' : 'No players in your groups.'}
                    </div>
                  )}
                </div>
              </div>
              {Number(matchFee) > 0 && picked.size > 0 && (
                <Chip tone="green">Total fees: AED {Number(matchFee) * picked.size}</Chip>
              )}
            </div>
          )}

          {step === 'verify' && parsed && (
            <div className="rounded-card border border-cardborder">
              <div className="border-b border-hairline px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">
                Scorecard ({parsed.players.length})
              </div>
              <div className="max-h-48 divide-y divide-hairline overflow-auto">
                {parsed.players.map((r) => (
                  <div key={r.full_name} className="flex items-center justify-between px-3 py-1.5 text-[12.5px]">
                    <span className="font-medium">{r.full_name}</span>
                    <span className="text-ink/55">
                      {r.runs} ({r.balls}) · {r.how_out}
                      {r.wickets ? ` · ${r.wickets}w` : ''}
                    </span>
                  </div>
                ))}
              </div>
              {parsed.playerOfMatchName && (
                <div className="border-t border-hairline px-3 py-2 text-[12px]">
                  Player of the match: <span className="font-semibold">{parsed.playerOfMatchName}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep('choose')}>
              Back
            </Button>
            <Button className="flex-1" disabled={saving} onClick={() => save(step === 'verify')}>
              {saving ? 'Saving…' : 'Save match'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
