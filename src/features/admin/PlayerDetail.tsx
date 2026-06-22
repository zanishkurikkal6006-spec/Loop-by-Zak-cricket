import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { Card, Chip, Button } from '@/components/ui';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { aed, counterState, stateColor, firstName } from '@/lib/utils';
import { sendWhatsApp, templates } from '@/lib/whatsapp';
import { assignPackage as assignPackage_ } from '@/lib/packages';
import { useToast } from '@/lib/toast';
import type { Package, PackageType, Payment, Report, PlayerBadge, BadgeType, Player } from '@/lib/types';

// Admin player profile — package & sessions ring, season stats, parent +
// Open WhatsApp, recent reports, earned badges, and the complete payment
// history (group / 1-on-1 / match fees with dates + mode of payment).

type PackageRow = Package & { package_type: PackageType | null };

const editField = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

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

  const { data: coaches = [] } = useQuery({
    queryKey: ['coaches', profile?.academy_id],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'coach').order('full_name');
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  // ── Assign a 1-on-1 block to a coach (admin-assigned) ──────────────────────
  const [assign1, setAssign1] = useState(false);
  const [oCoach, setOCoach] = useState('');
  const [oFocus, setOFocus] = useState('');
  const [oTotal, setOTotal] = useState('8');
  const [savingO, setSavingO] = useState(false);
  async function assignOneToOne() {
    if (!profile || !player || !oCoach || !Number(oTotal)) return;
    setSavingO(true);
    try {
      const { error } = await supabase.from('one_to_one_blocks').insert({
        academy_id: profile.academy_id,
        player_id: player.id,
        coach_id: oCoach,
        focus_note: oFocus.trim() || null,
        sessions_total: Number(oTotal),
        sessions_used: 0,
        source: 'admin_assigned',
        payment_status: 'paid',
        assigned_by: profile.id,
      });
      if (error) throw error;
      toast.show('1-on-1 block assigned');
      setAssign1(false);
      setOCoach('');
      setOFocus('');
      setOTotal('8');
      qc.invalidateQueries({ queryKey: ['one-to-one'] });
    } catch {
      toast.show('Could not assign 1-on-1');
    } finally {
      setSavingO(false);
    }
  }

  // Flip a pending package to paid and record the payment.
  async function markPackagePaid(p: PackageRow) {
    if (!profile || !player) return;
    const { error } = await supabase.from('packages').update({ payment_status: 'paid' }).eq('id', p.id);
    if (error) return toast.show('Could not update');
    if (Number(p.package_type?.price) > 0) {
      await supabase.from('payments').insert({
        academy_id: profile.academy_id,
        player_id: player.id,
        category: 'package',
        ref_id: p.id,
        amount: p.package_type?.price ?? 0,
        mode: 'cash',
        status: 'confirmed',
        paid_at: new Date().toISOString().slice(0, 10),
        confirmed_by: profile.id,
      });
    }
    toast.show('Marked paid');
    qc.invalidateQueries({ queryKey: ['player-package', player.id] });
    qc.invalidateQueries({ queryKey: ['player-payments', player.id] });
  }

  async function assignPackage() {
    if (!profile || !player || !typeId) return;
    const t = packageTypes.find((x) => x.id === typeId);
    if (!t) return;
    setSavingPkg(true);
    try {
      // Creates the package + finance entry, and nets any already-taken extra
      // (no-package) sessions off the new package.
      const applied = await assignPackage_({
        academyId: profile.academy_id,
        playerId: player.id,
        packageTypeId: t.id,
        sessionsTotal: t.sessions,
        price: Number(t.price) || 0,
        paid: payStatus === 'paid',
        mode: 'cash',
        assignedBy: profile.id,
        netExtra: true,
      });
      toast.show(applied > 0 ? `Package assigned · ${applied} extra deducted` : 'Package assigned');
      setAssigning(false);
      setTypeId('');
      qc.invalidateQueries({ queryKey: ['player-package', player.id] });
      qc.invalidateQueries({ queryKey: ['player-payments', player.id] });
      qc.invalidateQueries({ queryKey: ['admin-packages'] });
      qc.invalidateQueries({ queryKey: ['players'] });
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

  // Match history — the player's per-match evidence record.
  const { data: matchHistory = [] } = useQuery({
    queryKey: ['player-matches', player?.id],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('match_players')
        .select('*, match:matches(*)')
        .eq('player_id', player!.id)
        .order('created_at', { ascending: false });
      return (data ?? []) as (import('@/lib/types').MatchPlayer & {
        match: { opponent: string | null; match_date: string; result: string | null } | null;
      })[];
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', profile?.academy_id],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('groups').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // ── Edit the player's core fields ──────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ full_name: '', age: '', group_id: '', parent_name: '', parent_phone: '' });
  function startEdit() {
    if (!player) return;
    setEdit({
      full_name: player.full_name,
      age: player.age != null ? String(player.age) : '',
      group_id: player.group_id ?? '',
      parent_name: player.parent_name ?? '',
      parent_phone: player.parent_phone ?? '',
    });
    setEditing(true);
  }
  async function saveEdit() {
    if (!profile || !player || !edit.full_name.trim()) return;
    const { error } = await supabase
      .from('players')
      .update({
        full_name: edit.full_name.trim(),
        age: edit.age ? Number(edit.age) : null,
        group_id: edit.group_id || null,
        parent_name: edit.parent_name.trim() || null,
        parent_phone: edit.parent_phone.trim() || null,
      })
      .eq('id', player.id);
    if (error) return toast.show('Could not save');
    toast.show('Player updated');
    setEditing(false);
    qc.invalidateQueries({ queryKey: ['players'] });
  }

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
            <div className="mt-1 flex gap-2">
              {player.parent_phone && (
                <Button size="sm" variant="whatsapp" onClick={openWhatsApp}>
                  Open WhatsApp
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={startEdit}>Edit</Button>
            </div>
          </div>
        </div>

        {/* Edit player */}
        {editing && (
          <Card className="space-y-2">
            <div className="eyebrow text-ink/40">Edit player</div>
            <input value={edit.full_name} onChange={(e) => setEdit((s) => ({ ...s, full_name: e.target.value }))} placeholder="Full name" className={editField} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={edit.age} onChange={(e) => setEdit((s) => ({ ...s, age: e.target.value }))} placeholder="Age" className={editField} />
              <select value={edit.group_id} onChange={(e) => setEdit((s) => ({ ...s, group_id: e.target.value }))} className={editField}>
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <input value={edit.parent_name} onChange={(e) => setEdit((s) => ({ ...s, parent_name: e.target.value }))} placeholder="Parent name" className={editField} />
              <input value={edit.parent_phone} onChange={(e) => setEdit((s) => ({ ...s, parent_phone: e.target.value }))} placeholder="Parent WhatsApp" className={editField} />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button className="flex-1" disabled={!edit.full_name.trim()} onClick={saveEdit}>Save</Button>
            </div>
          </Card>
        )}

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
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Chip tone={state === 'healthy' ? 'green' : state === 'low' ? 'amber' : state === 'exhausted' ? 'red' : 'blue'}>
                  {state}
                </Chip>
                {pkg.payment_status === 'pending' && (
                  <>
                    <Chip tone="amber">Payment pending</Chip>
                    <button
                      onClick={() => markPackagePaid(pkg)}
                      className="rounded-chip border border-cardborder px-2 py-0.5 text-[11px] font-semibold text-success"
                    >
                      Mark paid
                    </button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="text-[13px] text-ink/45">No active package.</Card>
        )}

        {/* Extra (no-package) sessions taken — netted off the next package */}
        {player.extra_sessions > 0 && (
          <Card className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold">{player.extra_sessions} extra session{player.extra_sessions === 1 ? '' : 's'} taken</div>
              <div className="text-[11px] text-ink/45">Without a package · deducted from the next package bought</div>
            </div>
            <Chip tone="amber">Extra</Chip>
          </Card>
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

        {/* Assign a 1-on-1 block to a coach */}
        {!assign1 ? (
          <Button variant="ghost" onClick={() => setAssign1(true)}>🎯 Assign 1-on-1 to a coach</Button>
        ) : (
          <Card className="space-y-2">
            <div className="eyebrow text-ink/40">Assign 1-on-1</div>
            <select value={oCoach} onChange={(e) => setOCoach(e.target.value)} className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]">
              <option value="">Select coach…</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
            <input value={oFocus} onChange={(e) => setOFocus(e.target.value)} placeholder="Focus (optional)" className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]" />
            <input type="number" value={oTotal} onChange={(e) => setOTotal(e.target.value)} placeholder="Total sessions" className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]" />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setAssign1(false)}>Cancel</Button>
              <Button className="flex-1" disabled={savingO || !oCoach || !Number(oTotal)} onClick={assignOneToOne}>
                {savingO ? 'Assigning…' : 'Assign'}
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

        {/* Match history — evidence record */}
        {matchHistory.length > 0 && (
          <div>
            <div className="eyebrow mb-2 text-ink/40">Match history</div>
            <Card className="divide-y divide-hairline p-0">
              {matchHistory.map((m) => (
                <div key={m.id} className="px-3 py-2 text-[12.5px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">vs {m.match?.opponent ?? 'Opponent'}</span>
                    <span className="text-ink/55">
                      {m.runs ?? 0} ({m.balls ?? 0}){m.wickets ? ` · ${m.wickets}w` : ''}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink/45">
                    {m.match?.match_date ?? ''} · {m.how_out ?? '—'}
                  </div>
                  {m.coach_why_note && (
                    <div className="mt-1 rounded-chip bg-chip-gold px-2 py-1 text-[11px] text-gold-dark">
                      {m.coach_why_note}
                    </div>
                  )}
                </div>
              ))}
            </Card>
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
