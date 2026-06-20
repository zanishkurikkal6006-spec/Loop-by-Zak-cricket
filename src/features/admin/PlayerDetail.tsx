import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { Card, Chip, Button } from '@/components/ui';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { aed, counterState, stateColor, firstName } from '@/lib/utils';
import { sendWhatsApp, templates } from '@/lib/whatsapp';
import { useToast } from '@/lib/toast';
import type { Package, PackageType, Payment, Report, PlayerBadge, BadgeType, Player } from '@/lib/types';

// Admin player profile — package & sessions ring, season stats, parent +
// Open WhatsApp, recent reports, earned badges, and the complete payment
// history (group / 1-on-1 / match fees with dates + mode of payment).

type PackageRow = Package & { package_type: PackageType | null };

export default function PlayerDetail({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const enabled = !!profile && !!player;
  const [assigning, setAssigning] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [payStatus, setPayStatus] = useState<'paid' | 'pending'>('paid');
  const [savingPkg, setSavingPkg] = useState(false);

  const { data: packageTypes = [] } = useQuery({
    queryKey: ['package-types', profile?.academy_id],
    enabled,
    queryFn: async (): Promise<PackageType[]> => {
      const { data } = await supabase.from('package_types').select('*').order('price');
      return (data ?? []) as PackageType[];
    },
  });

  async function assignPackage() {
    if (!profile || !player || !typeId) return;
    const t = packageTypes.find((x) => x.id === typeId);
    if (!t) return;
    setSavingPkg(true);
    try {
      const { error } = await supabase.from('packages').insert({
        academy_id: profile.academy_id,
        player_id: player.id,
        package_type_id: t.id,
        sessions_total: t.sessions,
        sessions_used: 0,
        source: 'admin_assigned',
        payment_status: payStatus,
        assigned_by: profile.id,
      });
      if (error) throw error;
      // Record the payment if marked paid and the package has a price.
      if (payStatus === 'paid' && Number(t.price) > 0) {
        await supabase.from('payments').insert({
          academy_id: profile.academy_id,
          player_id: player.id,
          category: 'package',
          amount: t.price,
          mode: 'cash',
          status: 'confirmed',
          paid_at: new Date().toISOString().slice(0, 10),
          confirmed_by: profile.id,
        });
      }
      toast.show('Package assigned');
      setAssigning(false);
      setTypeId('');
      qc.invalidateQueries({ queryKey: ['player-package', player.id] });
      qc.invalidateQueries({ queryKey: ['player-payments', player.id] });
      qc.invalidateQueries({ queryKey: ['admin-packages'] });
    } catch {
      toast.show('Could not assign package');
    } finally {
      setSavingPkg(false);
    }
  }

  const { data: pkg } = useQuery({
    queryKey: ['player-package', player?.id],
    enabled,
    queryFn: async (): Promise<PackageRow | null> => {
      const { data } = await supabase
        .from('packages')
        .select('*, package_type:package_types(*)')
        .eq('player_id', player!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as PackageRow) ?? null;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['player-payments', player?.id],
    enabled,
    queryFn: async (): Promise<Payment[]> => {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('player_id', player!.id)
        .order('created_at', { ascending: false });
      return (data ?? []) as Payment[];
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['player-reports', player?.id],
    enabled,
    queryFn: async (): Promise<Report[]> => {
      const { data } = await supabase
        .from('reports')
        .select('*')
        .eq('player_id', player!.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return (data ?? []) as Report[];
    },
  });

  const { data: badges = [] } = useQuery({
    queryKey: ['player-badge-list', player?.id],
    enabled,
    queryFn: async (): Promise<(PlayerBadge & { badge: BadgeType })[]> => {
      const { data } = await supabase
        .from('player_badges')
        .select('*, badge:badge_types(*)')
        .eq('player_id', player!.id)
        .order('earned_at', { ascending: false });
      return (data ?? []) as (PlayerBadge & { badge: BadgeType })[];
    },
  });

  if (!player) return null;

  const kind = pkg?.package_type?.kind ?? 'standard';
  const state = counterState(pkg?.sessions_remaining ?? null, kind);
  const total = pkg?.sessions_total ?? 0;
  const progress = total ? (pkg?.sessions_used ?? 0) / total : 1;

  function openWhatsApp() {
    if (!player?.parent_phone || !profile) {
      toast.show('No parent phone on file');
      return;
    }
    const remaining = pkg?.sessions_remaining ?? 0;
    sendWhatsApp(
      player.parent_phone,
      templates.renewalNudge(firstName(player.full_name), remaining),
      { academyId: profile.academy_id, playerId: player.id, templateKey: 'renewalNudge' },
    );
  }

  return (
    <Modal open={!!player} onClose={onClose} title={player.full_name}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <RingAvatar name={player.full_name} size={52} />
          <div className="flex-1">
            <div className="text-[12px] text-ink/50">
              {player.age ? `Age ${player.age}` : ''}
              {player.parent_name ? ` · ${player.parent_name}` : ''}
            </div>
            {player.parent_phone && (
              <Button size="sm" variant="whatsapp" className="mt-1" onClick={openWhatsApp}>
                Open WhatsApp
              </Button>
            )}
          </div>
        </div>

        {/* Package & Sessions */}
        {pkg ? (
          <Card className="flex items-center gap-3" style={{ borderColor: stateColor(state) }}>
            <LoopRing size={56} progress={kind === 'standard' ? progress : undefined} color={stateColor(state)}>
              <div className="text-center leading-none">
                <div className="font-display text-lg">
                  {pkg.sessions_remaining == null ? '∞' : pkg.sessions_remaining}
                </div>
                <div className="text-[8px] uppercase tracking-eyebrow text-ink/40">left</div>
              </div>
            </LoopRing>
            <div className="flex-1">
              <div className="text-[14px] font-semibold">{pkg.package_type?.name ?? 'Package'}</div>
              <div className="text-[11px] text-ink/45">
                {pkg.sessions_used}/{total || '∞'} used
              </div>
              <div className="mt-1 flex gap-1.5">
                <Chip tone={state === 'healthy' ? 'green' : state === 'low' ? 'amber' : state === 'exhausted' ? 'red' : 'blue'}>
                  {state}
                </Chip>
                {pkg.payment_status === 'pending' && <Chip tone="amber">Payment pending</Chip>}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="text-[13px] text-ink/45">No active package.</Card>
        )}

        {/* Assign / change package */}
        {!assigning ? (
          <Button variant="ghost" onClick={() => setAssigning(true)}>
            {pkg ? 'Assign new package' : 'Assign package'}
          </Button>
        ) : (
          <Card className="space-y-2">
            <div className="eyebrow text-ink/40">Assign package</div>
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]"
            >
              <option value="">Select a package…</option>
              {packageTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {Number(t.price) ? `· AED ${t.price}` : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              {(['paid', 'pending'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setPayStatus(s)}
                  className={
                    'flex-1 rounded-chip px-3 py-2 text-[12px] font-semibold capitalize ' +
                    (payStatus === s ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')
                  }
                >
                  {s === 'paid' ? 'Paid' : 'Payment pending'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setAssigning(false)}>Cancel</Button>
              <Button className="flex-1" disabled={savingPkg || !typeId} onClick={assignPackage}>
                {savingPkg ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
          </Card>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div>
            <div className="eyebrow mb-2 text-ink/40">Badges</div>
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <LoopRing key={b.id} size={40} color={b.badge?.accent}>
                  <span className="text-lg">{b.badge?.emblem}</span>
                </LoopRing>
              ))}
            </div>
          </div>
        )}

        {/* Recent reports */}
        {reports.length > 0 && (
          <div>
            <div className="eyebrow mb-2 text-ink/40">Recent reports</div>
            <div className="space-y-1.5">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-chip bg-hairline px-3 py-2 text-[12px]">
                  <span>{r.type === 'quick' ? 'Quick feedback' : 'Development report'}</span>
                  <Chip tone={r.status === 'sent' ? 'green' : 'amber'}>{r.status}</Chip>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Complete payment history */}
        <div>
          <div className="eyebrow mb-2 text-ink/40">Payment history</div>
          <Card className="divide-y divide-hairline p-0">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 text-[12.5px]">
                <div>
                  <div className="font-medium capitalize">{p.category.replace('_', ' ')}</div>
                  <div className="text-[11px] text-ink/45">
                    {p.paid_at ?? p.created_at.slice(0, 10)} · {p.mode}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{aed(Number(p.amount))}</div>
                  <Chip tone={p.status === 'confirmed' ? 'green' : 'amber'}>{p.status}</Chip>
                </div>
              </div>
            ))}
            {!payments.length && (
              <div className="px-3 py-4 text-center text-[12px] text-ink/45">No payments recorded.</div>
            )}
          </Card>
        </div>
      </div>
    </Modal>
  );
}
