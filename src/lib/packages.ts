import { supabase } from './supabase';
import type { PaymentMode } from './types';

// Assign a package to a player AND record it in the finance ledger (payments),
// so package revenue shows up in Finance automatically. One place so every
// assign path (Payments tab, player detail, onboarding) behaves the same.
export interface AssignPackageInput {
  academyId: string;
  playerId: string;
  packageTypeId: string | null;
  sessionsTotal: number | null;
  sessionsUsed?: number;
  /** Ledger amount (e.g. package price). 0 / undefined ⇒ no payment row. */
  price?: number;
  /** true ⇒ confirmed payment; false ⇒ pending (outstanding). */
  paid: boolean;
  mode?: 'cash' | 'bank';
  source?: 'admin_assigned' | 'coach_added';
  assignedBy: string | null;
  centerId?: string | null;
  /** Net the player's accrued extra (no-package) sessions off this package. */
  netExtra?: boolean;
}

/** @returns how many already-taken extra sessions were netted into the package. */
export async function assignPackage(i: AssignPackageInput): Promise<number> {
  // Net any already-taken extra sessions off the new package up-front.
  let applied = 0;
  if (i.netExtra) {
    const { data: pl } = await supabase.from('players').select('extra_sessions').eq('id', i.playerId).single();
    const extra = (pl?.extra_sessions ?? 0) as number;
    applied = i.sessionsTotal == null ? extra : Math.min(i.sessionsTotal, extra);
  }

  const { data: pkg, error } = await supabase
    .from('packages')
    .insert({
      academy_id: i.academyId,
      player_id: i.playerId,
      package_type_id: i.packageTypeId,
      sessions_total: i.sessionsTotal,
      sessions_used: (i.sessionsUsed ?? 0) + applied,
      source: i.source ?? 'admin_assigned',
      payment_status: i.paid ? 'paid' : 'pending',
      assigned_by: i.assignedBy,
    })
    .select('id')
    .single();
  if (error) throw error;

  if (applied > 0) {
    const { data: pl2 } = await supabase.from('players').select('extra_sessions').eq('id', i.playerId).single();
    const cur = (pl2?.extra_sessions ?? 0) as number;
    await supabase.from('players').update({ extra_sessions: Math.max(0, cur - applied) }).eq('id', i.playerId);
  }

  const price = i.price ?? 0;
  if (price > 0) {
    const mode: PaymentMode = i.paid ? (i.mode ?? 'cash') : 'pending';
    const { error: payErr } = await supabase.from('payments').insert({
      academy_id: i.academyId,
      player_id: i.playerId,
      category: 'package',
      ref_id: pkg.id,
      amount: price,
      mode,
      status: i.paid ? 'confirmed' : 'pending',
      center_id: i.centerId ?? null,
      paid_at: i.paid ? new Date().toISOString().slice(0, 10) : null,
      confirmed_by: i.paid ? i.assignedBy : null,
    });
    if (payErr) throw payErr;
  }

  return applied;
}

interface PkgUsage {
  id: string;
  sessions_total: number | null;
  sessions_used: number;
  sessions_remaining: number | null;
}

// Apply a confirmed attendance session to session balances. For each marked
// player: decrement their active package (oldest first); if they have unlimited
// it just counts; if they have no package or run out, the remainder accrues as
// extra (no-package) sessions. Best-effort; called by admin confirm paths.
export async function applyAttendanceUsage(sessionId: string): Promise<void> {
  const { data: recs } = await supabase
    .from('attendance_records')
    .select('player_id, deduct_sessions')
    .eq('session_id', sessionId);
  const records = (recs ?? []) as { player_id: string; deduct_sessions: number }[];
  if (!records.length) return;

  const playerIds = [...new Set(records.map((r) => r.player_id))];
  const { data: pkgRows } = await supabase
    .from('packages')
    .select('id, player_id, sessions_total, sessions_used, sessions_remaining')
    .in('player_id', playerIds)
    .order('created_at', { ascending: true });

  const byPlayer = new Map<string, PkgUsage[]>();
  for (const p of (pkgRows ?? []) as (PkgUsage & { player_id: string })[]) {
    const arr = byPlayer.get(p.player_id) ?? [];
    arr.push(p);
    byPlayer.set(p.player_id, arr);
  }

  // Total sessions to apply per player (handles dedup deduct of 2).
  const deductByPlayer = new Map<string, number>();
  for (const r of records) {
    deductByPlayer.set(r.player_id, (deductByPlayer.get(r.player_id) ?? 0) + (r.deduct_sessions ?? 1));
  }

  for (const [pid, deduct] of deductByPlayer) {
    const pkgs = byPlayer.get(pid) ?? [];
    if (pkgs.some((p) => p.sessions_total === null)) continue; // unlimited: nothing to deduct

    let left = deduct;
    for (const p of pkgs) {
      if (left <= 0) break;
      const rem = p.sessions_remaining ?? (p.sessions_total ?? 0) - p.sessions_used;
      if (rem <= 0) continue;
      const take = Math.min(rem, left);
      await supabase.from('packages').update({ sessions_used: p.sessions_used + take }).eq('id', p.id);
      left -= take;
    }
    if (left > 0) {
      const { data: pl } = await supabase.from('players').select('extra_sessions').eq('id', pid).single();
      const cur = (pl?.extra_sessions ?? 0) as number;
      await supabase.from('players').update({ extra_sessions: cur + left }).eq('id', pid);
    }
  }
}
