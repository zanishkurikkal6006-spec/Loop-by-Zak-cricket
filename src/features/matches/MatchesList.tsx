import { useState } from 'react';
import { useMatches, useMatchScorecard } from '@/lib/queries';
import { ScreenTitle, Card, Chip } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { RingAvatar } from '@/components/brand/LoopRing';

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
  const open = matches.find((m) => m.id === openId) ?? null;

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow={eyebrow} title="Matches" />

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
