import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { Button, Chip } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { downloadPlayerRecord } from '@/lib/playerRecordPdf';
import type { MatchPlayer } from '@/lib/types';

type Row = MatchPlayer & { match: { opponent: string | null; match_date: string } | null };

// Full per-player record across matches (batting + bowling + fielding), with a
// shareable branded PDF — what a coach sends a parent after a run of games.
export default function PlayerStatsModal({
  player,
  groupName,
  onClose,
}: {
  player: { id: string; full_name: string } | null;
  groupName?: string | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['player-stats', player?.id],
    enabled: !!profile && !!player,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('match_players')
        .select('*, match:matches(opponent, match_date)')
        .eq('player_id', player!.id);
      if (error) throw error;
      const list = (data ?? []) as Row[];
      return list.sort((a, b) => (b.match?.match_date ?? '').localeCompare(a.match?.match_date ?? ''));
    },
  });

  const batted = (r: Row) => (r.balls ?? 0) > 0 || (r.runs ?? 0) > 0 || !!r.how_out;
  const runs = rows.reduce((s, r) => s + (r.runs ?? 0), 0);
  const balls = rows.reduce((s, r) => s + (r.balls ?? 0), 0);
  const wickets = rows.reduce((s, r) => s + (r.wickets ?? 0), 0);
  const catches = rows.reduce((s, r) => s + (r.catches ?? 0), 0);
  const runOuts = rows.reduce((s, r) => s + (r.run_outs ?? 0), 0);
  const innings = rows.filter(batted).length;
  const dismissals = rows.filter((r) => r.how_out && r.how_out.toLowerCase() !== 'not out').length;
  const hs = rows.reduce((m, r) => Math.max(m, r.runs ?? 0), 0);
  const avg = dismissals ? runs / dismissals : runs;
  const sr = balls ? (runs / balls) * 100 : 0;

  const summary = [
    { label: 'Matches', value: rows.length },
    { label: 'Innings', value: innings },
    { label: 'Runs', value: runs },
    { label: 'High score', value: hs },
    { label: 'Average', value: avg.toFixed(1) },
    { label: 'Strike rate', value: sr.toFixed(0) },
    { label: 'Wickets', value: wickets },
    { label: 'Catch / RO', value: `${catches}/${runOuts}` },
  ];

  function pdf() {
    if (!player) return;
    downloadPlayerRecord({
      childName: player.full_name,
      groupName,
      academyName: 'Loop by Zak Cricket',
      summary,
      matches: rows.map((r) => ({
        opponent: r.match?.opponent ?? 'Opponent',
        date: r.match?.match_date ?? '',
        position: r.batting_position,
        runs: r.runs ?? 0,
        balls: r.balls ?? 0,
        howOut: r.how_out ?? '',
        wickets: r.wickets ?? 0,
        catches: r.catches ?? 0,
        runOuts: r.run_outs ?? 0,
      })),
    });
  }

  const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' }) : '');

  return (
    <Modal open={!!player} onClose={onClose} title={player?.full_name ?? ''}>
      <div className="space-y-3">
        {isLoading && <div className="text-[13px] text-ink/45">Loading…</div>}
        {!isLoading && !rows.length && (
          <div className="text-[13px] text-ink/45">No match data for this player yet.</div>
        )}

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {summary.map((s) => (
                <div key={s.label} className="rounded-card border border-cardborder bg-white p-2 text-center">
                  <div className="font-display text-lg leading-none text-brand-red">{s.value}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-eyebrow text-ink/40">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="rounded-card border border-cardborder">
              <div className="border-b border-hairline px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">
                Match by match
              </div>
              <div className="max-h-64 divide-y divide-hairline overflow-auto">
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 text-[12.5px]">
                    <div>
                      <div className="font-medium">vs {r.match?.opponent ?? 'Opponent'}</div>
                      <div className="text-[10.5px] text-ink/45">{fmt(r.match?.match_date)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Chip tone="neutral">{r.runs ?? 0} ({r.balls ?? 0})</Chip>
                      {(r.wickets ?? 0) > 0 && <Chip tone="green">{r.wickets}w</Chip>}
                      {((r.catches ?? 0) + (r.run_outs ?? 0)) > 0 && (
                        <Chip tone="gold">{r.catches ?? 0}c {r.run_outs ?? 0}ro</Chip>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={pdf}>
              <Icon name="download" size={15} /> Download &amp; share record
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
