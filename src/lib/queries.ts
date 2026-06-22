import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  Group,
  Player,
  OneToOneBlock,
  AttendanceSession,
  Batch,
  Report,
  Profile,
  Match,
  MatchPlayer,
  Program,
  BadgeType,
  PlayerBadge,
} from './types';

// Centralised data hooks. RLS scopes every query to the caller's academy, so we
// never pass academy_id from the client — Postgres enforces tenancy.

/** The signed-in coach's assigned groups (coach_groups join). */
export function useMyGroups() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-groups', profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<Group[]> => {
      const { data, error } = await supabase
        .from('coach_groups')
        .select('group:groups(*)')
        .eq('coach_id', profile!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r) => (r as unknown as { group: Group }).group)
        .filter(Boolean);
    },
  });
}

/** Players in a set of groups (or all academy players if no filter). */
export function usePlayers(groupIds?: string[]) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['players', profile?.academy_id, groupIds?.join(',') ?? 'all'],
    enabled: !!profile,
    queryFn: async (): Promise<Player[]> => {
      let q = supabase.from('players').select('*').eq('status', 'active').order('full_name');
      if (groupIds && groupIds.length) q = q.in('group_id', groupIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Player[];
    },
  });
}

/** 1-on-1 blocks assigned to the signed-in coach, most-remaining first. */
export function useMyOneToOneBlocks() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['one-to-one', profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<(OneToOneBlock & { player: Player })[]> => {
      const { data, error } = await supabase
        .from('one_to_one_blocks')
        .select('*, player:players(*)')
        .eq('coach_id', profile!.id)
        .order('sessions_remaining', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (OneToOneBlock & { player: Player })[];
    },
  });
}

/** Pending attendance submissions (admin review queue). */
export function usePendingAttendance() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['attendance-pending', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<AttendanceSession[]> => {
      const { data, error } = await supabase
        .from('attendance_sessions')
        .select('*')
        .eq('status', 'pending')
        .order('session_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceSession[];
    },
  });
}

/** Reports authored by the signed-in coach. */
export function useMyReports() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['reports', profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<(Report & { player: Player })[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, player:players(*)')
        .eq('coach_id', profile!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (Report & { player: Player })[];
    },
  });
}

/** All coaches in the academy (head-coach / admin views). */
export function useCoaches() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['coaches', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'coach')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
}

/** Academy-wide reports with player + coach (head-coach All Reports view). */
export function useAllReports() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['all-reports', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<(Report & { player: Player; coach: Profile })[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, player:players(*), coach:profiles!reports_coach_id_fkey(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (Report & { player: Player; coach: Profile })[];
    },
  });
}

/** Matches with player-of-match, newest first. `mine` scopes to the coach. */
export function useMatches(mine = false) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['matches', profile?.academy_id, mine ? profile?.id : 'all'],
    enabled: !!profile,
    queryFn: async (): Promise<(Match & { pom: Player | null })[]> => {
      let q = supabase
        .from('matches')
        .select('*, pom:players!matches_player_of_match_fkey(*)')
        .order('match_date', { ascending: false });
      if (mine) q = q.eq('coach_id', profile!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (Match & { pom: Player | null })[];
    },
  });
}

/** Per-player scorecard for one match (the evidence record). */
export function useMatchScorecard(matchId: string | null) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['scorecard', matchId],
    enabled: !!profile && !!matchId,
    queryFn: async (): Promise<(MatchPlayer & { player: Player })[]> => {
      const { data, error } = await supabase
        .from('match_players')
        .select('*, player:players(*)')
        .eq('match_id', matchId!)
        .order('batting_position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as (MatchPlayer & { player: Player })[];
    },
  });
}

export type RankingStat = 'runs' | 'avg' | 'wickets' | 'sr';
export interface RankingRow {
  player: Player;
  runs: number;
  balls: number;
  wickets: number;
  innings: number;
  dismissals: number;
  avg: number;
  sr: number;
}

/** Season leaderboard aggregated from match_players, sorted by `stat`. */
export function useRankings(stat: RankingStat, groupId?: string) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['rankings', profile?.academy_id, stat, groupId ?? 'all'],
    enabled: !!profile,
    queryFn: async (): Promise<RankingRow[]> => {
      const { data, error } = await supabase
        .from('match_players')
        .select('runs, balls, wickets, how_out, player:players(*)');
      if (error) throw error;
      const rows = (data ?? []) as unknown as (Pick<MatchPlayer, 'runs' | 'balls' | 'wickets' | 'how_out'> & {
        player: Player;
      })[];

      const byPlayer = new Map<string, RankingRow>();
      for (const r of rows) {
        if (!r.player) continue;
        if (groupId && r.player.group_id !== groupId) continue;
        const cur =
          byPlayer.get(r.player.id) ??
          { player: r.player, runs: 0, balls: 0, wickets: 0, innings: 0, dismissals: 0, avg: 0, sr: 0 };
        cur.runs += r.runs ?? 0;
        cur.balls += r.balls ?? 0;
        cur.wickets += r.wickets ?? 0;
        // Count an innings only when the player actually batted — a
        // bowling/fielding-only appearance shouldn't inflate batting innings.
        const batted = (r.balls ?? 0) > 0 || (r.runs ?? 0) > 0 || !!r.how_out;
        if (batted) cur.innings += 1;
        if (r.how_out && r.how_out.toLowerCase() !== 'not out') cur.dismissals += 1;
        byPlayer.set(r.player.id, cur);
      }

      const out = [...byPlayer.values()].map((r) => ({
        ...r,
        avg: r.dismissals ? r.runs / r.dismissals : r.runs,
        sr: r.balls ? (r.runs / r.balls) * 100 : 0,
      }));

      const key: Record<RankingStat, (r: RankingRow) => number> = {
        runs: (r) => r.runs,
        avg: (r) => r.avg,
        wickets: (r) => r.wickets,
        sr: (r) => r.sr,
      };
      return out.sort((a, b) => key[stat](b) - key[stat](a));
    },
  });
}

/** Batches (time slots) that run a given group, ordered by start time. */
export function useBatchesForGroup(groupId: string | null) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['batches-for-group', profile?.academy_id, groupId],
    enabled: !!profile && !!groupId,
    queryFn: async (): Promise<Batch[]> => {
      const { data, error } = await supabase
        .from('batch_groups')
        .select('batch:batches(*)')
        .eq('group_id', groupId!);
      if (error) throw error;
      return (data ?? [])
        .map((r) => (r as unknown as { batch: Batch }).batch)
        .filter(Boolean)
        .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    },
  });
}

/** All academy groups (filters). */
export function useGroups() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['groups', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Group[]> => {
      const { data, error } = await supabase.from('groups').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as Group[];
    },
  });
}

/** Programs + enrolment counts. */
export function usePrograms() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['programs', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<(Program & { enrolled: number })[]> => {
      const { data, error } = await supabase
        .from('programs')
        .select('*, program_enrollments(count)')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((p) => {
        const row = p as Program & { program_enrollments: { count: number }[] };
        return { ...row, enrolled: row.program_enrollments?.[0]?.count ?? 0 };
      });
    },
  });
}

/** Global + academy badge catalogue. */
export function useBadgeTypes() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['badge-types', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<BadgeType[]> => {
      const { data, error } = await supabase.from('badge_types').select('*').order('category');
      if (error) throw error;
      return (data ?? []) as BadgeType[];
    },
  });
}

/** Earned badges (optionally only those awaiting manager approval). */
export function usePlayerBadges(pendingOnly = false) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['player-badges', profile?.academy_id, pendingOnly],
    enabled: !!profile,
    queryFn: async (): Promise<(PlayerBadge & { player: Player; badge: BadgeType })[]> => {
      let q = supabase
        .from('player_badges')
        .select('*, player:players(*), badge:badge_types(*)')
        .order('earned_at', { ascending: false });
      if (pendingOnly) q = q.eq('approval_status', 'pending');
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (PlayerBadge & { player: Player; badge: BadgeType })[];
    },
  });
}
