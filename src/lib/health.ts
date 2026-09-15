import type { RiskLevel } from './types';

// ============================================================================
// Player Health Score — a TRANSPARENT, weighted signal that surfaces players
// needing human attention. It never decides a player will leave; it explains
// WHY a player looks at-risk so a human can act. Every penalty is labelled and
// shown to the user. Weights live here so they can be tuned in one place (a
// future AI Settings screen can expose them).
// ============================================================================

export interface HealthSignals {
  daysSinceLastSeen: number | null; // null = never marked present
  attendanceLast30: number;         // sessions attended in the last 30 days
  sessionsRemaining: number | null; // min across active packages; null = none/unlimited
  hasOutstandingPayment: boolean;
  openIssues: number;
  hasAssessment: boolean;
  daysToRenewal: number | null;     // null = no renewal date set
}

export interface HealthFactor {
  label: string;
  penalty: number;
}

export interface HealthResult {
  score: number;      // 0–100
  risk: RiskLevel;    // green ≥70 · amber 40–69 · red <40
  factors: HealthFactor[];
}

/** Compute a transparent health score from a player's signals. */
export function computeHealth(s: HealthSignals): HealthResult {
  const factors: HealthFactor[] = [];
  const add = (label: string, penalty: number) => { if (penalty > 0) factors.push({ label, penalty }); };

  // Recency — the strongest churn signal in a session business.
  if (s.daysSinceLastSeen == null) add('Never marked present', 30);
  else if (s.daysSinceLastSeen > 21) add(`Not seen in ${s.daysSinceLastSeen} days`, 35);
  else if (s.daysSinceLastSeen > 14) add(`Not seen in ${s.daysSinceLastSeen} days`, 25);
  else if (s.daysSinceLastSeen > 10) add(`Not seen in ${s.daysSinceLastSeen} days`, 15);

  // Attendance volume (last 30 days).
  if (s.daysSinceLastSeen != null) {
    if (s.attendanceLast30 === 0) add('No attendance in 30 days', 18);
    else if (s.attendanceLast30 === 1) add('Only 1 session in 30 days', 10);
  }

  // Package status.
  if (s.sessionsRemaining != null) {
    if (s.sessionsRemaining <= 0) add('Package exhausted', 15);
    else if (s.sessionsRemaining <= 2) add('Package running low', 8);
  }

  // Commercial + experience.
  if (s.hasOutstandingPayment) add('Payment outstanding', 12);
  if (s.openIssues > 0) add(`${s.openIssues} open complaint${s.openIssues === 1 ? '' : 's'}`, 20);
  if (!s.hasAssessment) add('No assessment on record', 5);

  // Renewal proximity (a nudge, not a crisis).
  if (s.daysToRenewal != null && s.daysToRenewal >= 0 && s.daysToRenewal <= 14) {
    add('Renewal due soon', 8);
  }

  const totalPenalty = factors.reduce((sum, f) => sum + f.penalty, 0);
  const score = Math.max(0, Math.min(100, 100 - totalPenalty));
  const risk: RiskLevel = score >= 70 ? 'green' : score >= 40 ? 'amber' : 'red';
  // Highest-penalty reason first, so the headline cause reads at a glance.
  factors.sort((a, b) => b.penalty - a.penalty);
  return { score, risk, factors };
}

export const RISK_TONE: Record<RiskLevel, 'green' | 'amber' | 'red'> = {
  green: 'green', amber: 'amber', red: 'red',
};
export const RISK_LABEL: Record<RiskLevel, string> = {
  green: 'Healthy', amber: 'Watch', red: 'At risk',
};
