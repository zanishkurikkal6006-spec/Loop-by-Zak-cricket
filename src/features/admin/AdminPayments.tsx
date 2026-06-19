import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { ScreenTitle, Card, Chip, Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { counterState, stateColor, clsx, aed } from '@/lib/utils';
import type { Package, PackageType, Player, MatchFee, Match, GroundFee, TrainingCenter } from '@/lib/types';

// Payments — Packages & Sessions tab. Per-player counter with 5 ring states
// (healthy / low / exhausted / unlimited / comp) plus the renewal chase list
// (≤2 remaining). Source tag: Admin-assigned vs Coach-added · payment pending.

type Tab = 'packages' | 'renewals' | 'types' | 'matchfees' | 'groundfees';

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
        <TabBtn active={tab === 'matchfees'} onClick={() => setTab('matchfees')}>
          Match Fees
        </TabBtn>
        <TabBtn active={tab === 'groundfees'} onClick={() => setTab('groundfees')}>
          Ground Fees
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

      {tab === 'matchfees' && <MatchFeesTab />}
      {tab === 'groundfees' && <GroundFeesTab />}
    </div>
  );
}

function MatchFeesTab() {
  const { profile } = useAuth();
  const { data: fees = [], isLoading } = useQuery({
    queryKey: ['admin-match-fees', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<(MatchFee & { player: Player | null; match: Match | null })[]> => {
      const { data, error } = await supabase
        .from('match_fees')
        .select('*, player:players(*), match:matches(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (MatchFee & { player: Player | null; match: Match | null })[];
    },
  });

  const collected = fees.filter((f) => f.state === 'confirmed').reduce((s, f) => s + Number(f.fee), 0);
  const pending = fees.filter((f) => f.state !== 'confirmed').reduce((s, f) => s + Number(f.fee), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col gap-1">
          <div className="eyebrow text-ink/40">Collected</div>
          <div className="font-display text-3xl text-success">{aed(collected)}</div>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="eyebrow text-ink/40">Outstanding</div>
          <div className="font-display text-3xl text-amber-text">{aed(pending)}</div>
        </Card>
      </div>
      <Card className="divide-y divide-hairline p-0">
        {isLoading && <div className="px-4 py-4 text-[13px] text-ink/45">Loading…</div>}
        {fees.map((f) => (
          <div key={f.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
            <div>
              <div className="font-medium">{f.player?.full_name ?? 'Player'}</div>
              <div className="text-[11px] text-ink/45">
                vs {f.match?.opponent ?? '—'} · {f.mode ?? 'awaiting'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone={f.state === 'confirmed' ? 'green' : f.state === 'pending' ? 'amber' : 'neutral'}>
                {f.state}
              </Chip>
              <span className="w-16 text-right font-semibold">{aed(Number(f.fee))}</span>
            </div>
          </div>
        ))}
        {!isLoading && !fees.length && (
          <div className="px-4 py-6 text-center text-[13px] text-ink/45">No match fees recorded.</div>
        )}
      </Card>
    </div>
  );
}

function GroundFeesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [centerId, setCenterId] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [saving, setSaving] = useState(false);

  const { data: fees = [] } = useQuery({
    queryKey: ['ground-fees', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<(GroundFee & { center: TrainingCenter | null })[]> => {
      const { data, error } = await supabase
        .from('ground_fees')
        .select('*, center:training_centers(*)')
        .order('booking_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (GroundFee & { center: TrainingCenter | null })[];
    },
  });

  const { data: centers = [] } = useQuery({
    queryKey: ['centers-list', profile?.academy_id],
    enabled: !!profile && adding,
    queryFn: async (): Promise<TrainingCenter[]> => {
      const { data } = await supabase.from('training_centers').select('*').order('name');
      return (data ?? []) as TrainingCenter[];
    },
  });

  async function save() {
    if (!profile || !date || !amount) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('ground_fees').insert({
        academy_id: profile.academy_id,
        center_id: centerId || null,
        booking_date: date,
        amount: Number(amount),
        mode,
        status: mode === 'pending' ? 'pending' : 'confirmed',
      });
      if (error) throw error;
      toast.show('Booking added');
      setAdding(false);
      setDate('');
      setAmount('');
      qc.invalidateQueries({ queryKey: ['ground-fees'] });
    } catch {
      toast.show('Could not add booking');
    } finally {
      setSaving(false);
    }
  }

  const total = fees.reduce((s, f) => s + Number(f.amount), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Chip tone="neutral">Total bookings: {aed(total)}</Chip>
        <Button size="sm" onClick={() => setAdding(true)}>
          + Add booking
        </Button>
      </div>
      <Card className="divide-y divide-hairline p-0">
        {fees.map((f) => (
          <div key={f.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
            <div>
              <div className="font-medium">{f.center?.name ?? 'Ground'}</div>
              <div className="text-[11px] text-ink/45">
                {f.booking_date} · {f.mode}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone={f.status === 'confirmed' ? 'green' : 'amber'}>{f.status}</Chip>
              <span className="w-16 text-right font-semibold">{aed(Number(f.amount))}</span>
            </div>
          </div>
        ))}
        {!fees.length && (
          <div className="px-4 py-6 text-center text-[13px] text-ink/45">No ground bookings yet.</div>
        )}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add Ground Booking">
        <div className="space-y-3">
          <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]">
            <option value="">Select center…</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]" />
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (AED)" className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]" />
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]">
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="pending">Pending</option>
          </select>
          <Button className="w-full" disabled={saving || !date || !amount} onClick={save}>
            {saving ? 'Saving…' : 'Add Booking'}
          </Button>
        </div>
      </Modal>
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
