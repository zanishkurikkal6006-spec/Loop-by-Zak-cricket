import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { ScreenTitle, Card, Chip, Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { counterState, stateColor, clsx, aed, firstName } from '@/lib/utils';
import { sendWhatsApp, templates } from '@/lib/whatsapp';
import { assignPackage } from '@/lib/packages';
import AddMatchModal from '@/features/matches/AddMatchModal';
import type { Package, PackageType, Player, MatchFee, Match, GroundFee, TrainingCenter } from '@/lib/types';

// Payments — Packages & Sessions tab. Per-player counter with 5 ring states
// (healthy / low / exhausted / unlimited / comp) plus the renewal chase list
// (≤2 remaining). Source tag: Admin-assigned vs Coach-added · payment pending.

type Tab = 'packages' | 'renewals' | 'types' | 'matchfees' | 'groundfees';

type PackageRow = Package & { player: Player | null; package_type: PackageType | null };

export default function AdminPayments() {
  const { profile } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('packages');
  const [assignOpen, setAssignOpen] = useState(false);
  const [presetPlayer, setPresetPlayer] = useState<string>('');

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

  // Active players, used to surface anyone WITHOUT a package for quick-assign.
  const { data: allPlayers = [] } = useQuery({
    queryKey: ['unassigned-players', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Player[]> => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as Player[];
    },
  });

  const renewals = packages.filter(
    (p) => p.sessions_remaining != null && p.sessions_remaining <= 2 && p.sessions_remaining >= 0,
  );

  const assignedIds = new Set(packages.map((p) => p.player_id));
  const unassigned = allPlayers.filter((p) => !assignedIds.has(p.id));

  function openAssign(playerId = '') {
    setPresetPlayer(playerId);
    setAssignOpen(true);
  }

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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Chip tone={unassigned.length ? 'amber' : 'green'}>
              {unassigned.length ? `${unassigned.length} without a package` : 'Everyone has a package'}
            </Chip>
            <Button size="sm" onClick={() => openAssign()}>+ Assign package</Button>
          </div>
          <AssignPackageModal open={assignOpen} onClose={() => setAssignOpen(false)} presetPlayerId={presetPlayer} />

          {/* Players without a package — quick assign without hunting per-player */}
          {unassigned.length > 0 && (
            <Card className="p-0">
              <div className="border-b border-hairline px-4 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">
                Players without a package ({unassigned.length})
              </div>
              <div className="max-h-64 divide-y divide-hairline overflow-auto">
                {unassigned.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                    <span className="font-medium">{p.full_name}</span>
                    <button
                      onClick={() => openAssign(p.id)}
                      className="rounded-chip bg-brand-red px-3 py-1 text-[11px] font-semibold text-paper"
                    >
                      Assign
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {packages.map((p) => (
              <PackageCard key={p.id} pkg={p} />
            ))}
            {!packages.length && !isLoading && (
              <Card className="text-[13px] text-ink/45">No packages assigned yet.</Card>
            )}
          </div>
        </div>
      )}

      {tab === 'renewals' && (
        <div className="space-y-3">
          {renewals.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="whatsapp"
                onClick={async () => {
                  if (!profile) return;
                  let sent = 0;
                  for (const p of renewals) {
                    if (!p.player?.parent_phone) continue;
                    await sendWhatsApp(
                      p.player.parent_phone,
                      templates.renewalNudge(firstName(p.player.full_name), p.sessions_remaining ?? 0),
                      { academyId: profile.academy_id, playerId: p.player.id, templateKey: 'renewalNudge', refType: 'package', refId: p.id },
                    );
                    sent += 1;
                  }
                  toast.show(sent ? `Opening ${sent} reminder${sent === 1 ? '' : 's'}…` : 'No parent numbers on file');
                }}
              >
                Remind all
              </Button>
            </div>
          )}
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
                {p.player?.parent_phone ? (
                  <button
                    onClick={async () => {
                      if (!profile || !p.player?.parent_phone) return;
                      await sendWhatsApp(
                        p.player.parent_phone,
                        templates.renewalNudge(firstName(p.player.full_name), p.sessions_remaining ?? 0),
                        { academyId: profile.academy_id, playerId: p.player.id, templateKey: 'renewalNudge', refType: 'package', refId: p.id },
                      );
                    }}
                    className="rounded-chip bg-[#25D366]/15 px-2.5 py-1 text-[11px] font-semibold text-[#1c8c47]"
                  >
                    Send reminder
                  </button>
                ) : (
                  <Chip tone="amber">No WhatsApp</Chip>
                )}
              </div>
            ))}
            {!renewals.length && (
              <div className="px-4 py-6 text-center text-[13px] text-ink/45">
                No renewals due — everyone's topped up.
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'types' && <PackageTypesTab />}

      {tab === 'matchfees' && <MatchFeesTab />}
      {tab === 'groundfees' && <GroundFeesTab />}
    </div>
  );
}

function PackageTypesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sessions, setSessions] = useState('');
  const [price, setPrice] = useState('');
  const [kind, setKind] = useState<'standard' | 'unlimited' | 'complimentary'>('standard');
  const [saving, setSaving] = useState(false);

  const { data: types = [] } = useQuery({
    queryKey: ['package-types', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<PackageType[]> => {
      const { data, error } = await supabase.from('package_types').select('*').order('price');
      if (error) throw error;
      return (data ?? []) as PackageType[];
    },
  });

  async function create() {
    if (!profile || !name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('package_types').insert({
        academy_id: profile.academy_id,
        name: name.trim(),
        // Unlimited / complimentary have no fixed session count.
        sessions: kind === 'standard' ? Number(sessions) || 0 : null,
        price: Number(price) || 0,
        kind,
      });
      if (error) throw error;
      toast.show('Package type created');
      setOpen(false);
      setName('');
      setSessions('');
      setPrice('');
      setKind('standard');
      qc.invalidateQueries({ queryKey: ['package-types'] });
    } catch {
      toast.show('Could not create package type');
    } finally {
      setSaving(false);
    }
  }

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Chip tone="neutral">{types.length} package types</Chip>
        <Button size="sm" onClick={() => setOpen(true)}>+ Add custom package</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {types.map((t) => (
          <Card key={t.id} className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold">{t.name}</div>
              <div className="text-[11px] text-ink/45">
                {t.sessions == null ? (t.kind === 'complimentary' ? 'Complimentary' : 'Unlimited') : `${t.sessions} sessions`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="font-display text-2xl">{Number(t.price) ? t.price : 'Free'}</div>
              <DeleteX
                onClick={async () => {
                  const { error } = await supabase.from('package_types').delete().eq('id', t.id);
                  if (error) return toast.show('Could not delete');
                  toast.show('Deleted');
                  qc.invalidateQueries({ queryKey: ['package-types'] });
                }}
              />
            </div>
          </Card>
        ))}
        {!types.length && <Card className="text-[13px] text-ink/45">No package types yet.</Card>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New Package Type">
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. 16 Sessions)" className={field} />
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={field}>
            <option value="standard">Standard (fixed sessions)</option>
            <option value="unlimited">Unlimited</option>
            <option value="complimentary">Complimentary (free)</option>
          </select>
          {kind === 'standard' && (
            <input type="number" value={sessions} onChange={(e) => setSessions(e.target.value)} placeholder="Number of sessions" className={field} />
          )}
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (AED)" className={field} />
          <Button className="w-full" disabled={saving || !name.trim()} onClick={create}>
            {saving ? 'Creating…' : 'Create Package Type'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function MatchFeesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
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

  // Confirm a fee as collected (bank or cash) — also records it in payments.
  async function collect(fee: MatchFee, mode: 'bank' | 'cash') {
    if (!profile) return;
    const { error } = await supabase
      .from('match_fees')
      .update({ state: 'confirmed', mode, confirmed_by: profile.id })
      .eq('id', fee.id);
    if (error) return toast.show('Could not update');
    await supabase.from('payments').insert({
      academy_id: profile.academy_id,
      player_id: fee.player_id,
      category: 'match_fee',
      ref_id: fee.match_id,
      amount: fee.fee,
      mode,
      status: 'confirmed',
      paid_at: new Date().toISOString().slice(0, 10),
      confirmed_by: profile.id,
    });
    toast.show(mode === 'bank' ? 'Bank transfer confirmed' : 'Cash collected');
    qc.invalidateQueries({ queryKey: ['admin-match-fees'] });
  }

  const collected = fees.filter((f) => f.state === 'confirmed').reduce((s, f) => s + Number(f.fee), 0);
  const pending = fees.filter((f) => f.state !== 'confirmed').reduce((s, f) => s + Number(f.fee), 0);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="gold" onClick={() => setAddOpen(true)}>
          + Add match
        </Button>
      </div>
      <AddMatchModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['admin-match-fees'] })}
      />
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
              {f.state === 'confirmed' ? (
                <Chip tone="green">{f.mode === 'cash' ? 'Cash' : 'Bank'} ✓</Chip>
              ) : (
                <>
                  <button onClick={() => collect(f, 'bank')} className="rounded-chip border border-cardborder px-2 py-1 text-[11px] font-semibold text-info">
                    Confirm bank
                  </button>
                  <button onClick={() => collect(f, 'cash')} className="rounded-chip border border-cardborder px-2 py-1 text-[11px] font-semibold text-success">
                    Collect cash
                  </button>
                </>
              )}
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

  // Mark a ground booking as paid (we paid the ground owner) — bank or cash.
  async function markPaid(id: string, m: 'cash' | 'bank') {
    if (!profile) return;
    const { error } = await supabase.from('ground_fees').update({ status: 'confirmed', mode: m }).eq('id', id);
    if (error) return toast.show('Could not update');
    toast.show(m === 'bank' ? 'Bank payment confirmed' : 'Cash paid');
    qc.invalidateQueries({ queryKey: ['ground-fees'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
  }

  const paid = fees.filter((f) => f.status === 'confirmed').reduce((s, f) => s + Number(f.amount), 0);
  const outstanding = fees.filter((f) => f.status !== 'confirmed').reduce((s, f) => s + Number(f.amount), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col gap-1">
          <div className="eyebrow text-ink/40">Paid</div>
          <div className="font-display text-3xl text-success">{aed(paid)}</div>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="eyebrow text-ink/40">To pay</div>
          <div className="font-display text-3xl text-amber-text">{aed(outstanding)}</div>
        </Card>
      </div>
      <div className="flex justify-end">
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
              {f.status === 'confirmed' ? (
                <Chip tone="green">{f.mode === 'cash' ? 'Cash' : 'Bank'} ✓</Chip>
              ) : (
                <>
                  <button onClick={() => markPaid(f.id, 'bank')} className="rounded-chip border border-cardborder px-2 py-1 text-[11px] font-semibold text-info">
                    Paid by bank
                  </button>
                  <button onClick={() => markPaid(f.id, 'cash')} className="rounded-chip border border-cardborder px-2 py-1 text-[11px] font-semibold text-success">
                    Paid cash
                  </button>
                </>
              )}
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

// Assign a package straight from the Packages & Sessions tab — pick a player and
// a package type and it's created (paid, admin-assigned). Mirrors the per-player
// flow in PlayerDetail but lets admins work from the payments screen.
function AssignPackageModal({
  open,
  onClose,
  presetPlayerId,
}: {
  open: boolean;
  onClose: () => void;
  presetPlayerId?: string;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [playerId, setPlayerId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [paid, setPaid] = useState(true);
  const [mode, setMode] = useState<'cash' | 'bank'>('cash');
  const [saving, setSaving] = useState(false);

  // Preselect a player when opened from the "unassigned players" quick-assign.
  useEffect(() => {
    if (open && presetPlayerId) setPlayerId(presetPlayerId);
  }, [open, presetPlayerId]);

  const { data: players = [] } = useQuery({
    queryKey: ['assign-players', profile?.academy_id],
    enabled: !!profile && open,
    queryFn: async (): Promise<Player[]> => {
      const { data, error } = await supabase.from('players').select('*').eq('status', 'active').order('full_name');
      if (error) throw error;
      return (data ?? []) as Player[];
    },
  });
  const { data: types = [] } = useQuery({
    queryKey: ['package-types', profile?.academy_id],
    enabled: !!profile && open,
    queryFn: async (): Promise<PackageType[]> => {
      const { data, error } = await supabase.from('package_types').select('*').order('price');
      if (error) throw error;
      return (data ?? []) as PackageType[];
    },
  });

  async function assign() {
    if (!profile || !playerId || !typeId) return toast.show('Pick a player and a package');
    const type = types.find((t) => t.id === typeId);
    if (!type) return;
    setSaving(true);
    try {
      await assignPackage({
        academyId: profile.academy_id,
        playerId,
        packageTypeId: type.id,
        sessionsTotal: type.sessions,
        price: Number(type.price) || 0,
        paid,
        mode,
        assignedBy: profile.id,
      });
      toast.show(paid ? 'Package assigned · payment recorded' : 'Package assigned · payment pending');
      setPlayerId('');
      setTypeId('');
      qc.invalidateQueries({ queryKey: ['admin-packages'] });
      qc.invalidateQueries({ queryKey: ['unassigned-players'] });
      qc.invalidateQueries({ queryKey: ['finance-payments'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      onClose();
    } catch {
      toast.show('Could not assign package');
    } finally {
      setSaving(false);
    }
  }

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <Modal open={open} onClose={onClose} title="Assign Package">
      <div className="space-y-3">
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={field}>
          <option value="">Select player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={field}>
          <option value="">Select package…</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {Number(t.price) ? `· AED ${t.price}` : ''}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3 py-2.5 text-[13px]">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          Paid now (records it in Finance)
        </label>
        {paid && (
          <div className="flex gap-2">
            {(['cash', 'bank'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  'flex-1 rounded-pill px-3 py-2 text-[12px] font-semibold capitalize transition ' +
                  (mode === m ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')
                }
              >
                {m}
              </button>
            ))}
          </div>
        )}
        <Button className="w-full" disabled={saving || !playerId || !typeId} onClick={assign}>
          {saving ? 'Assigning…' : 'Assign package'}
        </Button>
      </div>
    </Modal>
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

// Small delete control used across the settings/packages lists.
function DeleteX({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Delete"
      className="flex h-5 w-5 items-center justify-center rounded-full text-ink/40 hover:bg-chip-red hover:text-danger"
    >
      ✕
    </button>
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
