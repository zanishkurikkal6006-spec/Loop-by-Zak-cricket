import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  AcademyEvent, Campaign, Profile, Referral, School, SchoolActivity,
} from './types';

// Phase 3 data hooks. RLS scopes everything to the caller's academy.

export function useSchools() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['schools', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<School[]> => {
      const { data, error } = await supabase.from('schools').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as School[];
    },
  });
}

export function useSchoolActivities(schoolId: string | null) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['school-activities', schoolId],
    enabled: !!profile && !!schoolId,
    queryFn: async (): Promise<(SchoolActivity & { author: Profile | null })[]> => {
      const { data, error } = await supabase
        .from('school_activities')
        .select('*, author:profiles!school_activities_created_by_fkey(*)')
        .eq('school_id', schoolId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (SchoolActivity & { author: Profile | null })[];
    },
  });
}

export function useEvents() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['events', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<AcademyEvent[]> => {
      const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as AcademyEvent[];
    },
  });
}

export function useCampaigns() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['campaigns', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });
}

export function useReferrals() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['referrals', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Referral[]> => {
      const { data, error } = await supabase.from('referrals').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Referral[];
    },
  });
}
