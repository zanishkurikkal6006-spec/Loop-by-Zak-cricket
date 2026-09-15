import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaigns } from '@/lib/marketingQueries';
import { campaignMetrics } from '@/lib/marketing';
import { useToast } from '@/lib/toast';
import { aed, clsx } from '@/lib/utils';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import type { Campaign } from '@/lib/types';

const inputCls = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';
const money = (n: number | null) => (n == null ? '—' : aed(Math.round(n)));
const x = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}×`);
const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n)}%`);

// Marketing & Campaign analytics — spend against leads, trials and enrolments,
// so CPL, cost-per-trial, CAC and ROAS are visible per campaign. Judged on
// enrolments and revenue, not just cheap leads. (Retention-by-source lands with
// the AI analysts in Phase 6.)
export default function Campaigns() {
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: campaigns = [] } = useCampaigns();

  const totals = useMemo(() => {
    const spend = campaigns.reduce((n, c) => n + Number(c.spend || 0), 0);
    const enrol = campaigns.reduce((n, c) => n + c.enrolments, 0);
    const rev = campaigns.reduce((n, c) => n + Number(c.revenue || 0), 0);
    return { spend, enrol, cac: enrol ? spend / enrol : null, roas: spend ? rev / spend : null };
  }, [campaigns]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Growth" title="Campaigns" />
        <Button size="sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> Add Campaign</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Total spend" value={aed(totals.spend)} />
        <Tile label="Enrolments" value={totals.enrol} />
        <Tile label="Blended CAC" value={money(totals.cac)} />
        <Tile label="Blended ROAS" value={x(totals.roas)} tone={(totals.roas ?? 0) >= 1 ? 'green' : 'red'} />
      </div>

      <div className="space-y-3">
        {campaigns.map((c) => {
          const m = campaignMetrics(c);
          return (
            <Card key={c.id} className="cursor-pointer space-y-2" onClick={() => setEditing(c)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold">{c.name}</div>
                  <div className="text-[12px] text-ink/45">{[c.platform, c.period].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                {m.roas != null && <Chip tone={m.roas >= 1 ? 'green' : 'red'}>ROAS {m.roas.toFixed(1)}×</Chip>}
              </div>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                <Mini label="Spend" value={aed(Number(c.spend))} />
                <Mini label="Leads" value={c.leads} />
                <Mini label="Trials" value={c.trials} />
                <Mini label="Enrol" value={c.enrolments} />
                <Mini label="CPL" value={money(m.cpl)} />
                <Mini label="CAC" value={money(m.cac)} />
              </div>
              <div className="text-[11px] text-ink/45">Lead → enrol {pct(m.leadToEnrol)} · Revenue {aed(Number(c.revenue))}</div>
            </Card>
          );
        })}
        {!campaigns.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">No campaigns yet.</div>
        )}
      </div>

      <CampaignModal open={creating} campaign={null} onClose={() => setCreating(false)} />
      <CampaignModal open={!!editing} campaign={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CampaignModal({ open, campaign, onClose }: { open: boolean; campaign: Campaign | null; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(() => seed(campaign));
  const [seededId, setSeededId] = useState<string | null>(campaign?.id ?? null);
  if (open && (campaign?.id ?? null) !== seededId) { setSeededId(campaign?.id ?? null); setF(seed(campaign)); }
  const set = (k: keyof ReturnType<typeof seed>, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      if (!f.name.trim()) throw new Error('Campaign name is required');
      const payload = {
        academy_id: profile.academy_id, name: f.name.trim(), platform: f.platform || null, period: f.period || null,
        spend: Number(f.spend || 0), leads: Number(f.leads || 0), qualified_leads: Number(f.qualified_leads || 0),
        trials: Number(f.trials || 0), trial_attendance: Number(f.trial_attendance || 0),
        enrolments: Number(f.enrolments || 0), revenue: Number(f.revenue || 0), notes: f.notes || null,
      };
      if (campaign) {
        const { error } = await supabase.from('campaigns').update(payload).eq('id', campaign.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('campaigns').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.show(campaign ? 'Campaign updated' : 'Campaign added'); qc.invalidateQueries({ queryKey: ['campaigns'] }); onClose(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Modal open={open} onClose={onClose} title={campaign ? campaign.name : 'Add Campaign'}>
      <div className="space-y-3">
        <Field label="Campaign name"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform"><input value={f.platform} onChange={(e) => set('platform', e.target.value)} placeholder="Meta / Google" className={inputCls} /></Field>
          <Field label="Period"><input value={f.period} onChange={(e) => set('period', e.target.value)} placeholder="2026-09" className={inputCls} /></Field>
        </div>
        <Field label="Spend (AED)"><input type="number" value={f.spend} onChange={(e) => set('spend', e.target.value)} className={inputCls} /></Field>
        <div className="rounded-card border border-cardborder bg-white p-3">
          <div className="eyebrow mb-2 text-ink/40">Funnel</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Leads"><input type="number" value={f.leads} onChange={(e) => set('leads', e.target.value)} className={inputCls} /></Field>
            <Field label="Qualified"><input type="number" value={f.qualified_leads} onChange={(e) => set('qualified_leads', e.target.value)} className={inputCls} /></Field>
            <Field label="Trials"><input type="number" value={f.trials} onChange={(e) => set('trials', e.target.value)} className={inputCls} /></Field>
            <Field label="Trial attend"><input type="number" value={f.trial_attendance} onChange={(e) => set('trial_attendance', e.target.value)} className={inputCls} /></Field>
            <Field label="Enrolments"><input type="number" value={f.enrolments} onChange={(e) => set('enrolments', e.target.value)} className={inputCls} /></Field>
            <Field label="Revenue (AED)"><input type="number" value={f.revenue} onChange={(e) => set('revenue', e.target.value)} className={inputCls} /></Field>
          </div>
        </div>
        <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : campaign ? 'Save Changes' : 'Add Campaign'}
        </Button>
      </div>
    </Modal>
  );
}

function seed(c: Campaign | null) {
  return {
    name: c?.name ?? '', platform: c?.platform ?? '', period: c?.period ?? '',
    spend: String(c?.spend ?? 0), leads: String(c?.leads ?? 0), qualified_leads: String(c?.qualified_leads ?? 0),
    trials: String(c?.trials ?? 0), trial_attendance: String(c?.trial_attendance ?? 0),
    enrolments: String(c?.enrolments ?? 0), revenue: String(c?.revenue ?? 0), notes: c?.notes ?? '',
  };
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: 'green' | 'red' }) {
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-2xl leading-none', tone === 'green' && 'text-success', tone === 'red' && 'text-danger')}>{value}</div>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-chip bg-hairline py-1.5 text-center">
      <div className="font-display text-base leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-eyebrow text-ink/40">{label}</div>
    </div>
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
