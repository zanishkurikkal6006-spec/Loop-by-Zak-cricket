import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePendingAttendance } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import type { AttendanceRecord, AttendanceSession, Player } from '@/lib/types';

// Admin Attendance — Pending review queue. Confirm a coach's submission, which
// flips it to confirmed and (in production) fires the parent WhatsApp messages.
export default function AdminAttendance() {
  const { data: pending = [] } = usePendingAttendance();

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Admin" title="Attendance" />
      <div className="eyebrow">Pending · {pending.length}</div>
      <div className="space-y-3">
        {pending.map((session) => (
          <PendingCard key={session.id} session={session} />
        ))}
        {!pending.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">
            Nothing awaiting confirmation.
          </div>
        )}
      </div>
    </div>
  );
}

function PendingCard({ session }: { session: AttendanceSession }) {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const records = useQuery({
    queryKey: ['attendance-records', session.id],
    queryFn: async (): Promise<(AttendanceRecord & { player: Player })[]> => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, player:players(*)')
        .eq('session_id', session.id);
      if (error) throw error;
      return (data ?? []) as (AttendanceRecord & { player: Player })[];
    },
  });

  const rows = records.data ?? [];
  const present = rows.filter((r) => r.state === 'present').length;
  const late = rows.filter((r) => r.state === 'late').length;

  const confirm = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      const { error } = await supabase
        .from('attendance_sessions')
        .update({ status: 'confirmed', confirmed_by: profile.id })
        .eq('id', session.id);
      if (error) throw error;
      // Production: enqueue parent WhatsApp messages here (outbound_messages).
    },
    onSuccess: () => {
      toast.show('Confirmed · WhatsApp sent to parents');
      queryClient.invalidateQueries({ queryKey: ['attendance-pending'] });
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not confirm'),
  });

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold">{session.session_date}</div>
          <div className="mt-1 flex gap-2">
            <Chip tone="green">{present} Present</Chip>
            <Chip tone="amber">{late} Late</Chip>
          </div>
        </div>
        <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
          Confirm &amp; Send
        </Button>
      </div>
      <div className="mt-3 divide-y divide-hairline">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2">
            <span className="text-[13px]">{r.player?.full_name}</span>
            <Chip tone={r.state === 'present' ? 'green' : 'amber'}>
              {r.state === 'present' ? 'Present' : 'Late'}
            </Chip>
          </div>
        ))}
      </div>
    </Card>
  );
}
