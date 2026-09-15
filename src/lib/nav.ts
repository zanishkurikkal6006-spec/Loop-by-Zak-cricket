import type { UserRole } from './types';

export interface NavItem {
  to: string;
  label: string;
  /** Simple line-icon key rendered by the shell. */
  icon: string;
  badgeKey?: string; // e.g. attendance pending count
}

// Nav per role, matching the design handoff.
export const navByRole: Record<UserRole, NavItem[]> = {
  // ── Director — strategy & business visibility (not routine attendance) ──
  director: [
    { to: '/director', label: 'Command', icon: 'sparkles' },
    { to: '/director/actions', label: 'Today', icon: 'check', badgeKey: 'todaysActions' },
    { to: '/director/leads', label: 'Lead CRM', icon: 'trending' },
    { to: '/director/trials', label: 'Trials', icon: 'calendar' },
    { to: '/director/followups', label: 'Follow-ups', icon: 'inbox' },
    { to: '/director/players', label: 'Players', icon: 'users' },
    { to: '/director/retention', label: 'Retention', icon: 'heart' },
    { to: '/director/experience', label: 'Experience', icon: 'message' },
    { to: '/director/churn', label: 'Churn', icon: 'chart' },
    { to: '/director/revenue', label: 'Revenue', icon: 'wallet' },
  ],
  // ── Operations Manager — full operational control ──
  operations_manager: [
    { to: '/ops', label: 'Command', icon: 'sparkles' },
    { to: '/ops/actions', label: 'Today', icon: 'check', badgeKey: 'todaysActions' },
    { to: '/ops/leads', label: 'Lead CRM', icon: 'trending' },
    { to: '/ops/trials', label: 'Trials', icon: 'calendar' },
    { to: '/ops/followups', label: 'Follow-ups', icon: 'inbox' },
    { to: '/ops/players', label: 'Players', icon: 'users' },
    { to: '/ops/attendance', label: 'Attendance', icon: 'check', badgeKey: 'attendancePending' },
    { to: '/ops/retention', label: 'Retention', icon: 'heart' },
    { to: '/ops/experience', label: 'Experience', icon: 'message' },
    { to: '/ops/churn', label: 'Churn', icon: 'chart' },
    { to: '/ops/payments', label: 'Payments', icon: 'card' },
  ],
  coach: [
    { to: '/coach', label: 'Home', icon: 'home' },
    { to: '/coach/one-to-one', label: '1-on-1', icon: 'target' },
    { to: '/coach/attendance', label: 'Attendance', icon: 'check' },
    { to: '/coach/matches', label: 'Matches', icon: 'trophy' },
    { to: '/coach/rankings', label: 'Ranking', icon: 'chart' },
    { to: '/coach/reports', label: 'Reports', icon: 'message' },
    { to: '/coach/assessment', label: 'Assess', icon: 'badge' },
  ],
  head_coach: [
    { to: '/head-coach', label: 'Coaches', icon: 'users' },
    { to: '/head-coach/reports', label: 'All Reports', icon: 'message' },
    { to: '/head-coach/flags', label: 'Flags', icon: 'flag' },
    { to: '/head-coach/matches', label: 'Matches', icon: 'trophy' },
    { to: '/head-coach/rankings', label: 'Rankings', icon: 'chart' },
    { to: '/head-coach/badges', label: 'Badges', icon: 'badge' },
  ],
  admin: [
    { to: '/admin', label: 'Home', icon: 'home' },
    { to: '/admin/players', label: 'Players', icon: 'users' },
    { to: '/admin/finance', label: 'Finance', icon: 'wallet' },
    { to: '/admin/attendance', label: 'Attendance', icon: 'check', badgeKey: 'attendancePending' },
    { to: '/admin/payments', label: 'Payments', icon: 'card' },
    { to: '/admin/programs', label: 'Programs', icon: 'grid' },
    { to: '/admin/badges', label: 'Badges', icon: 'badge' },
    { to: '/admin/settings', label: 'Settings', icon: 'settings' },
  ],
};

export const roleHome: Record<UserRole, string> = {
  director: '/director',
  operations_manager: '/ops',
  coach: '/coach',
  head_coach: '/head-coach',
  admin: '/admin',
};

export const roleLabel: Record<UserRole, string> = {
  director: 'Director',
  operations_manager: 'Operations Manager',
  coach: 'Coach',
  head_coach: 'Head Coach',
  admin: 'Admin',
};
