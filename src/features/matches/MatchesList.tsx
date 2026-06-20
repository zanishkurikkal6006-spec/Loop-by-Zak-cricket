import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMatches, useMatchScorecard, useMyGroups, usePlayers } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { parseCricHerosScorecard, type ParsedScorecard } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { ScreenTitle, Card, Chip, Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';

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
  const open = matches.find((m) => m.id === openId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <ScreenTitle eyebrow={eyebrow} title="Matches" />
        {/* Coaches log/import matches; head-coach view is read-only. */}
        {mine && (
          <Button size="sm" variant="gold" onClick={() => setLogOpen(true)}>
            + Log match
          </Button>
        )}
      </div>

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

      <ScorecardModal match={open} onClose={() => setOpenId(null)} />
      {mine && <LogMatchModal open={logOpen} onClose={() => setLogOpen(false)} />}
    </div>
  );
}

function ScorecardModal({
  match,
  onClose,
}: {
  match: { id: string; opponent: string | null } | null;
  onClose: () => void;
}) {
  const { data: rows = [] } = useMatchScorecard(match?.id ?? null);
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
            {/* The coach "why" note — the accountability/evidence record. */}
            {r.coach_why_note && (
              <div className="mt-2 rounded-chip bg-chip-gold px-3 py-2 text-[12px] text-gold-dark">
                <span className="font-semibold">Coach's note: </span>
                {r.coach_why_note}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
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
  const [saving, setSaving] = useState(false);

  function close() {
    setStep('choose');
    setParsed(null);
    setOpponent('');
    setResult('Won');
    setTeamScore('');
    setMatchFee('');
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
          group_id: groupIds[0] ?? null,
          coach_id: profile.id,
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
            <div className="text-[12px] text-ink/45">Enter the result and team score yourself.</div>
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

          {step === 'verify' && (
            <input
              type="number"
              value={matchFee}
              onChange={(e) => setMatchFee(e.target.value)}
              placeholder="Match fee per player (AED, optional)"
              className={field}
            />
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
