import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  FollowUpTask, Lead, LeadActivity, Package, Player, Profile, Trial, TrialAssessment,
} from './types';

// Growth-Engine data hooks. RLS scopes every query to the caller's academy, so
// we never pass academy_id from the client — Postgres enforces tenancy.

const startOfMonthISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
const todayISO = () => new Date().toISOString().slice(0, 10);

/** All leads, newest first. */
export function useLeads() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['leads', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
}

/** A single lead's activity timeline, newest first (+ author name). */
export function useLeadActivities(leadId: string | null) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['lead-activities', leadId],
    enabled: !!profile && !!leadId,
    queryFn: async (): Promise<(LeadActivity & { author: Profile | null })[]> => {
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*, author:profiles!lead_activities_created_by_fkey(*)')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (LeadActivity & { author: Profile | null })[];
    },
  });
}

/** Trials with their assessment (if any) and coach, soonest first. */
export function useTrials() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['trials', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<(Trial & { assessment: TrialAssessment | null; coach: Profile | null })[]> => {
      const { data, error } = await supabase
        .from('trials')
        .select('*, assessment:trial_assessments(*), coach:profiles!trials_coach_id_fkey(*)')
        .order('trial_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as Trial & { assessment: TrialAssessment[]; coach: Profile | null };
        return { ...r, assessment: r.assessment?.[0] ?? null };
      });
    },
  });
}

/** Follow-up tasks (optionally filtered by status), with owner + lead. */
export function useFollowUps(status?: 'open' | 'done') {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['follow-ups', profile?.academy_id, status ?? 'all'],
    enabled: !!profile,
    queryFn: async (): Promise<(FollowUpTask & { owner: Profile | null; lead: Lead | null })[]> => {
      let q = supabase
        .from('follow_up_tasks')
        .select('*, owner:profiles!follow_up_tasks_owner_id_fkey(*), lead:leads(*)')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (FollowUpTask & { owner: Profile | null; lead: Lead | null })[];
    },
  });
}

/** All staff profiles (for owner / assignee pickers). */
export function useStaffMembers() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['staff-members', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
}

export interface CommandMetrics {
  activePlayers: number;
  exitedPlayers: number;
  newLeads30: number;
  trialsBooked: number;
  trialsAttendedMonth: number;
  newEnrolmentsMonth: number;
  renewalsDue: number;
  atRisk: number;
  monthRevenue: number;
  outstanding: number;
  arpu: number;
}

/** Executive Command Center metrics, computed from live academy data. */
export function useCommandMetrics() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['command-metrics', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<CommandMetrics> => {
      const monthStart = startOfMonthISO();
      const [players, leads, trials, packages, payments] = await Promise.all([
        supabase.from('players').select('id, status, last_seen_at, joined_at'),
        supabase.from('leads').select('id, stage, created_at'),
        supabase.from('trials').select('id, status, trial_date'),
        supabase.from('packages').select('id, sessions_remaining, sessions_total'),
        supabase.from('payments').select('amount, status, paid_at'),
      ]);

      const pl = (players.data ?? []) as Pick<Player, 'id' | 'status' | 'last_seen_at' | 'joined_at'>[];
      const active = pl.filter((p) => p.status === 'active');
      const cutoff = daysAgoISO(14).slice(0, 10);
      const atRisk = active.filter((p) => !p.last_seen_at || p.last_seen_at < cutoff).length;
      const newEnrolmentsMonth = pl.filter((p) => (p.joined_at ?? '') >= monthStart.slice(0, 10)).length;

      const ld = (leads.data ?? []) as { created_at: string }[];
      const newLeads30 = ld.filter((l) => l.created_at >= daysAgoISO(30)).length;

      const tr = (trials.data ?? []) as { status: string; trial_date: string }[];
      const trialsBooked = tr.filter((t) => t.status === 'scheduled').length;
      const trialsAttendedMonth = tr.filter(
        (t) => t.status === 'attended' && t.trial_date >= monthStart.slice(0, 10),
      ).length;

      const pk = (packages.data ?? []) as Pick<Package, 'sessions_remaining' | 'sessions_total'>[];
      const renewalsDue = pk.filter(
        (p) => p.sessions_total != null && p.sessions_remaining != null && p.sessions_remaining <= 2,
      ).length;

      const pay = (payments.data ?? []) as { amount: number; status: string; paid_at: string | null }[];
      const monthRevenue = pay
        .filter((p) => p.status === 'confirmed' && (p.paid_at ?? '') >= monthStart.slice(0, 10))
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const outstanding = pay
        .filter((p) => p.status !== 'confirmed')
        .reduce((s, p) => s + Number(p.amount || 0), 0);

      return {
        activePlayers: active.length,
        exitedPlayers: pl.length - active.length,
        newLeads30,
        trialsBooked,
        trialsAttendedMonth,
        newEnrolmentsMonth,
        renewalsDue,
        atRisk,
        monthRevenue,
        outstanding,
        arpu: active.length ? Math.round(monthRevenue / active.length) : 0,
      };
    },
  });
}

export type ActionKey =
  | 'new_leads' | 'overdue_followups' | 'todays_trials' | 'trials_to_assess'
  | 'renewals_due' | 'overdue_payments';

export interface ActionItem {
  key: ActionKey;
  label: string;
  count: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/** Today's operational action queue, derived live from academy data. */
export function useTodaysActions() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['todays-actions', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<ActionItem[]> => {
      const today = todayISO();
      const [leads, tasks, trials, assess, packages, payments] = await Promise.all([
        supabase.from('leads').select('id, stage'),
        supabase.from('follow_up_tasks').select('id, status, due_date'),
        supabase.from('trials').select('id, status, trial_date'),
        supabase.from('trial_assessments').select('trial_id'),
        supabase.from('packages').select('sessions_remaining, sessions_total'),
        supabase.from('payments').select('status'),
      ]);

      const ld = (leads.data ?? []) as { stage: string }[];
      const tk = (tasks.data ?? []) as { status: string; due_date: string | null }[];
      const tr = (trials.data ?? []) as { status: string; trial_date: string }[];
      const assessed = new Set((assess.data ?? []).map((a) => (a as { trial_id: string }).trial_id));
      const pk = (packages.data ?? []) as { sessions_remaining: number | null; sessions_total: number | null }[];
      const pay = (payments.data ?? []) as { status: string }[];

      const newLeads = ld.filter((l) => l.stage === 'new').length;
      const overdue = tk.filter((t) => t.status === 'open' && t.due_date && t.due_date < today).length;
      const todaysTrials = tr.filter((t) => t.trial_date === today && t.status === 'scheduled').length;
      const toAssess = (trials.data ?? []).filter(
        (t) => (t as { status: string; id: string }).status === 'attended'
          && !assessed.has((t as { id: string }).id),
      ).length;
      const renewals = pk.filter(
        (p) => p.sessions_total != null && p.sessions_remaining != null && p.sessions_remaining <= 2,
      ).length;
      const overduePay = pay.filter((p) => p.status !== 'confirmed').length;

      const items: ActionItem[] = [
        { key: 'overdue_followups', label: 'Overdue follow-ups',          count: overdue,      priority: 'critical' },
        { key: 'new_leads',         label: 'New leads to contact',        count: newLeads,     priority: 'high' },
        { key: 'todays_trials',     label: "Today's trials",              count: todaysTrials, priority: 'high' },
        { key: 'trials_to_assess',  label: 'Trials awaiting assessment',  count: toAssess,     priority: 'medium' },
        { key: 'renewals_due',      label: 'Renewals approaching',        count: renewals,     priority: 'medium' },
        { key: 'overdue_payments',  label: 'Outstanding payments',        count: overduePay,   priority: 'medium' },
      ];
      return items.filter((i) => i.count > 0);
    },
  });
}
