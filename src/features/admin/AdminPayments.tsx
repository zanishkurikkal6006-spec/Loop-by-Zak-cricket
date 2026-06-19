import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenTitle, Card, Chip } from '@/components/ui';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { counterState, stateColor, clsx } from '@/lib/utils';
import type { Package, PackageType, Player } from '@/lib/types';

// Payments — Packages & Sessions tab. Per-player counter with 5 ring states
// (healthy / low / exhausted / unlimited / comp) plus the renewal chase list
// (≤2 remaining). Source tag: Admin-assigned vs Coach-added · payment pending.

type Tab = 'packages' | 'renewals' | 'types';

type PackageRow = Package & { player: Player | null; package_type: PackageType | null };

export default function AdminPayments() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('packages');

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['admin-packages', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<PackageRow[]> => {
      const { data, error } = await supabase
        .from('packages')
        .select('*, player:players(*), package_type:package_types(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PackageRow[];
    },
  });

  const { data: types = [] } = useQuery({
    queryKey: ['package-types', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<PackageType[]> => {
      const { data, error } = await supabase.from('package_types').select('*').order('price');
      if (error) throw error;
      return (data ?? []) as PackageType[];
    },
  });

  const renewals = packages.filter(
    (p) => p.sessions_remaining != null && p.sessions_remaining <= 2 && p.sessions_remaining >= 0,
  );

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Admin" title="Payments" />

      <div className="flex gap-2">
        <TabBtn active={tab === 'packages'} onClick={() => setTab('packages')}>
          Packages &amp; Sessions
        </TabBtn>
        <TabBtn active={tab === 'renewals'} onClick={() => setTab('renewals')}>
          Renewals <Chip tone="amber" className="ml-1">{renewals.length}</Chip>
        </TabBtn>
        <TabBtn active={tab === 'types'} onClick={() => setTab('types')}>
          Package Types
        </TabBtn>
      </div>

      {isLoading && <div className="text-[13px] text-ink/45">Loading…</div>}

      {tab === 'packages' && (
        <div className="grid gap-3 md:grid-cols-2">
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} />
          ))}
          {!packages.length && !isLoading && (
            <Card className="text-[13px] text-ink/45">No packages assigned yet.</Card>
          )}
        </div>
      )}

      {tab === 'renewals' && (
        <Card className="divide-y divide-hairline p-0">
          {renewals.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <RingAvatar name={p.player?.full_name ?? '?'} size={36} color="#C9A84C" />
              <div className="flex-1">
                <div className="text-[14px] font-medium">{p.player?.full_name}</div>
                <div className="text-[11px] text-ink/45">
                  {p.sessions_remaining} session{p.sessions_remaining === 1 ? '' : 's'} left
                </div>
              </div>
              <Chip tone="amber">Chase renewal</Chip>
            </div>
          ))}
          {!renewals.length && (
            <div className="px-4 py-6 text-center text-[13px] text-ink/45">
              No renewals due — everyone's topped up.
            </div>
          )}
        </Card>
      )}

      {tab === 'types' && (
        <div className="grid gap-3 md:grid-cols-3">
          {types.map((t) => (
            <Card key={t.id} className="flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold">{t.name}</div>
                <div className="text-[11px] text-ink/45">
                  {t.sessions == null ? 'Unlimited' : `${t.sessions} sessions`}
                </div>
              </div>
              <div className="font-display text-2xl">{Number(t.price) ? t.price : 'Free'}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PackageCard({ pkg }: { pkg: PackageRow }) {
  const kind = pkg.package_type?.kind ?? 'standard';
  const state = counterState(pkg.sessions_remaining, kind);
  const color = stateColor(state);
  const total = pkg.sessions_total ?? 0;
  const progress = total ? pkg.sessions_used / total : 1;

  return (
    <Card className="flex items-center gap-3">
      <LoopRing size={56} progress={kind === 'standard' ? progress : undefined} color={color}>
        <div className="text-center leading-none">
          <div className="font-display text-lg">
            {pkg.sessions_remaining == null ? '∞' : pkg.sessions_remaining}
          </div>
          <div className="text-[8px] uppercase tracking-eyebrow text-ink/40">left</div>
        </div>
      </LoopRing>
      <div className="flex-1 min-w-0">
        <div className="truncate text-[15px] font-semibold">{pkg.player?.full_name ?? 'Player'}</div>
        <div className="text-[11px] text-ink/45">
          {pkg.package_type?.name ?? 'Package'} · {pkg.sessions_used}/{total || '∞'} used
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Chip
            tone={
              state === 'healthy'
                ? 'green'
                : state === 'low'
                  ? 'amber'
                  : state === 'exhausted'
                    ? 'red'
                    : state === 'comp'
                      ? 'comp'
                      : 'blue'
            }
          >
            {state}
          </Chip>
          <Chip tone={pkg.source === 'admin_assigned' ? 'neutral' : 'amber'}>
            {pkg.source === 'admin_assigned' ? 'Admin-assigned' : 'Coach-added'}
          </Chip>
          {pkg.payment_status === 'pending' && <Chip tone="amber">Payment pending</Chip>}
        </div>
      </div>
    </Card>
  );
}

function TabBtn({
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
        'inline-flex items-center rounded-chip px-3 py-1.5 text-[12px] font-semibold transition',
        active ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
      )}
    >
      {children}
    </button>
  );
}
