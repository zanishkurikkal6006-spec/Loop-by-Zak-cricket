import { supabase } from './supabase';
import type { HealthResult } from './health';
import type { ChurnReason, IssueCategory } from './types';

// Labels + write helpers for Phase 2 (Retention & Parent Experience). Kept out
// of components so wording is consistent and the write paths are testable.

export const ISSUE_CATEGORIES: { key: IssueCategory; label: string }[] = [
  { key: 'coaching',        label: 'Coaching' },
  { key: 'schedule',        label: 'Schedule' },
  { key: 'payment',         label: 'Payment' },
  { key: 'communication',   label: 'Communication' },
  { key: 'facility',        label: 'Facility' },
  { key: 'match_selection', label: 'Match Selection' },
  { key: 'tournament',      label: 'Tournament' },
  { key: 'safety',          label: 'Safety' },
  { key: 'other',           label: 'Other' },
];

export const CHURN_REASONS: { key: ChurnReason; label: string }[] = [
  { key: 'price',                        label: 'Price' },
  { key: 'location',                     label: 'Location' },
  { key: 'timing',                       label: 'Timing' },
  { key: 'coach',                        label: 'Coach' },
  { key: 'school_pressure',              label: 'School Pressure' },
  { key: 'no_improvement',               label: 'No Improvement' },
  { key: 'insufficient_match_exposure',  label: 'Insufficient Match Exposure' },
  { key: 'child_lost_interest',          label: 'Child Lost Interest' },
  { key: 'moved_country',                label: 'Moved Country' },
  { key: 'joined_competitor',            label: 'Joined Competitor' },
  { key: 'facility',                     label: 'Facility' },
  { key: 'parent_experience',            label: 'Parent Experience' },
  { key: 'other',                        label: 'Other' },
];

export function issueCategoryLabel(c: IssueCategory): string {
  return ISSUE_CATEGORIES.find((x) => x.key === c)?.label ?? c;
}
export function churnReasonLabel(r: ChurnReason): string {
  return CHURN_REASONS.find((x) => x.key === r)?.label ?? r;
}

/** Target resolution window (hours) by priority — the SLA clock. */
export const ISSUE_SLA_HOURS: Record<string, number> = {
  critical: 4, high: 24, medium: 72, low: 168,
};

/** Mark a player exited: stamps the player inactive and records the reason. */
export async function markPlayerExited(input: {
  academyId: string;
  player: { id: string; lead_source: string | null; joined_at: string | null };
  reason: ChurnReason;
  detail?: string;
  recordedBy?: string | null;
}): Promise<void> {
  const cohort = input.player.joined_at ? input.player.joined_at.slice(0, 7) : null;
  const { error } = await supabase.from('churn_records').insert({
    academy_id: input.academyId,
    player_id: input.player.id,
    reason: input.reason,
    reason_detail: input.detail ?? null,
    lead_source: input.player.lead_source,
    join_cohort: cohort,
    recorded_by: input.recordedBy ?? null,
  });
  if (error) throw error;
  await supabase
    .from('players')
    .update({ status: 'inactive', exited_at: new Date().toISOString().slice(0, 10) })
    .eq('id', input.player.id);
}

/** Persist today's health snapshots for a set of players (trend history). */
export async function captureHealthSnapshots(
  academyId: string,
  rows: { playerId: string; health: HealthResult }[],
): Promise<number> {
  if (!rows.length) return 0;
  const snapshot_date = new Date().toISOString().slice(0, 10);
  const payload = rows.map((r) => ({
    academy_id: academyId,
    player_id: r.playerId,
    score: r.health.score,
    risk: r.health.risk,
    factors: r.health.factors,
    snapshot_date,
  }));
  // Upsert on (player_id, snapshot_date) so re-running the same day overwrites.
  const { error } = await supabase
    .from('player_health_snapshots')
    .upsert(payload, { onConflict: 'player_id,snapshot_date' });
  if (error) throw error;
  return payload.length;
}
