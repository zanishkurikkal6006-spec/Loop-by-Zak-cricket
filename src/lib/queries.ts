import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  Group,
  Player,
  OneToOneBlock,
  AttendanceSession,
  Report,
  Profile,
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
