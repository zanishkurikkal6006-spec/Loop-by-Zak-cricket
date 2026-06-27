import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { Card, Chip, Button, PaymentBar } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { aed } from '@/lib/utils';
import VenuePicker from '@/features/matches/VenuePicker';
import type { GroundFee, TrainingCenter } from '@/lib/types';

type Row = GroundFee & { center: TrainingCenter | null };

// Ground bookings + payments, shared by admin and coach. Supports PARTIAL
// payments — coaches often pay some of the ground fee on the day, so each
// "Record payment" adds to paid_amount until the booking is fully settled.
export default function GroundFeesPanel() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [centerId, setCenterId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);

  const [payFor, setPayFor] = useState<Row | null>(null);

  const { data: fees = [] } = useQuery({
    queryKey: ['ground-fees', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('ground_fees')
        .select('*, center:training_centers(*)')
        .order('booking_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function addBooking() {
    if (!profile || !date || !amount) return;
    setSavingAdd(true);
    try {
      const { error } = await supabase.from('ground_fees').insert({
        academy_id: profile.academy_id,
        center_id: centerId || null,
        booking_date: date,
        amount: Number(amount),
        paid_amount: 0,
        status: 'pending',
      });
      if (error) throw error;
      toast.show('Booking added');
      setAdding(false);
      setCenterId('');
      setAmount('');
      qc.invalidateQueries({ queryKey: ['ground-fees'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch {
      toast.show('Could not add booking');
    } finally {
      setSavingAdd(false);
    }
  }

  const total = fees.reduce((s, f) => s + Number(f.amount), 0);
  const paid = fees.reduce((s, f) => s + Number(f.paid_amount), 0);
  const outstanding = Math.max(0, total - paid);

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Card className="flex flex-col gap-1">
          <div className="eyebrow text-ink/40">Booked</div>
          <div className="font-display text-2xl">{aed(total)}</div>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="eyebrow text-ink/40">Paid</div>
          <div className="font-display text-2xl text-success">{aed(paid)}</div>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="eyebrow text-ink/40">To pay</div>
          <div className="font-display text-2xl text-amber-text">{aed(outstanding)}</div>
        </Card>
      </div>

      <Card>
        <PaymentBar paid={paid} total={total} />
      </Card>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>+ Add booking</Button>
      </div>

      <Card className="divide-y divide-hairline p-0">
        {fees.map((f) => {
          const rem = Math.max(0, Number(f.amount) - Number(f.paid_amount));
          const fully = rem <= 0;
          return (
            <div key={f.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
              <div>
                <div className="font-medium">{f.center?.name ?? 'Ground'}</div>
                <div className="text-[11px] text-ink/45">
                  {f.booking_date} · {aed(Number(f.paid_amount))} of {aed(Number(f.amount))} paid
                </div>
              </div>
              <div className="flex items-center gap-2">
                {fully ? (
                  <Chip tone="green">Paid ✓</Chip>
                ) : (
                  <>
                    {Number(f.paid_amount) > 0 && <Chip tone="amber">{aed(rem)} left</Chip>}
                    <button
                      onClick={() => setPayFor(f)}
                      className="rounded-chip bg-brand-red px-3 py-1 text-[11px] font-semibold text-paper"
                    >
                      Record payment
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {!fees.length && (
          <div className="px-4 py-6 text-center text-[13px] text-ink/45">No ground bookings yet.</div>
        )}
      </Card>

      {/* Add booking */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add Ground Booking">
        <div className="space-y-3">
          <VenuePicker value={centerId} onChange={setCenterId} enabled={adding} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Total ground fee (AED)" className={field} />
          <Button className="w-full" disabled={savingAdd || !date || !amount} onClick={addBooking}>
            {savingAdd ? 'Saving…' : 'Add booking'}
          </Button>
        </div>
      </Modal>

      {/* Record (partial) payment */}
      <RecordPaymentModal booking={payFor} onClose={() => setPayFor(null)} />
    </div>
  );
}

function RecordPaymentModal({ booking, onClose }: { booking: Row | null; onClose: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'cash' | 'bank'>('cash');
  const [saving, setSaving] = useState(false);

  const remaining = booking ? Math.max(0, Number(booking.amount) - Number(booking.paid_amount)) : 0;

  async function save() {
    if (!profile || !booking) return;
    const pay = Number(amount || remaining);
    if (pay <= 0) return toast.show('Enter an amount');
    setSaving(true);
    try {
      const newPaid = Math.min(Number(booking.amount), Number(booking.paid_amount) + pay);
      const fully = newPaid >= Number(booking.amount);
      const { error } = await supabase
        .from('ground_fees')
        .update({ paid_amount: newPaid, mode, status: fully ? 'confirmed' : 'pending' })
        .eq('id', booking.id);
      if (error) throw error;
      toast.show(fully ? 'Marked fully paid' : `Recorded ${aed(pay)} · ${aed(Number(booking.amount) - newPaid)} left`);
      setAmount('');
      qc.invalidateQueries({ queryKey: ['ground-fees'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      onClose();
    } catch {
      toast.show('Could not record payment');
    } finally {
      setSaving(false);
    }
  }

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <Modal open={!!booking} onClose={onClose} title="Record Ground Payment">
      <div className="space-y-3">
        <div className="rounded-card border border-cardborder bg-white p-3 text-[13px]">
          <div className="font-medium">{booking?.center?.name ?? 'Ground'} · {booking?.booking_date}</div>
          <div className="mt-1 text-ink/50">
            {booking ? `${aed(Number(booking.paid_amount))} of ${aed(Number(booking.amount))} paid · ${aed(remaining)} remaining` : ''}
          </div>
        </div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Amount paid now (default ${aed(remaining)})`}
          className={field}
        />
        <div className="flex gap-2">
          {(['cash', 'bank'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                'flex-1 rounded-pill px-3 py-2 text-[12px] font-semibold capitalize transition ' +
                (mode === m ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')
              }
            >
              {m}
            </button>
          ))}
        </div>
        <Button className="w-full" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Record payment'}
        </Button>
      </div>
    </Modal>
  );
}
