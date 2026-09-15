import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useRetention, type RetentionRow } from '@/lib/experienceQueries';
import { captureHealthSnapshots } from '@/lib/experience';
import { createFollowUp } from '@/lib/crm';
import { sendWhatsApp } from '@/lib/whatsapp';
import { academyName } from '@/lib/branding';
import { RISK_LABEL } from '@/lib/health';
import { useToast } from '@/lib/toast';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { clsx, firstName, renewalContext } from '@/lib/utils';
import type { RiskLevel } from '@/lib/types';

type Filter = 'attention' | 'red' | 'amber' | 'all';

// Retention Intelligence — every active player scored for risk, worst first.
// The score is transparent: each card shows exactly why a player looks at-risk
// so a human can decide what to do. It flags attention; it never predicts exit.
export default function Retention() {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('attention');
  const { data: rows = [], isLoading } = useRetention();

  const counts = useMemo(() => ({
    red: rows.filter((r) => r.health.risk === 'red').length,
    amber: rows.filter((r) => r.health.risk === 'amber').length,
    green: rows.filter((r) => r.health.risk === 'green').length,
  }), [rows]);

  const shown = useMemo(() => rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'attention') return r.health.risk !== 'green';
    return r.health.risk === filter;
  }), [rows, filter]);

  const capture = useMutation({
    mutationFn: async () => {
      if (!profile) return 0;
      const atRisk = rows.filter((r) => r.health.risk !== 'green')
        .map((r) => ({ playerId: r.player.id, health: r.health }));
      return captureHealthSnapshots(profile.academy_id, atRisk);
    },
    onSuccess: (n) => toast.show(`${n} health snapshot${n === 1 ? '' : 's'} saved`),
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  const tabs: { key: Filter; label: string; tone?: RiskLevel }[] = [
    { key: 'attention', label: `Needs attention · ${counts.red + counts.amber}` },
    { key: 'red', label: `At risk · ${counts.red}`, tone: 'red' },
    { key: 'amber', label: `Watch · ${counts.amber}`, tone: 'amber' },
    { key: 'all', label: `All · ${rows.length}` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Experience" title="Retention" />
        <Button size="sm" variant="ghost" disabled={capture.isPending} onClick={() => capture.mutate()}>
          <Icon name="download" size={14} /> Snapshot
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <RiskTile label="At risk" value={counts.red} tone="red" />
        <RiskTile label="Watch" value={counts.amber} tone="amber" />
        <RiskTile label="Healthy" value={counts.green} tone="green" />
      </div>

      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={clsx(
              'rounded-pill px-3 py-1.5 text-[12px] font-semibold transition',
              filter === t.key ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <Card className="text-[13px] text-ink/45">Scoring players…</Card>}

      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((r) => (
          <PlayerRiskCard
            key={r.player.id}
            row={r}
            onCheckIn={() => {
              if (!profile) return;
              createFollowUp({
                academyId: profile.academy_id, kind: 'renewal_follow_up',
                title: `Retention check-in · ${r.player.full_name}`,
                playerId: r.player.id, ownerId: profile.id,
                dueDate: new Date().toISOString().slice(0, 10), priority: r.health.risk === 'red' ? 'critical' : 'high',
                notes: renewalContext(r.signals.sessionsRemaining, r.player.extra_sessions),
                createdBy: profile.id,
              }).then(() => {
                toast.show('Check-in task created');
                qc.invalidateQueries({ queryKey: ['follow-ups'] });
                qc.invalidateQueries({ queryKey: ['todays-actions'] });
              });
            }}
          />
        ))}
        {!isLoading && !shown.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">
            No players in this band. 🎉
          </div>
        )}
      </div>
    </div>
  );
}

function RiskTile({ label, value, tone }: { label: string; value: number; tone: RiskLevel }) {
  const color = tone === 'red' ? 'text-danger' : tone === 'amber' ? 'text-amber-text' : 'text-success';
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-4xl leading-none', color)}>{value}</div>
    </Card>
  );
}

function PlayerRiskCard({ row, onCheckIn }: { row: RetentionRow; onCheckIn: () => void }) {
  const { profile } = useAuth();
  const { player, health } = row;
  const tone = health.risk === 'red' ? 'red' : health.risk === 'amber' ? 'amber' : 'green';
  const scoreColor = health.risk === 'red' ? 'text-danger' : health.risk === 'amber' ? 'text-amber-text' : 'text-success';

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">{player.full_name}</div>
          <div className="text-[12px] text-ink/45">
            {player.age ? `Age ${player.age}` : ''}{player.parent_name ? ` · ${player.parent_name}` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className={clsx('font-display text-3xl leading-none', scoreColor)}>{health.score}</div>
          <Chip tone={tone as never} className="mt-1">{RISK_LABEL[health.risk]}</Chip>
        </div>
      </div>

      {/* score bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-pill bg-hairline">
        <div
          className={clsx('h-full rounded-pill', health.risk === 'red' ? 'bg-danger' : health.risk === 'amber' ? 'bg-amber-text' : 'bg-success')}
          style={{ width: `${health.score}%` }}
        />
      </div>

      {health.factors.length > 0 && (
        <ul className="space-y-1">
          {health.factors.slice(0, 3).map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px] text-ink/60">
              <Icon name="alert" size={12} stroke="#A9791B" /> {f.label}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onCheckIn}>Log check-in</Button>
        {player.parent_phone && (
          <Button
            size="sm" variant="whatsapp"
            onClick={() => sendWhatsApp(
              player.parent_phone!,
              `Hi${player.parent_name ? ` ${firstName(player.parent_name)}` : ''}! Just checking in about ${firstName(player.full_name)} — we'd love to see them back on the pitch soon. Anything we can help with? — ${academyName()}`,
              { academyId: profile!.academy_id, playerId: player.id, templateKey: 'retention_checkin', refType: 'player', refId: player.id },
            )}
          >
            <Icon name="whatsapp" size={14} stroke="#fff" /> Reach out
          </Button>
        )}
      </div>
    </Card>
  );
}
