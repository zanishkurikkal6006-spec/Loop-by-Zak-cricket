import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayers } from '@/lib/queries';
import { useReferrals } from '@/lib/marketingQueries';
import {
  REFERRAL_STATUS_LABEL, REFERRAL_STATUS_TONE, REWARD_STATUS_LABEL, generateReferralCode,
} from '@/lib/marketing';
import { sendWhatsApp } from '@/lib/whatsapp';
import { academyName } from '@/lib/branding';
import { useToast } from '@/lib/toast';
import { clsx } from '@/lib/utils';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import type { Referral, ReferralStatus, RewardStatus } from '@/lib/types';

const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';
const STATUS_FLOW: ReferralStatus[] = ['created', 'lead', 'trial', 'enrolled', 'rewarded'];

// Referral engine — unique codes per referring family, tracked from invite
// through lead, trial and enrolment, with reward status. Surfaces referral
// conversion and the top referring families.
export default function Referrals() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Referral | null>(null);
  const { data: referrals = [] } = useReferrals();

  const enrolled = referrals.filter((r) => r.status === 'enrolled' || r.status === 'rewarded').length;
  const conversion = referrals.length ? Math.round((enrolled / referrals.length) * 100) : 0;

  const topReferrers = useMemo(() => {
    const map = new Map<string, { name: string; total: number; enrolled: number }>();
    for (const r of referrals) {
      const key = r.referrer_player_id ?? r.referrer_name ?? 'Unknown';
      const name = r.referrer_name ?? 'Unknown';
      const cur = map.get(key) ?? { name, total: 0, enrolled: 0 };
      cur.total += 1;
      if (r.status === 'enrolled' || r.status === 'rewarded') cur.enrolled += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.enrolled - a.enrolled || b.total - a.total).slice(0, 5);
  }, [referrals]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Growth" title="Referrals" />
        <Button size="sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New Referral</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Total referrals" value={referrals.length} />
        <Tile label="Enrolled" value={enrolled} tone="green" />
        <Tile label="Conversion" value={`${conversion}%`} />
      </div>

      {topReferrers.length > 0 && (
        <Card>
          <div className="eyebrow mb-2 text-ink/40">Top referring families</div>
          <div className="space-y-1.5">
            {topReferrers.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[13px]">
                <span className="font-medium">{r.name}</span>
                <span className="text-ink/55">{r.enrolled} enrolled · {r.total} invited</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {referrals.map((r) => (
          <Card key={r.id} className="cursor-pointer space-y-2" onClick={() => setEditing(r)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[15px] font-semibold">{r.invited_name || 'Invited family'}</div>
                <div className="text-[12px] text-ink/45">via {r.referrer_name || 'family'} · <span className="mono">{r.code}</span></div>
              </div>
              <Chip tone={REFERRAL_STATUS_TONE[r.status] as never}>{REFERRAL_STATUS_LABEL[r.status]}</Chip>
            </div>
            {r.reward_status !== 'none' && (
              <div className="text-[11px] text-ink/50">{REWARD_STATUS_LABEL[r.reward_status]}{r.reward ? ` · ${r.reward}` : ''}</div>
            )}
          </Card>
        ))}
        {!referrals.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">No referrals yet.</div>
        )}
      </div>

      <CreateReferralModal open={creating} onClose={() => setCreating(false)} />
      <EditReferralModal referral={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CreateReferralModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: players = [] } = usePlayers();
  const [referrerId, setReferrerId] = useState('');
  const [invitedName, setInvitedName] = useState('');
  const [invitedPhone, setInvitedPhone] = useState('');
  const [reward, setReward] = useState('1 free session');

  const referrer = players.find((p) => p.id === referrerId);
  const code = useMemo(
    () => generateReferralCode(referrer?.parent_name || referrer?.full_name || 'REF'),
    [referrer?.parent_name, referrer?.full_name],
  );

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      if (!referrer) throw new Error('Choose a referring family');
      const { error } = await supabase.from('referrals').insert({
        academy_id: profile.academy_id, code,
        referrer_player_id: referrer.id,
        referrer_name: referrer.parent_name || referrer.full_name,
        invited_name: invitedName || null, invited_phone: invitedPhone || null,
        status: 'created', reward: reward || null, reward_status: reward ? 'pending' : 'none',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.show('Referral created');
      qc.invalidateQueries({ queryKey: ['referrals'] });
      onClose(); setReferrerId(''); setInvitedName(''); setInvitedPhone('');
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Modal open={open} onClose={onClose} title="New Referral">
      <div className="space-y-3">
        <Field label="Referring family">
          <select value={referrerId} onChange={(e) => setReferrerId(e.target.value)} className={inputCls}>
            <option value="">Select a current player's family…</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.parent_name ? ` · ${p.parent_name}` : ''}</option>)}
          </select>
        </Field>
        {referrer && (
          <div className="flex items-center justify-between rounded-pill bg-chip-gold px-3 py-2">
            <span className="text-[12px] font-semibold text-gold-dark">Code</span>
            <span className="mono text-[14px] font-semibold text-ink">{code}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invited family"><input value={invitedName} onChange={(e) => setInvitedName(e.target.value)} className={inputCls} /></Field>
          <Field label="Invited phone"><input value={invitedPhone} onChange={(e) => setInvitedPhone(e.target.value)} placeholder="+9715…" className={inputCls} /></Field>
        </div>
        <Field label="Reward"><input value={reward} onChange={(e) => setReward(e.target.value)} className={inputCls} /></Field>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create Referral'}
          </Button>
          {referrer?.parent_phone && (
            <Button
              variant="whatsapp"
              onClick={() => sendWhatsApp(
                referrer.parent_phone!,
                `Hi! Thanks for spreading the word about ${academyName()}. Share your referral code *${code}* with a friend — when they enrol, you'll receive: ${reward}. 🏏`,
                { academyId: profile!.academy_id, playerId: referrer.id, templateKey: 'referral_invite', refType: 'player', refId: referrer.id },
              )}
            >
              <Icon name="whatsapp" size={14} stroke="#fff" />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function EditReferralModal({ referral, onClose }: { referral: Referral | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReferralStatus>(referral?.status ?? 'created');
  const [rewardStatus, setRewardStatus] = useState<RewardStatus>(referral?.reward_status ?? 'none');
  const [seededId, setSeededId] = useState<string | null>(referral?.id ?? null);
  if (referral && referral.id !== seededId) {
    setSeededId(referral.id); setStatus(referral.status); setRewardStatus(referral.reward_status);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!referral) return;
      const { error } = await supabase.from('referrals').update({ status, reward_status: rewardStatus }).eq('id', referral.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.show('Referral updated'); qc.invalidateQueries({ queryKey: ['referrals'] }); onClose(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  if (!referral) return null;

  return (
    <Modal open={!!referral} onClose={onClose} title={referral.invited_name || 'Referral'}>
      <div className="space-y-4">
        <div className="rounded-pill bg-chip-gold px-3 py-2 text-center mono text-[15px] font-semibold">{referral.code}</div>
        <div className="text-[13px] text-ink/60">Referred by {referral.referrer_name || 'family'}</div>

        <div>
          <div className="eyebrow mb-1.5 text-ink/40">Referral stage</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FLOW.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={clsx('rounded-chip px-2.5 py-1 text-[11px] font-semibold transition',
                  status === s ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')}
              >
                {REFERRAL_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <Field label="Reward status">
          <select value={rewardStatus} onChange={(e) => setRewardStatus(e.target.value as RewardStatus)} className={inputCls}>
            <option value="none">No reward</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
          </select>
        </Field>

        <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: 'green' }) {
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-3xl leading-none', tone === 'green' && 'text-success')}>{value}</div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">{label}</span>
      {children}
    </label>
  );
}
