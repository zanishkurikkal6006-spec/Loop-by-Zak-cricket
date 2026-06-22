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
}

export async function assignPackage(i: AssignPackageInput): Promise<void> {
  const { data: pkg, error } = await supabase
    .from('packages')
    .insert({
      academy_id: i.academyId,
      player_id: i.playerId,
      package_type_id: i.packageTypeId,
      sessions_total: i.sessionsTotal,
      sessions_used: i.sessionsUsed ?? 0,
      source: i.source ?? 'admin_assigned',
      payment_status: i.paid ? 'paid' : 'pending',
      assigned_by: i.assignedBy,
    })
    .select('id')
    .single();
  if (error) throw error;

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
}
