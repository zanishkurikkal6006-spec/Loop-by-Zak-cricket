import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { ScreenTitle, Card, Chip, Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { counterState, stateColor, clsx, aed } from '@/lib/utils';
import type { Package, PackageType, Player, MatchFee, Match, GroundFee, TrainingCenter, Batch, Group, Profile } from '@/lib/types';

// Payments — Packages & Sessions tab. Per-player counter with 5 ring states
// (healthy / low / exhausted / unlimited / comp) plus the renewal chase list
// (≤2 remaining). Source tag: Admin-assigned vs Coach-added · payment pending.

type Tab = 'packages' | 'renewals' | 'types' | 'matchfees' | 'groundfees' | 'settings';

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
        <TabBtn active={tab === 'settings'} onClick={() => setTab('settings')}>
          Settings
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

      {tab === 'types' && <PackageTypesTab />}

      {tab === 'matchfees' && <MatchFeesTab />}
      {tab === 'groundfees' && <GroundFeesTab />}
      {tab === 'settings' && <SettingsTab />}
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

function SettingsTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: centers = [] } = useQuery({
    queryKey: ['settings-centers', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<TrainingCenter[]> => {
      const { data } = await supabase.from('training_centers').select('*').order('name');
      return (data ?? []) as TrainingCenter[];
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['settings-batches', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<(Batch & { center: TrainingCenter | null })[]> => {
      const { data } = await supabase
        .from('batches')
        .select('*, center:training_centers(*)')
        .order('start_time');
      return (data ?? []) as (Batch & { center: TrainingCenter | null })[];
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['settings-groups', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Group[]> => {
      const { data } = await supabase.from('groups').select('*').order('name');
      return (data ?? []) as Group[];
    },
  });

  const { data: coaches = [] } = useQuery({
    queryKey: ['settings-coaches', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Profile[]> => {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'coach').order('full_name');
      return (data ?? []) as Profile[];
    },
  });

  const { data: academy } = useQuery({
    queryKey: ['settings-academy', profile?.academy_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase
        .from('academies')
        .select('id, bank_details')
        .eq('id', profile!.academy_id)
        .single();
      return data as { id: string; bank_details: Record<string, string> } | null;
    },
  });

  // ── Training centers ───────────────────────────────────────────────────────
  const [centerName, setCenterName] = useState('');
  const [centerAddr, setCenterAddr] = useState('');
  async function addCenter() {
    if (!profile || !centerName.trim()) return;
    const { error } = await supabase.from('training_centers').insert({
      academy_id: profile.academy_id,
      name: centerName.trim(),
      address: centerAddr.trim() || null,
    });
    if (error) return toast.show('Could not add center');
    toast.show('Center added');
    setCenterName('');
    setCenterAddr('');
    qc.invalidateQueries({ queryKey: ['settings-centers'] });
  }

  // ── Batches ────────────────────────────────────────────────────────────────
  const [batchName, setBatchName] = useState('');
  const [batchStart, setBatchStart] = useState('');
  const [batchEnd, setBatchEnd] = useState('');
  const [batchCenter, setBatchCenter] = useState('');
  async function addBatch() {
    if (!profile || !batchName.trim()) return;
    const { error } = await supabase.from('batches').insert({
      academy_id: profile.academy_id,
      name: batchName.trim(),
      center_id: batchCenter || null,
      start_time: batchStart || null,
      end_time: batchEnd || null,
    });
    if (error) return toast.show('Could not add batch');
    toast.show('Batch added');
    setBatchName('');
    setBatchStart('');
    setBatchEnd('');
    qc.invalidateQueries({ queryKey: ['settings-batches'] });
  }

  // ── Groups ───────────────────────────────────────────────────────────────--
  const [groupName, setGroupName] = useState('');
  const [groupAge, setGroupAge] = useState('');
  const [groupCenter, setGroupCenter] = useState('');
  async function addGroup() {
    if (!profile || !groupName.trim()) return;
    const { error } = await supabase.from('groups').insert({
      academy_id: profile.academy_id,
      name: groupName.trim(),
      age_category: groupAge.trim() || null,
      default_center_id: groupCenter || null,
    });
    if (error) return toast.show('Could not add group');
    toast.show('Group added');
    setGroupName('');
    setGroupAge('');
    qc.invalidateQueries({ queryKey: ['settings-groups'] });
  }

  // ── Assign coach to group ─────────────────────────────────────────────────--
  const [assignCoach, setAssignCoach] = useState('');
  const [assignGroup, setAssignGroup] = useState('');
  async function assignCoachToGroup() {
    if (!profile || !assignCoach || !assignGroup) return;
    const { error } = await supabase.from('coach_groups').insert({
      academy_id: profile.academy_id,
      coach_id: assignCoach,
      group_id: assignGroup,
    });
    if (error) return toast.show('Already assigned, or failed');
    toast.show('Coach assigned to group');
    setAssignCoach('');
    setAssignGroup('');
  }

  // ── Bank details ─────────────────────────────────────────────────────────--
  const [bank, setBank] = useState<Record<string, string>>({});
  // Seed the editable bank fields once the academy record loads.
  useEffect(() => {
    if (academy?.bank_details) setBank(academy.bank_details);
  }, [academy]);
  async function saveBank() {
    if (!profile) return;
    const { error } = await supabase
      .from('academies')
      .update({ bank_details: bank })
      .eq('id', profile.academy_id);
    if (error) return toast.show('Could not save bank details');
    toast.show('Bank details saved');
    qc.invalidateQueries({ queryKey: ['settings-academy'] });
  }

  async function del(table: string, id: string, key: string) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) return toast.show('Could not delete');
    toast.show('Deleted');
    qc.invalidateQueries({ queryKey: [key] });
  }

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <div className="space-y-5">
      {/* Training centers */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Training Centers</div>
        <div className="divide-y divide-hairline">
          {centers.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2 text-[13px]">
              <span className="font-medium">{c.name}</span>
              <span className="flex items-center gap-2 text-ink/45">
                {c.address}
                <DeleteX onClick={() => del('training_centers', c.id, 'settings-centers')} />
              </span>
            </div>
          ))}
          {!centers.length && <div className="py-2 text-[13px] text-ink/45">No centers yet.</div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={centerName} onChange={(e) => setCenterName(e.target.value)} placeholder="Center name" className={field} />
          <input value={centerAddr} onChange={(e) => setCenterAddr(e.target.value)} placeholder="Address" className={field} />
        </div>
        <Button size="sm" className="mt-2" onClick={addCenter}>+ Add center</Button>
      </Card>

      {/* Batches & time slots */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Batches &amp; Time Slots</div>
        <div className="divide-y divide-hairline">
          {batches.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-2 text-[13px]">
              <span className="font-medium">{b.name}</span>
              <span className="flex items-center gap-2 text-ink/45">
                {b.start_time?.slice(0, 5) ?? '—'}–{b.end_time?.slice(0, 5) ?? '—'}
                {b.center ? ` · ${b.center.name}` : ''}
                <DeleteX onClick={() => del('batches', b.id, 'settings-batches')} />
              </span>
            </div>
          ))}
          {!batches.length && <div className="py-2 text-[13px] text-ink/45">No batches yet.</div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Batch name (e.g. Elite Evening)" className={field} />
          <select value={batchCenter} onChange={(e) => setBatchCenter(e.target.value)} className={field}>
            <option value="">Center…</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="time" value={batchStart} onChange={(e) => setBatchStart(e.target.value)} className={field} />
          <input type="time" value={batchEnd} onChange={(e) => setBatchEnd(e.target.value)} className={field} />
        </div>
        <Button size="sm" className="mt-2" onClick={addBatch}>+ Add batch</Button>
      </Card>

      {/* Groups */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Groups</div>
        <div className="divide-y divide-hairline">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between py-2 text-[13px]">
              <span className="flex items-center gap-2 font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                {g.name}
              </span>
              <span className="flex items-center gap-2 text-ink/45">
                {g.age_category}
                <DeleteX onClick={() => del('groups', g.id, 'settings-groups')} />
              </span>
            </div>
          ))}
          {!groups.length && <div className="py-2 text-[13px] text-ink/45">No groups yet.</div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name (e.g. Elite)" className={field} />
          <input value={groupAge} onChange={(e) => setGroupAge(e.target.value)} placeholder="Age (e.g. Under 16)" className={field} />
          <select value={groupCenter} onChange={(e) => setGroupCenter(e.target.value)} className={field}>
            <option value="">Default center…</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <Button size="sm" className="mt-2" onClick={addGroup}>+ Add group</Button>
      </Card>

      {/* Assign coach to group */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Assign Coach to Group</div>
        <div className="grid grid-cols-2 gap-2">
          <select value={assignCoach} onChange={(e) => setAssignCoach(e.target.value)} className={field}>
            <option value="">Coach…</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <select value={assignGroup} onChange={(e) => setAssignGroup(e.target.value)} className={field}>
            <option value="">Group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <Button size="sm" className="mt-2" disabled={!assignCoach || !assignGroup} onClick={assignCoachToGroup}>
          Assign
        </Button>
      </Card>

      {/* Academy bank details */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Academy Bank Details</div>
        <p className="mb-3 text-[12px] text-ink/50">Shared with parents for transfers.</p>
        <div className="grid grid-cols-2 gap-2">
          {(['bankName', 'accountName', 'iban', 'accountNumber'] as const).map((k) => (
            <input
              key={k}
              value={bank[k] ?? ''}
              onChange={(e) => setBank((b) => ({ ...b, [k]: e.target.value }))}
              placeholder={{
                bankName: 'Bank name',
                accountName: 'Account name',
                iban: 'IBAN',
                accountNumber: 'Account number',
              }[k]}
              className={field}
            />
          ))}
        </div>
        <Button size="sm" className="mt-3" onClick={saveBank}>Save bank details</Button>
      </Card>
    </div>
  );
}

function MatchFeesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
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
