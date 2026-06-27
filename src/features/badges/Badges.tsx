import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBadgeTypes, usePlayerBadges, usePlayers } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { ScreenTitle, Card, Chip, Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { clsx } from '@/lib/utils';
import BadgeReveal, { type RevealBadge } from './BadgeReveal';
import type { BadgeCategory } from '@/lib/types';

// Badge system — 26 badges across 4 groups, each a loop-ring medallion.
//  • Moment badges auto-send when a match is logged.
//  • Season badges land in the manager-approval queue (approve → reveal/send).
//  • Admins can also award any badge manually.

const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  performance: 'Performance',
  attendance: 'Attendance',
  progress: 'Progress',
  moment: 'Moment',
};

export default function Badges({
  eyebrow = 'Admin',
  canApprove = true,
}: {
  eyebrow?: string;
  canApprove?: boolean;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: badges = [] } = useBadgeTypes();
  const { data: pending = [] } = usePlayerBadges(true);
  const { data: players = [] } = usePlayers();
  const [busy, setBusy] = useState<string | null>(null);
  const [awardOpen, setAwardOpen] = useState(false);
  const [reveal, setReveal] = useState<RevealBadge | null>(null);

  const categories = (Object.keys(CATEGORY_LABEL) as BadgeCategory[]).map((cat) => ({
    cat,
    items: badges.filter((b) => b.category === cat),
  }));

  async function approveAndSend(pb: (typeof pending)[number]) {
    if (!profile) return;
    setBusy(pb.id);
    try {
      const { error } = await supabase
        .from('player_badges')
        .update({ approval_status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', pb.id);
      if (error) throw error;
      toast.show('Badge approved');
      qc.invalidateQueries({ queryKey: ['player-badges'] });
      // Celebrate + offer certificate / parent share.
      setReveal({
        childName: pb.player?.full_name ?? 'Player',
        badgeName: pb.badge?.name ?? 'Badge',
        emblem: pb.badge?.emblem ?? null,
        criteria: pb.badge?.criteria ?? null,
        accent: pb.badge?.accent ?? null,
        parentPhone: pb.player?.parent_phone ?? null,
        playerId: pb.player_id,
      });
    } catch {
      toast.show('Could not approve badge');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow={eyebrow} title="Badges" />
        {canApprove && <Button size="sm" onClick={() => setAwardOpen(true)}>+ Award badge</Button>}
      </div>

      {/* How badges work */}
      <Card className="text-[12px] text-ink/60">
        <div className="eyebrow mb-1 text-ink/40">How badges are awarded</div>
        <ul className="space-y-1">
          <li>⚡ <span className="font-semibold text-ink/80">Moment badges</span> auto-send when a coach logs a match (e.g. Player of the Match).</li>
          <li>🏅 <span className="font-semibold text-ink/80">Season badges</span> come to the approval queue below — approve to celebrate &amp; share.</li>
          <li>✋ <span className="font-semibold text-ink/80">Manual</span> — award any badge to any player with the button above.</li>
        </ul>
      </Card>

      {/* Manager-approval queue (season badges) */}
      {canApprove && pending.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <span className="eyebrow text-ink/40">Approval queue</span>
            <Chip tone="amber">{pending.length}</Chip>
          </div>
          <div className="divide-y divide-hairline">
            {pending.map((pb) => (
              <div key={pb.id} className="flex items-center gap-3 py-2.5">
                <RingAvatar name={pb.player?.full_name ?? '?'} size={36} color={pb.badge?.accent} />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[14px] font-medium">{pb.player?.full_name}</div>
                  <div className="text-[11px] text-ink/45">
                    {pb.badge?.emblem} {pb.badge?.name}
                  </div>
                </div>
                <Button size="sm" disabled={busy === pb.id} onClick={() => approveAndSend(pb)}>
                  Approve &amp; Celebrate
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Badge catalogue */}
      {categories.map(({ cat, items }) => (
        <div key={cat}>
          <div className="mb-2 flex items-center gap-2">
            <span className="eyebrow text-ink/40">{CATEGORY_LABEL[cat]}</span>
            <Chip tone="neutral">{items.length}</Chip>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {items.map((b) => (
              <Card key={b.id} className="flex flex-col items-center text-center">
                <LoopRing size={64} color={b.accent}>
                  <span className="text-2xl">{b.emblem}</span>
                </LoopRing>
                <div className="mt-2 text-[12px] font-semibold uppercase tracking-wide">{b.name}</div>
                <div className="mt-1 text-[10.5px] leading-snug text-ink/45">{b.criteria}</div>
                <Chip tone={b.send_flow === 'auto' ? 'green' : 'gold'} className={clsx('mt-2')}>
                  {b.send_flow === 'auto' ? 'Auto-send' : 'Needs approval'}
                </Chip>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Manual award */}
      <AwardModal
        open={awardOpen}
        onClose={() => setAwardOpen(false)}
        players={players}
        badges={badges}
        onAwarded={(rb) => setReveal(rb)}
      />

      <BadgeReveal badge={reveal} onClose={() => setReveal(null)} />
    </div>
  );
}

function AwardModal({
  open,
  onClose,
  players,
  badges,
  onAwarded,
}: {
  open: boolean;
  onClose: () => void;
  players: import('@/lib/types').Player[];
  badges: import('@/lib/types').BadgeType[];
  onAwarded: (rb: RevealBadge) => void;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [playerId, setPlayerId] = useState('');
  const [badgeId, setBadgeId] = useState('');
  const [saving, setSaving] = useState(false);

  async function award() {
    if (!profile || !playerId || !badgeId) return toast.show('Pick a player and a badge');
    const player = players.find((p) => p.id === playerId);
    const badge = badges.find((b) => b.id === badgeId);
    if (!player || !badge) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('player_badges').insert({
        academy_id: profile.academy_id,
        player_id: playerId,
        badge_type_id: badgeId,
        approval_status: 'sent',
        earned_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.show('Badge awarded');
      qc.invalidateQueries({ queryKey: ['player-badges'] });
      setPlayerId('');
      setBadgeId('');
      onClose();
      onAwarded({
        childName: player.full_name,
        badgeName: badge.name,
        emblem: badge.emblem,
        criteria: badge.criteria,
        accent: badge.accent,
        parentPhone: player.parent_phone,
        playerId: player.id,
      });
    } catch {
      toast.show('Could not award (already earned?)');
    } finally {
      setSaving(false);
    }
  }

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <Modal open={open} onClose={onClose} title="Award a Badge">
      <div className="space-y-3">
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={field}>
          <option value="">Select player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
        <select value={badgeId} onChange={(e) => setBadgeId(e.target.value)} className={field}>
          <option value="">Select badge…</option>
          {badges.map((b) => (
            <option key={b.id} value={b.id}>{b.emblem} {b.name}</option>
          ))}
        </select>
        <Button className="w-full" disabled={saving || !playerId || !badgeId} onClick={award}>
          {saving ? 'Awarding…' : 'Award & Celebrate'}
        </Button>
      </div>
    </Modal>
  );
}
