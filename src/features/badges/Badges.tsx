import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBadgeTypes, usePlayerBadges } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { sendWhatsApp, templates } from '@/lib/whatsapp';
import { ScreenTitle, Card, Chip, Button } from '@/components/ui';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { firstName, clsx } from '@/lib/utils';
import type { BadgeCategory } from '@/lib/types';

// Badge system — 26 badges across 4 groups, each a loop-ring medallion.
// Season badges land in a manager-approval queue; the manager approves & sends.
// `canApprove` gates the approval flow (admin); head coach views read-only.

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
  const [busy, setBusy] = useState<string | null>(null);

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

      if (pb.player?.parent_phone) {
        await sendWhatsApp(
          pb.player.parent_phone,
          templates.badgeEarned(firstName(pb.player.full_name), pb.badge?.name ?? 'a badge'),
          { academyId: profile.academy_id, playerId: pb.player.id, templateKey: 'badgeEarned', refType: 'player_badge', refId: pb.id },
        );
      }
      toast.show('Badge approved & sent');
      qc.invalidateQueries({ queryKey: ['player-badges'] });
    } catch {
      toast.show('Could not send badge');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow={eyebrow} title="Badges" />

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
                <Button size="sm" variant="whatsapp" disabled={busy === pb.id} onClick={() => approveAndSend(pb)}>
                  Approve &amp; Send
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
                <Chip
                  tone={b.send_flow === 'auto' ? 'green' : 'gold'}
                  className={clsx('mt-2')}
                >
                  {b.send_flow === 'auto' ? 'Auto-send' : 'Needs approval'}
                </Chip>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
