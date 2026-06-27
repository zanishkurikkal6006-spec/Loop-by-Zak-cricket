import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMyOneToOneBlocks, useMyGroups, usePlayers } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { LoopRing, RingAvatar } from '@/components/brand/LoopRing';
import { Button, Chip, ScreenTitle } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { stateColor, firstName } from '@/lib/utils';
import type { OneToOneBlock, OneToOneSession, Player } from '@/lib/types';

// 1-on-1 Sessions: gold hero (all-time delivered), assigned blocks sorted
// most-remaining-first, each with the signature ring + bar tracker. Logging a
// session deducts one from the block.
export default function CoachOneToOne() {
  const { data: blocks = [] } = useMyOneToOneBlocks();
  const { data: groups = [] } = useMyGroups();
  const { data: players = [] } = usePlayers(groups.length ? groups.map((g) => g.id) : undefined);
  const [adding, setAdding] = useState(false);
  const [logBlock, setLogBlock] = useState<(OneToOneBlock & { player: Player }) | null>(null);

  const totalDelivered = blocks.reduce((s, b) => s + b.sessions_used, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Coach · Gold" title="1-on-1 Sessions" />
        <Button size="sm" variant="gold" onClick={() => setAdding(true)}>+ Add Block</Button>
      </div>

      {/* Gold hero */}
      <div className="rounded-card bg-gradient-to-b from-gold-light to-gold-dark p-5 text-ink shadow-card-lg">
        <div className="text-[11px] font-semibold uppercase tracking-eyebrow">
          Private sessions delivered
        </div>
        <div className="mt-1 font-display text-5xl leading-none">{totalDelivered}</div>
        <div className="mt-1 text-[12px] text-ink/70">All-time, across your assigned blocks</div>
      </div>

      <div className="space-y-3">
        {blocks.map((block) => (
          <BlockCard key={block.id} block={block} onLog={() => setLogBlock(block)} />
        ))}
        {!blocks.length && (
          <div className="card flex h-32 items-center justify-center text-[13px] text-ink/40">
            No 1-on-1 blocks assigned to you yet.
          </div>
        )}
      </div>

      <AddBlockModal open={adding} onClose={() => setAdding(false)} players={players} />
      <LogSessionModal block={logBlock} onClose={() => setLogBlock(null)} />
    </div>
  );
}

// Log a private session with a chosen date + time slot (so a coach can keep an
// accurate diary and plan around it), then decrement the block.
function LogSessionModal({
  block,
  onClose,
}: {
  block: (OneToOneBlock & { player: Player }) | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('16:00');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!profile || !block) return;
    if (block.sessions_remaining <= 0) return toast.show('No sessions remaining');
    setSaving(true);
    try {
      const { error: sErr } = await supabase.from('one_to_one_sessions').insert({
        academy_id: profile.academy_id,
        block_id: block.id,
        session_date: date,
        time_slot: time,
        logged_by: profile.id,
      });
      if (sErr) throw sErr;
      const { error: uErr } = await supabase
        .from('one_to_one_blocks')
        .update({ sessions_used: block.sessions_used + 1 })
        .eq('id', block.id);
      if (uErr) throw uErr;
      toast.show('Session logged');
      qc.invalidateQueries({ queryKey: ['one-to-one'] });
      qc.invalidateQueries({ queryKey: ['one-to-one-sessions', block.id] });
      onClose();
    } catch {
      toast.show('Could not log session');
    } finally {
      setSaving(false);
    }
  }

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <Modal open={!!block} onClose={onClose} title={block ? `Log session · ${block.player?.full_name}` : ''}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">Time slot</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        </label>
        <Button className="w-full" disabled={saving} onClick={save}>
          {saving ? 'Logging…' : 'Log session'}
        </Button>
      </div>
    </Modal>
  );
}

// Self-coordinated block: a coach arranges 1-on-1s directly with a client.
// Unpaid blocks still count and run, carrying a payment-pending flag.
function AddBlockModal({
  open,
  onClose,
  players,
}: {
  open: boolean;
  onClose: () => void;
  players: Player[];
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [playerId, setPlayerId] = useState('');
  const [focus, setFocus] = useState('');
  const [total, setTotal] = useState('8');
  const [paid, setPaid] = useState(true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!profile || !playerId || !Number(total)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('one_to_one_blocks').insert({
        academy_id: profile.academy_id,
        player_id: playerId,
        coach_id: profile.id,
        focus_note: focus.trim() || null,
        sessions_total: Number(total),
        sessions_used: 0,
        source: 'coach_added',
        payment_status: paid ? 'paid' : 'pending',
        assigned_by: profile.id,
      });
      if (error) throw error;
      toast.show('Block added');
      onClose();
      setPlayerId('');
      setFocus('');
      setTotal('8');
      setPaid(true);
      qc.invalidateQueries({ queryKey: ['one-to-one'] });
    } catch {
      toast.show('Could not add block');
    } finally {
      setSaving(false);
    }
  }

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <Modal open={open} onClose={onClose} title="Add 1-on-1 Block">
      <div className="space-y-3">
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={field}>
          <option value="">Select player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
        <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Focus (e.g. front-foot drives)" className={field} />
        <input type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Total sessions" className={field} />
        <div className="flex gap-2">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => setPaid(v)}
              className={
                'flex-1 rounded-chip px-3 py-2 text-[12px] font-semibold ' +
                (paid === v ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')
              }
            >
              {v ? 'Paid' : 'Not paid yet — still attending'}
            </button>
          ))}
        </div>
        <Button className="w-full" disabled={saving || !playerId || !Number(total)} onClick={save}>
          {saving ? 'Adding…' : 'Add Block'}
        </Button>
      </div>
    </Modal>
  );
}

function BlockCard({
  block,
  onLog,
}: {
  block: OneToOneBlock & { player: Player };
  onLog: () => void;
}) {
  const remaining = block.sessions_remaining;
  const ringState = remaining >= 3 ? 'healthy' : remaining >= 1 ? 'low' : 'exhausted';
  const color = stateColor(ringState);
  const pct = block.sessions_total ? block.sessions_used / block.sessions_total : 0;
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <LoopRing progress={pct} color={color} size={52} stroke={4}>
          <span className="text-[11px] font-bold">{remaining}</span>
        </LoopRing>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <RingAvatar name={block.player?.full_name ?? '—'} size={28} />
            <span className="text-[15px] font-semibold">{block.player?.full_name}</span>
          </div>
          {block.focus_note && <div className="mt-0.5 text-[12px] text-ink/55">{block.focus_note}</div>}
        </div>
        {block.payment_status === 'pending' && <Chip tone="amber">Payment pending</Chip>}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[12px] text-ink/55">
          {block.sessions_used} of {block.sessions_total} used ·{' '}
          <span style={{ color }} className="font-semibold">
            {remaining === 0 ? 'Renewal needed' : `${remaining} remaining`}
          </span>
        </span>
        <Button size="sm" disabled={remaining <= 0} onClick={onLog}>
          + Log for {firstName(block.player?.full_name ?? '')}
        </Button>
      </div>

      <button
        onClick={() => setShowHistory((s) => !s)}
        className="mt-3 flex items-center gap-1 text-[12px] font-semibold text-brand-red"
      >
        <Icon name={showHistory ? 'chevron-up' : 'chevron-down'} size={14} stroke="#9C1116" />
        Session dates
      </button>
      {showHistory && <SessionHistory blockId={block.id} />}
    </div>
  );
}

function SessionHistory({ blockId }: { blockId: string }) {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['one-to-one-sessions', blockId],
    queryFn: async (): Promise<OneToOneSession[]> => {
      const { data, error } = await supabase
        .from('one_to_one_sessions')
        .select('*')
        .eq('block_id', blockId)
        .order('session_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OneToOneSession[];
    },
  });

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="mt-2 rounded-card border border-cardborder bg-white p-2">
      {isLoading && <div className="px-2 py-1 text-[12px] text-ink/45">Loading…</div>}
      {!isLoading && !sessions.length && (
        <div className="px-2 py-1 text-[12px] text-ink/45">No sessions logged yet.</div>
      )}
      {sessions.map((s) => (
        <div key={s.id} className="flex items-center justify-between px-2 py-1.5 text-[12.5px]">
          <span className="font-medium">{fmt(s.session_date)}</span>
          <span className="text-ink/50">{s.time_slot ? s.time_slot.slice(0, 5) : ''}</span>
        </div>
      ))}
    </div>
  );
}
