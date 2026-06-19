import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMyOneToOneBlocks } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { Button, Chip, ScreenTitle } from '@/components/ui';
import { stateColor, firstName } from '@/lib/utils';
import type { OneToOneBlock, Player } from '@/lib/types';

// 1-on-1 Sessions: gold hero (all-time delivered), assigned blocks sorted
// most-remaining-first, each with the signature ring + bar tracker. Logging a
// session deducts one from the block.
export default function CoachOneToOne() {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: blocks = [] } = useMyOneToOneBlocks();

  const totalDelivered = blocks.reduce((s, b) => s + b.sessions_used, 0);

  const logSession = useMutation({
    mutationFn: async (block: OneToOneBlock) => {
      if (!profile) throw new Error('Not signed in');
      if (block.sessions_remaining <= 0) throw new Error('No sessions remaining');
      // Record the session and decrement the block.
      const { error: sErr } = await supabase.from('one_to_one_sessions').insert({
        academy_id: profile.academy_id,
        block_id: block.id,
        session_date: new Date().toISOString().slice(0, 10),
        time_slot: new Date().toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }),
        logged_by: profile.id,
      });
      if (sErr) throw sErr;
      const { error: uErr } = await supabase
        .from('one_to_one_blocks')
        .update({ sessions_used: block.sessions_used + 1 })
        .eq('id', block.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      toast.show('Session logged');
      queryClient.invalidateQueries({ queryKey: ['one-to-one'] });
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not log'),
  });

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Coach · Gold" title="1-on-1 Sessions" />

      {/* Gold hero */}
      <div className="rounded-card bg-gradient-to-b from-gold-light to-gold-dark p-5 text-ink shadow-card-lg">
        <div className="text-[11px] font-semibold uppercase tracking-eyebrow">
          Private sessions delivered
        </div>
        <div className="mt-1 font-display text-5xl leading-none">{totalDelivered}</div>
        <div className="mt-1 text-[12px] text-ink/70">All-time, across your assigned blocks</div>
      </div>

      <div className="space-y-3">
        {blocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            onLog={() => logSession.mutate(block)}
            pending={logSession.isPending}
          />
        ))}
        {!blocks.length && (
          <div className="card flex h-32 items-center justify-center text-[13px] text-ink/40">
            No 1-on-1 blocks assigned to you yet.
          </div>
        )}
      </div>
    </div>
  );
}

function BlockCard({
  block,
  onLog,
  pending,
}: {
  block: OneToOneBlock & { player: Player };
  onLog: () => void;
  pending: boolean;
}) {
  const remaining = block.sessions_remaining;
  const ringState = remaining >= 3 ? 'healthy' : remaining >= 1 ? 'low' : 'exhausted';
  const color = stateColor(ringState);
  const pct = block.sessions_total ? block.sessions_used / block.sessions_total : 0;

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <LoopRing progress={pct} color={color} size={52} stroke={4}>
          <span className="text-[11px] font-bold">{remaining}</span>
        </LoopRing>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <RingAvatar name={block.player?.full_name ?? '—'} size={28} />
            <span className="text-[15px] font-semibold">{block.player?.full_name}</span>
          </div>
          {block.focus_note && <div className="mt-0.5 text-[12px] text-ink/55">{block.focus_note}</div>}
        </div>
        {block.payment_status === 'pending' && <Chip tone="amber">Payment pending</Chip>}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[12px] text-ink/55">
          {block.sessions_used} of {block.sessions_total} used ·{' '}
          <span style={{ color }} className="font-semibold">
            {remaining === 0 ? 'Renewal needed' : `${remaining} remaining`}
          </span>
        </span>
        <Button size="sm" disabled={pending || remaining <= 0} onClick={onLog}>
          + Log for {firstName(block.player?.full_name ?? '')}
        </Button>
      </div>
    </div>
  );
}
