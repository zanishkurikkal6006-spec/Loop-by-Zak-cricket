import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCoaches } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { sendWhatsApp, templates } from '@/lib/whatsapp';
import { firstName } from '@/lib/utils';
import { ScreenTitle, Card, StatCard, Chip, Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { RingAvatar } from '@/components/brand/LoopRing';
import type { Profile, Report, Player } from '@/lib/types';

// Head Coach landing — development oversight across all coaches. NO finance.
// Per-coach card: sessions delivered, reports sent / pending, players, status.

interface CoachMetrics {
  coachId: string;
  sessions: number;
  reportsSent: number;
  reportsPending: number;
  players: number;
  lastReportAt: string | null;
}

export default function HeadCoachDashboard() {
  const { profile } = useAuth();
  const toast = useToast();
  const { data: coaches = [] } = useCoaches();

  const { data: metrics } = useQuery({
    queryKey: ['head-coach-metrics', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Record<string, CoachMetrics>> => {
      const [sessions, reports, groups] = await Promise.all([
        supabase.from('one_to_one_sessions').select('logged_by'),
        supabase.from('reports').select('coach_id, status, created_at'),
        supabase.from('coach_groups').select('coach_id, group_id'),
      ]);

      const acc: Record<string, CoachMetrics> = {};
      const get = (id: string) =>
        (acc[id] ??= { coachId: id, sessions: 0, reportsSent: 0, reportsPending: 0, players: 0, lastReportAt: null });

      for (const s of (sessions.data ?? []) as { logged_by: string | null }[]) {
        if (s.logged_by) get(s.logged_by).sessions += 1;
      }
      for (const r of (reports.data ?? []) as { coach_id: string; status: string; created_at: string }[]) {
        const m = get(r.coach_id);
        if (r.status === 'sent') m.reportsSent += 1;
        else m.reportsPending += 1;
        if (!m.lastReportAt || r.created_at > m.lastReportAt) m.lastReportAt = r.created_at;
      }
      // Players reachable per coach = players in that coach's groups.
      const groupRows = (groups.data ?? []) as { coach_id: string; group_id: string }[];
      const groupIds = [...new Set(groupRows.map((g) => g.group_id))];
      if (groupIds.length) {
        const { data: players } = await supabase
          .from('players')
          .select('group_id')
          .in('group_id', groupIds);
        const countByGroup = new Map<string, number>();
        for (const p of (players ?? []) as { group_id: string }[]) {
          countByGroup.set(p.group_id, (countByGroup.get(p.group_id) ?? 0) + 1);
        }
        for (const g of groupRows) {
          get(g.coach_id).players += countByGroup.get(g.group_id) ?? 0;
        }
      }
      return acc;
    },
  });

  const totalSessions = Object.values(metrics ?? {}).reduce((s, m) => s + m.sessions, 0);
  const totalSent = Object.values(metrics ?? {}).reduce((s, m) => s + m.reportsSent, 0);
  const totalPending = Object.values(metrics ?? {}).reduce((s, m) => s + m.reportsPending, 0);
  const [selected, setSelected] = useState<Profile | null>(null);

  const daysSince = (iso: string | null) =>
    iso == null ? null : Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);

  function remind(coach: Profile, days: number | null) {
    if (!profile) return;
    if (!coach.phone) return toast.show('No phone number on file for this coach');
    sendWhatsApp(coach.phone, templates.coachReminder(firstName(coach.full_name), days), {
      academyId: profile.academy_id,
      templateKey: 'coachReminder',
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Head Coach" title="Coaches" />
        <Chip tone="green">Development view · no finance</Chip>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Coaches" value={coaches.length} />
        <StatCard label="Sessions delivered" value={totalSessions} />
        <StatCard label="Reports sent" value={totalSent} tone="green" />
        <StatCard label="Reports pending" value={totalPending} tone={totalPending > 0 ? 'amber' : undefined} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {coaches.map((c) => {
          const m = metrics?.[c.id];
          const days = daysSince(m?.lastReportAt ?? null);
          const quiet = days == null || days >= 7;
          return (
            <Card key={c.id} className="flex cursor-pointer items-start gap-3" onClick={() => setSelected(c)}>
              <RingAvatar name={c.full_name} size={48} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-semibold">{c.full_name}</div>
                  <Chip tone={quiet ? 'amber' : 'green'}>
                    {days == null ? 'No reports yet' : days === 0 ? 'Reported today' : `${days}d since report`}
                  </Chip>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <Metric label="Sessions" value={m?.sessions ?? 0} />
                  <Metric label="Sent" value={m?.reportsSent ?? 0} />
                  <Metric label="Pending" value={m?.reportsPending ?? 0} />
                  <Metric label="Players" value={m?.players ?? 0} />
                </div>
                {quiet && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-3"
                    onClick={(e) => { e.stopPropagation(); remind(c, days); }}
                  >
                    Nudge to report
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
        {!coaches.length && <Card className="text-[13px] text-ink/45">No coaches yet.</Card>}
      </div>

      <CoachDetailModal coach={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// A coach's report stream (sent + draft). The head coach reviews & monitors —
// the coach still owns sending.
function CoachDetailModal({ coach, onClose }: { coach: Profile | null; onClose: () => void }) {
  const { data: reports = [] } = useQuery({
    queryKey: ['coach-reports', coach?.id],
    enabled: !!coach,
    queryFn: async (): Promise<(Report & { player: Player | null })[]> => {
      const { data } = await supabase
        .from('reports')
        .select('*, player:players(*)')
        .eq('coach_id', coach!.id)
        .order('created_at', { ascending: false });
      return (data ?? []) as (Report & { player: Player | null })[];
    },
  });

  return (
    <Modal open={!!coach} onClose={onClose} title={coach?.full_name ?? 'Coach'}>
      <div className="space-y-2">
        <p className="text-[12px] text-ink/55">
          You review &amp; monitor — the coach still owns sending.
        </p>
        {reports.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-card border border-cardborder bg-white px-3 py-2 text-[13px]">
            <div>
              <div className="font-medium">{r.player?.full_name ?? 'Player'}</div>
              <div className="text-[11px] text-ink/45">
                {r.type === 'quick' ? 'Quick feedback' : 'Development'} ·{' '}
                {new Date(r.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
              </div>
            </div>
            <Chip tone={r.status === 'sent' ? 'green' : 'amber'}>{r.status === 'sent' ? 'Sent' : 'Draft'}</Chip>
          </div>
        ))}
        {!reports.length && <div className="py-4 text-center text-[13px] text-ink/45">No reports yet.</div>}
      </div>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-eyebrow text-ink/40">{label}</div>
    </div>
  );
}
