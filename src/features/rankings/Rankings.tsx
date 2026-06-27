import { useState } from 'react';
import { useRankings, useGroups, type RankingStat } from '@/lib/queries';
import { ScreenTitle, Card, Chip } from '@/components/ui';
import { RingAvatar } from '@/components/brand/LoopRing';
import { clsx } from '@/lib/utils';
import PlayerStatsModal from './PlayerStatsModal';
import type { Player } from '@/lib/types';

// Leaderboard with Group · Stat filters, re-sorting live. Shared by Coach and
// Head Coach (read-only — same data, the view just differs by route/eyebrow).

const STATS: { key: RankingStat; label: string }[] = [
  { key: 'runs', label: 'Runs' },
  { key: 'avg', label: 'Batting Avg' },
  { key: 'wickets', label: 'Wickets' },
  { key: 'sr', label: 'Strike Rate' },
];

const PODIUM_COLORS = ['#C9A84C', '#A8A8A8', '#B5763A']; // gold / silver / bronze

function statValue(stat: RankingStat, r: { runs: number; avg: number; wickets: number; sr: number }) {
  switch (stat) {
    case 'runs':
      return String(r.runs);
    case 'avg':
      return r.avg.toFixed(1);
    case 'wickets':
      return String(r.wickets);
    case 'sr':
      return r.sr.toFixed(0);
  }
}

export default function Rankings({ eyebrow = 'Coach' }: { eyebrow?: string }) {
  const [stat, setStat] = useState<RankingStat>('runs');
  const [groupId, setGroupId] = useState<string | undefined>();
  const [selected, setSelected] = useState<Player | null>(null);
  const { data: groups = [] } = useGroups();
  const { data: rows = [], isLoading } = useRankings(stat, groupId);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const groupName = (gid: string | null) => groups.find((g) => g.id === gid)?.name ?? null;

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow={eyebrow} title="Rankings" />

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={!groupId} onClick={() => setGroupId(undefined)}>
            All groups
          </FilterChip>
          {groups.map((g) => (
            <FilterChip key={g.id} active={groupId === g.id} onClick={() => setGroupId(g.id)}>
              {g.name}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATS.map((s) => (
            <FilterChip key={s.key} active={stat === s.key} onClick={() => setStat(s.key)}>
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {isLoading && <div className="text-[13px] text-ink/45">Loading leaderboard…</div>}
      {!isLoading && !rows.length && (
        <Card className="text-[13px] text-ink/45">No match data yet for this filter.</Card>
      )}

      {/* Podium (top 3) */}
      {podium.length > 0 && (
        <div className="flex items-end justify-center gap-4">
          {podium.map((r, i) => (
            <button key={r.player.id} onClick={() => setSelected(r.player)} className="flex flex-col items-center">
              <RingAvatar name={r.player.full_name} size={i === 0 ? 72 : 56} color={PODIUM_COLORS[i]} />
              <div className="mt-2 max-w-[88px] truncate text-center text-[13px] font-semibold">
                {r.player.full_name}
              </div>
              <div className="font-display text-2xl leading-none" style={{ color: PODIUM_COLORS[i] }}>
                {statValue(stat, r)}
              </div>
              <Chip tone={i === 0 ? 'gold' : 'neutral'} className="mt-1">
                #{i + 1}
              </Chip>
            </button>
          ))}
        </div>
      )}

      {/* Ranked list */}
      {rest.length > 0 && (
        <Card className="divide-y divide-hairline p-0">
          {rest.map((r, i) => (
            <button
              key={r.player.id}
              onClick={() => setSelected(r.player)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hairline/40"
            >
              <span className="w-6 text-center font-display text-lg text-ink/40">{i + 4}</span>
              <RingAvatar name={r.player.full_name} size={36} />
              <div className="flex-1 min-w-0">
                <div className="truncate text-[14px] font-medium">{r.player.full_name}</div>
                <div className="text-[11px] text-ink/45">
                  {r.runs} runs · {r.wickets} wkts · {r.innings} inns
                </div>
              </div>
              <span className="font-display text-xl">{statValue(stat, r)}</span>
            </button>
          ))}
        </Card>
      )}

      <PlayerStatsModal
        player={selected}
        groupName={selected ? groupName(selected.group_id) : null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-chip px-3 py-1.5 text-[12px] font-semibold transition',
        active ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
      )}
    >
      {children}
    </button>
  );
}
