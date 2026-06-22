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

// Accrue extra (no-package) sessions for a confirmed attendance session: every
// marked player WITHOUT a usable package gets their deduct counted onto
// players.extra_sessions. Best-effort; called by admin confirm paths.
export async function accrueExtraSessions(sessionId: string): Promise<void> {
  const { data: recs } = await supabase
    .from('attendance_records')
    .select('player_id, deduct_sessions')
    .eq('session_id', sessionId);
  const records = (recs ?? []) as { player_id: string; deduct_sessions: number }[];
  if (!records.length) return;

  const playerIds = [...new Set(records.map((r) => r.player_id))];
  const { data: pkgs } = await supabase
    .from('packages')
    .select('player_id, sessions_remaining, sessions_total')
    .in('player_id', playerIds);
  const usable = new Set<string>();
  for (const p of (pkgs ?? []) as { player_id: string; sessions_remaining: number | null; sessions_total: number | null }[]) {
    if (p.sessions_total === null || (p.sessions_remaining ?? 0) > 0) usable.add(p.player_id);
  }

  const inc = new Map<string, number>();
  for (const r of records) {
    if (usable.has(r.player_id)) continue;
    inc.set(r.player_id, (inc.get(r.player_id) ?? 0) + (r.deduct_sessions ?? 1));
  }

  for (const [pid, n] of inc) {
    const { data: pl } = await supabase.from('players').select('extra_sessions').eq('id', pid).single();
    const cur = (pl?.extra_sessions ?? 0) as number;
    await supabase.from('players').update({ extra_sessions: cur + n }).eq('id', pid);
  }
}
