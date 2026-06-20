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
  coach: [
    { to: '/coach', label: 'Home', icon: 'home' },
    { to: '/coach/one-to-one', label: '1-on-1', icon: 'target' },
    { to: '/coach/attendance', label: 'Attend', icon: 'check' },
    { to: '/coach/matches', label: 'Matches', icon: 'trophy' },
    { to: '/coach/rankings', label: 'Ranking', icon: 'chart' },
    { to: '/coach/reports', label: 'Reports', icon: 'message' },
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
  ],
};

export const roleHome: Record<UserRole, string> = {
  coach: '/coach',
  head_coach: '/head-coach',
  admin: '/admin',
};

export const roleLabel: Record<UserRole, string> = {
  coach: 'Coach',
  head_coach: 'Head Coach',
  admin: 'Admin',
};
