import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '@/contexts/AuthContext';
import { computeHealth, type HealthResult, type HealthSignals } from './health';
import type { ChurnRecord, Issue, Player, Profile } from './types';

// Phase 2 data hooks. RLS scopes everything to the caller's academy.

const daysBetween = (iso: string | null): number | null => {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400_000);
};
const daysUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / 86400_000);
};

export interface RetentionRow {
  player: Player;
  health: HealthResult;
  signals: HealthSignals;
}

/** Every active player scored for retention risk, worst first. */
export function useRetention() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['retention', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<RetentionRow[]> => {
      const since30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
      const [players, packages, payments, issues, assessments, attendance] = await Promise.all([
        supabase.from('players').select('*').eq('status', 'active'),
        supabase.from('packages').select('player_id, sessions_remaining, sessions_total'),
        supabase.from('payments').select('player_id, status'),
        supabase.from('issues').select('player_id, status').eq('status', 'open'),
        supabase.from('assessments').select('player_id'),
        supabase
          .from('attendance_records')
          .select('player_id, session:attendance_sessions(session_date)'),
      ]);

      const pl = (players.data ?? []) as Player[];

      // Min remaining sessions per player across standard (non-null) packages.
      const minRemaining = new Map<string, number>();
      for (const p of (packages.data ?? []) as { player_id: string; sessions_remaining: number | null; sessions_total: number | null }[]) {
        if (p.sessions_total == null || p.sessions_remaining == null) continue;
        const cur = minRemaining.get(p.player_id);
        minRemaining.set(p.player_id, cur == null ? p.sessions_remaining : Math.min(cur, p.sessions_remaining));
      }

      const outstanding = new Set<string>();
      for (const p of (payments.data ?? []) as { player_id: string | null; status: string }[]) {
        if (p.player_id && p.status !== 'confirmed') outstanding.add(p.player_id);
      }

      const openIssues = new Map<string, number>();
      for (const i of (issues.data ?? []) as { player_id: string | null }[]) {
        if (i.player_id) openIssues.set(i.player_id, (openIssues.get(i.player_id) ?? 0) + 1);
      }

      const assessed = new Set((assessments.data ?? []).map((a) => (a as { player_id: string }).player_id));

      const attend30 = new Map<string, number>();
      for (const r of (attendance.data ?? []) as unknown as { player_id: string; session: { session_date: string } | null }[]) {
        if (r.session && r.session.session_date >= since30) {
          attend30.set(r.player_id, (attend30.get(r.player_id) ?? 0) + 1);
        }
      }

      const rows = pl.map((player) => {
        const signals: HealthSignals = {
          daysSinceLastSeen: daysBetween(player.last_seen_at),
          attendanceLast30: attend30.get(player.id) ?? 0,
          sessionsRemaining: minRemaining.has(player.id) ? minRemaining.get(player.id)! : null,
          hasOutstandingPayment: outstanding.has(player.id),
          openIssues: openIssues.get(player.id) ?? 0,
          hasAssessment: assessed.has(player.id),
          daysToRenewal: daysUntil(player.renewal_date),
        };
        return { player, health: computeHealth(signals), signals };
      });

      return rows.sort((a, b) => a.health.score - b.health.score);
    },
  });
}

/** Issues & feedback (optionally by status), with player + owner. */
export function useIssues(status?: 'open' | 'resolved') {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['issues', profile?.academy_id, status ?? 'all'],
    enabled: !!profile,
    queryFn: async (): Promise<(Issue & { player: Player | null; owner: Profile | null })[]> => {
      let q = supabase
        .from('issues')
        .select('*, player:players(*), owner:profiles!issues_owner_id_fkey(*)')
        .order('created_at', { ascending: false });
      if (status === 'open') q = q.neq('status', 'resolved');
      if (status === 'resolved') q = q.eq('status', 'resolved');
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (Issue & { player: Player | null; owner: Profile | null })[];
    },
  });
}

export interface TimelineEvent {
  id: string;
  at: string;
  kind: 'attendance' | 'report' | 'assessment' | 'badge' | 'payment' | 'message' | 'issue';
  title: string;
  detail?: string;
}

/** A unified family/player interaction timeline for one player. */
export function useParentTimeline(playerId: string | null) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['parent-timeline', playerId],
    enabled: !!profile && !!playerId,
    queryFn: async (): Promise<TimelineEvent[]> => {
      const [reports, assessments, badges, messages, issues] = await Promise.all([
        supabase.from('reports').select('id, type, status, created_at, sent_at').eq('player_id', playerId!),
        supabase.from('assessments').select('id, assessment_date, created_at').eq('player_id', playerId!),
        supabase.from('player_badges').select('id, earned_at, badge:badge_types(name)').eq('player_id', playerId!),
        supabase.from('outbound_messages').select('id, template_key, body, created_at').eq('player_id', playerId!),
        supabase.from('issues').select('id, title, category, status, created_at').eq('player_id', playerId!),
      ]);

      const events: TimelineEvent[] = [];
      for (const r of (reports.data ?? []) as { id: string; type: string; status: string; created_at: string; sent_at: string | null }[]) {
        events.push({ id: `r${r.id}`, at: r.sent_at ?? r.created_at, kind: 'report', title: `${r.type === 'development' ? 'Development' : 'Quick'} report`, detail: r.status === 'sent' ? 'Sent to parent' : 'Draft' });
      }
      for (const a of (assessments.data ?? []) as { id: string; assessment_date: string; created_at: string }[]) {
        events.push({ id: `a${a.id}`, at: a.created_at, kind: 'assessment', title: '3-month assessment', detail: a.assessment_date });
      }
      for (const b of (badges.data ?? []) as unknown as { id: string; earned_at: string; badge: { name: string } | null }[]) {
        events.push({ id: `b${b.id}`, at: b.earned_at, kind: 'badge', title: `Badge · ${b.badge?.name ?? 'Achievement'}` });
      }
      for (const m of (messages.data ?? []) as { id: string; template_key: string | null; body: string | null; created_at: string }[]) {
        events.push({ id: `m${m.id}`, at: m.created_at, kind: 'message', title: 'WhatsApp message', detail: (m.body ?? '').slice(0, 80) });
      }
      for (const i of (issues.data ?? []) as { id: string; title: string; status: string; created_at: string }[]) {
        events.push({ id: `i${i.id}`, at: i.created_at, kind: 'issue', title: `Issue · ${i.title}`, detail: i.status });
      }
      return events.sort((x, y) => (y.at ?? '').localeCompare(x.at ?? ''));
    },
  });
}

/** Churn records with player, for the churn analysis screen. */
export function useChurn() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['churn', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<(ChurnRecord & { player: Player | null })[]> => {
      const { data, error } = await supabase
        .from('churn_records')
        .select('*, player:players(*)')
        .order('exit_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (ChurnRecord & { player: Player | null })[];
    },
  });
}
