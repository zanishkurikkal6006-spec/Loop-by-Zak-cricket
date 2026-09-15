import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '@/contexts/AuthContext';
import { sourceLabel } from './crm';
import type { LeadSource, Profile, TrainingCenter, Venue } from './types';

// Phase 4 — Operations Intelligence hooks. All derived from existing tables;
// RLS scopes everything to the caller's academy. (The deterministic RPC layer
// the AI will call lands in Phase 5.)

const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

export interface RevenueIntel {
  today: number; week: number; month: number; total: number;
  outstanding: number; collectionPct: number; arpu: number;
  matchRevenue: number; groundRevenue: number;
  byCategory: { name: string; value: number }[];
  byCentre: { name: string; value: number }[];
  bySource: { name: string; value: number }[];
  ageing: { name: string; value: number }[];
}

const CATEGORY_LABEL: Record<string, string> = {
  package: 'Packages', one_to_one: '1-on-1', match_fee: 'Match Fees', ground_fee: 'Ground Fees',
};

export function useRevenueIntel() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['revenue-intel', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<RevenueIntel> => {
      const mStart = startOfMonth();
      const [payments, matchFees, groundFees, players, centers] = await Promise.all([
        supabase.from('payments').select('amount, status, paid_at, created_at, category, center_id, player:players(lead_source)'),
        supabase.from('match_fees').select('fee, state'),
        supabase.from('ground_fees').select('amount, paid_amount, status'),
        supabase.from('players').select('id, status').eq('status', 'active'),
        supabase.from('training_centers').select('id, name'),
      ]);

      const centerName = new Map((centers.data ?? []).map((c) => [(c as TrainingCenter).id, (c as TrainingCenter).name]));
      type PayRow = { amount: number; status: string; paid_at: string | null; created_at: string; category: string; center_id: string | null; player: { lead_source: string | null } | null };
      const pay = (payments.data ?? []) as unknown as PayRow[];
      const confirmed = pay.filter((p) => p.status === 'confirmed');

      const sumIf = (rows: PayRow[], pred: (p: PayRow) => boolean) =>
        rows.filter(pred).reduce((s, p) => s + Number(p.amount || 0), 0);

      const monthConfirmed = sumIf(confirmed, (p) => (p.paid_at ?? '') >= mStart);
      const outstandingPay = sumIf(pay, (p) => p.status !== 'confirmed');
      const matchRevenue = ((matchFees.data ?? []) as { fee: number; state: string }[])
        .filter((m) => m.state === 'confirmed').reduce((s, m) => s + Number(m.fee || 0), 0);
      const groundFeesRows = (groundFees.data ?? []) as { amount: number; paid_amount: number; status: string }[];
      const groundRevenue = groundFeesRows.reduce((s, g) => s + Number(g.paid_amount || 0), 0);
      const groundOutstanding = groundFeesRows.reduce((s, g) => s + Math.max(0, Number(g.amount || 0) - Number(g.paid_amount || 0)), 0);

      const outstanding = outstandingPay + groundOutstanding;
      const collectionBase = monthConfirmed + outstandingPay;

      const agg = (keyFn: (p: PayRow) => string) => {
        const m = new Map<string, number>();
        for (const p of confirmed) { const k = keyFn(p); m.set(k, (m.get(k) ?? 0) + Number(p.amount || 0)); }
        return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
      };

      // Payment ageing on outstanding (by created_at age).
      const ageBuckets = { '0–7 days': 0, '8–30 days': 0, '30+ days': 0 };
      for (const p of pay.filter((x) => x.status !== 'confirmed')) {
        const age = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400_000);
        if (age <= 7) ageBuckets['0–7 days'] += Number(p.amount || 0);
        else if (age <= 30) ageBuckets['8–30 days'] += Number(p.amount || 0);
        else ageBuckets['30+ days'] += Number(p.amount || 0);
      }

      const activeCount = (players.data ?? []).length;

      return {
        today: sumIf(confirmed, (p) => p.paid_at === today()),
        week: sumIf(confirmed, (p) => (p.paid_at ?? '') >= daysAgo(7)),
        month: monthConfirmed,
        total: sumIf(confirmed, () => true),
        outstanding,
        collectionPct: collectionBase > 0 ? Math.round((monthConfirmed / collectionBase) * 100) : 100,
        arpu: activeCount ? Math.round(monthConfirmed / activeCount) : 0,
        matchRevenue, groundRevenue,
        byCategory: agg((p) => CATEGORY_LABEL[p.category] ?? p.category),
        byCentre: agg((p) => (p.center_id ? centerName.get(p.center_id) ?? 'Centre' : 'Unassigned')),
        bySource: agg((p) => (p.player?.lead_source ? sourceLabel(p.player.lead_source as LeadSource) : 'Unknown')),
        ageing: Object.entries(ageBuckets).map(([name, value]) => ({ name, value })),
      };
    },
  });
}

export type CapacityBand = 'under' | 'healthy' | 'warning' | 'critical' | 'unset';
export interface CapacityRow {
  batchId: string; name: string; centre: string; time: string;
  registered: number; capacity: number | null; utilization: number | null; band: CapacityBand;
}

export function capacityBand(util: number | null): CapacityBand {
  if (util == null) return 'unset';
  if (util < 60) return 'under';
  if (util <= 85) return 'healthy';
  if (util <= 95) return 'warning';
  return 'critical';
}

export function useCapacity() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['capacity', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<CapacityRow[]> => {
      const [batches, batchGroups, players, centers] = await Promise.all([
        supabase.from('batches').select('id, name, center_id, start_time, end_time, capacity'),
        supabase.from('batch_groups').select('batch_id, group_id'),
        supabase.from('players').select('id, group_id, status').eq('status', 'active'),
        supabase.from('training_centers').select('id, name'),
      ]);

      const centerName = new Map((centers.data ?? []).map((c) => [(c as TrainingCenter).id, (c as TrainingCenter).name]));
      const perGroup = new Map<string, number>();
      for (const p of (players.data ?? []) as { group_id: string | null }[]) {
        if (p.group_id) perGroup.set(p.group_id, (perGroup.get(p.group_id) ?? 0) + 1);
      }
      const groupsByBatch = new Map<string, string[]>();
      for (const bg of (batchGroups.data ?? []) as { batch_id: string; group_id: string }[]) {
        const arr = groupsByBatch.get(bg.batch_id) ?? [];
        arr.push(bg.group_id); groupsByBatch.set(bg.batch_id, arr);
      }

      return ((batches.data ?? []) as { id: string; name: string; center_id: string | null; start_time: string | null; end_time: string | null; capacity: number | null }[])
        .map((b) => {
          const registered = (groupsByBatch.get(b.id) ?? []).reduce((s, g) => s + (perGroup.get(g) ?? 0), 0);
          const utilization = b.capacity ? Math.round((registered / b.capacity) * 100) : null;
          return {
            batchId: b.id, name: b.name,
            centre: b.center_id ? centerName.get(b.center_id) ?? 'Centre' : 'Unassigned',
            time: [b.start_time?.slice(0, 5), b.end_time?.slice(0, 5)].filter(Boolean).join('–') || '—',
            registered, capacity: b.capacity, utilization, band: capacityBand(utilization),
          };
        })
        .sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1));
    },
  });
}

export interface CoachScore {
  coach: Profile;
  sessions: number; playersCoached: number; groups: number; avgGroupSize: number;
  reports: number; reportsSent: number; assessments: number; daysSinceReport: number | null;
}

export function useCoachUtilization() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['coach-utilization', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<CoachScore[]> => {
      const [coaches, sessions, reports, assessments, trialAssess, coachGroups, players] = await Promise.all([
        supabase.from('profiles').select('*').in('role', ['coach', 'head_coach']).order('full_name'),
        supabase.from('attendance_sessions').select('coach_id, credited_coach_id'),
        supabase.from('reports').select('coach_id, status, created_at'),
        supabase.from('assessments').select('coach_id'),
        supabase.from('trial_assessments').select('coach_id'),
        supabase.from('coach_groups').select('coach_id, group_id'),
        supabase.from('players').select('group_id, status').eq('status', 'active'),
      ]);

      const perGroup = new Map<string, number>();
      for (const p of (players.data ?? []) as { group_id: string | null }[]) {
        if (p.group_id) perGroup.set(p.group_id, (perGroup.get(p.group_id) ?? 0) + 1);
      }
      const groupsByCoach = new Map<string, string[]>();
      for (const cg of (coachGroups.data ?? []) as { coach_id: string; group_id: string }[]) {
        const arr = groupsByCoach.get(cg.coach_id) ?? []; arr.push(cg.group_id); groupsByCoach.set(cg.coach_id, arr);
      }
      const sessCount = new Map<string, number>();
      for (const s of (sessions.data ?? []) as { coach_id: string | null; credited_coach_id: string | null }[]) {
        const id = s.credited_coach_id ?? s.coach_id;
        if (id) sessCount.set(id, (sessCount.get(id) ?? 0) + 1);
      }
      const repByCoach = new Map<string, { total: number; sent: number; last: string | null }>();
      for (const r of (reports.data ?? []) as { coach_id: string; status: string; created_at: string }[]) {
        const cur = repByCoach.get(r.coach_id) ?? { total: 0, sent: 0, last: null };
        cur.total += 1; if (r.status === 'sent') cur.sent += 1;
        if (!cur.last || r.created_at > cur.last) cur.last = r.created_at;
        repByCoach.set(r.coach_id, cur);
      }
      const countBy = (rows: { coach_id: string | null }[]) => {
        const m = new Map<string, number>();
        for (const r of rows) if (r.coach_id) m.set(r.coach_id, (m.get(r.coach_id) ?? 0) + 1);
        return m;
      };
      const assessCount = countBy((assessments.data ?? []) as { coach_id: string | null }[]);
      const trialCount = countBy((trialAssess.data ?? []) as { coach_id: string | null }[]);

      return ((coaches.data ?? []) as Profile[]).map((coach) => {
        const groups = groupsByCoach.get(coach.id) ?? [];
        const playersCoached = groups.reduce((s, g) => s + (perGroup.get(g) ?? 0), 0);
        const rep = repByCoach.get(coach.id);
        const daysSinceReport = rep?.last ? Math.floor((Date.now() - new Date(rep.last).getTime()) / 86400_000) : null;
        return {
          coach,
          sessions: sessCount.get(coach.id) ?? 0,
          playersCoached, groups: groups.length,
          avgGroupSize: groups.length ? Math.round(playersCoached / groups.length) : 0,
          reports: rep?.total ?? 0, reportsSent: rep?.sent ?? 0,
          assessments: (assessCount.get(coach.id) ?? 0) + (trialCount.get(coach.id) ?? 0),
          daysSinceReport,
        };
      });
    },
  });
}

export interface VenueEconomics { players: number; monthRevenue: number; }

export function useVenues() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['venues', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<{ venues: Venue[]; econ: Record<string, VenueEconomics>; centers: TrainingCenter[] }> => {
      const mStart = startOfMonth();
      const [venuesRes, players, payments, centers] = await Promise.all([
        supabase.from('venues').select('*').order('created_at', { ascending: false }),
        supabase.from('players').select('center_id, status').eq('status', 'active'),
        supabase.from('payments').select('amount, status, paid_at, center_id'),
        supabase.from('training_centers').select('*').order('name'),
      ]);

      const econ: Record<string, VenueEconomics> = {};
      const bump = (cid: string | null, patch: Partial<VenueEconomics>) => {
        if (!cid) return;
        econ[cid] = { players: (econ[cid]?.players ?? 0) + (patch.players ?? 0), monthRevenue: (econ[cid]?.monthRevenue ?? 0) + (patch.monthRevenue ?? 0) };
      };
      for (const p of (players.data ?? []) as { center_id: string | null }[]) bump(p.center_id, { players: 1 });
      for (const p of (payments.data ?? []) as { amount: number; status: string; paid_at: string | null; center_id: string | null }[]) {
        if (p.status === 'confirmed' && (p.paid_at ?? '') >= mStart) bump(p.center_id, { monthRevenue: Number(p.amount || 0) });
      }

      return {
        venues: (venuesRes.data ?? []) as Venue[],
        econ,
        centers: (centers.data ?? []) as TrainingCenter[],
      };
    },
  });
}
