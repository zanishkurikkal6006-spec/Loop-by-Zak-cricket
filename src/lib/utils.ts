/** Tiny classnames helper (no dependency). Falsy values are dropped. */
export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Format a number as AED currency. */
export function aed(amount: number): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** First name only — reports always address the child by first name. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Time-aware greeting for the coach home screen. */
export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Derive a package counter state from remaining sessions. */
export type CounterState = 'healthy' | 'low' | 'exhausted' | 'unlimited' | 'comp';

export function counterState(
  remaining: number | null,
  kind: 'standard' | 'unlimited' | 'complimentary',
): CounterState {
  if (kind === 'unlimited') return 'unlimited';
  if (kind === 'complimentary') return 'comp';
  if (remaining == null) return 'unlimited';
  if (remaining <= 0) return 'exhausted';
  if (remaining <= 2) return 'low';
  return 'healthy';
}

/**
 * Human wording for WHY a renewal/retention follow-up exists, from the player's
 * package position. Shown on the follow-up task so it's clear what to discuss.
 *   remaining: min sessions left across active packages (null = no active package)
 *   extra:     ad-hoc sessions taken without a package (players.extra_sessions)
 */
export function renewalContext(remaining: number | null, extra: number): string {
  if (remaining != null && remaining > 2) return `${remaining} sessions left`;
  if (remaining != null && remaining > 0)
    return `${remaining} session${remaining === 1 ? '' : 's'} left — renewal due`;
  const parts: string[] = [];
  if (remaining != null && remaining <= 0) parts.push('Package complete — 0 sessions left');
  else if (remaining == null) parts.push('No active package');
  if (extra > 0) parts.push(`${extra} extra session${extra === 1 ? '' : 's'} taken`);
  return parts.join(' · ');
}

/** Ring color for a counter / tracker state. */
export function stateColor(state: CounterState | 'present' | 'late'): string {
  switch (state) {
    case 'healthy':
    case 'present':
      return '#1F8A4C';
    case 'low':
    case 'late':
      return '#C9A84C';
    case 'exhausted':
      return '#B3261E';
    case 'unlimited':
      return '#2563EB';
    case 'comp':
      return '#7C3AED';
    default:
      return '#C9A84C';
  }
}
