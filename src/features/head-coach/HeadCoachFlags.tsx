import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCoaches } from '@/lib/queries';
import { ScreenTitle, Card, Chip } from '@/components/ui';
import { RingAvatar } from '@/components/brand/LoopRing';

// Flags — quiet coaches / stalled players, framed supportively (not punitively).

export default function HeadCoachFlags() {
  const { profile } = useAuth();
  const { data: coaches = [] } = useCoaches();

  const { data: quietCoaches = [] } = useQuery({
    queryKey: ['flags-quiet-coaches', profile?.academy_id, coaches.length],
    enabled: !!profile && coaches.length > 0,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const { data } = await supabase
        .from('reports')
        .select('coach_id, created_at')
        .gte('created_at', since.toISOString());
      const active = new Set((data ?? []).map((r) => (r as { coach_id: string }).coach_id));
      return coaches.filter((c) => !active.has(c.id));
    },
  });

  const { data: stalledPlayers = [] } = useQuery({
    queryKey: ['flags-stalled-players', profile?.academy_id],
    enabled: !!profile,
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const iso = cutoff.toISOString().slice(0, 10);
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('status', 'active')
        .or(`last_seen_at.lt.${iso},last_seen_at.is.null`)
        .order('last_seen_at', { ascending: true, nullsFirst: true });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Head Coach" title="Flags" />
      <p className="text-[13px] text-ink/55">
        A supportive nudge list — quiet coaches who may need a check-in, and players who haven't been
        seen in a while.
      </p>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <span className="eyebrow text-ink/40">Quiet coaches</span>
          <Chip tone="amber">{quietCoaches.length}</Chip>
          <span className="text-[11px] text-ink/40">No report in 7 days</span>
        </div>
        <div className="divide-y divide-hairline">
          {quietCoaches.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5">
              <RingAvatar name={c.full_name} size={34} color="#C9A84C" />
              <span className="flex-1 text-[14px] font-medium">{c.full_name}</span>
              <span className="text-[12px] text-ink/45">Worth a check-in</span>
            </div>
          ))}
          {!quietCoaches.length && (
            <div className="py-2 text-[13px] text-ink/45">Everyone's reporting — nice.</div>
          )}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <span className="eyebrow text-ink/40">Not seen recently</span>
          <Chip tone="amber">{stalledPlayers.length}</Chip>
          <span className="text-[11px] text-ink/40">14+ days</span>
        </div>
        <div className="divide-y divide-hairline">
          {stalledPlayers.map((p) => {
            const player = p as { id: string; full_name: string; last_seen_at: string | null };
            return (
              <div key={player.id} className="flex items-center gap-3 py-2.5">
                <RingAvatar name={player.full_name} size={34} />
                <span className="flex-1 text-[14px] font-medium">{player.full_name}</span>
                <span className="text-[12px] text-ink/45">
                  {player.last_seen_at
                    ? `Last seen ${new Date(player.last_seen_at).toLocaleDateString('en-AE', {
                        day: 'numeric',
                        month: 'short',
                      })}`
                    : 'Never marked'}
                </span>
              </div>
            );
          })}
          {!stalledPlayers.length && (
            <div className="py-2 text-[13px] text-ink/45">No stalled players — great consistency.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
