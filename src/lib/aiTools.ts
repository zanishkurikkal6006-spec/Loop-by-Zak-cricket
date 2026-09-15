import { supabase } from './supabase';
import { computeHealth } from './health';
import { GROWTH_TARGETS, sourceLabel } from './crm';
import { churnReasonLabel } from './experience';
import { campaignMetrics } from './marketing';
import { capacityBand } from './opsQueries';
import { aed } from './utils';
import type { Campaign, LeadSource } from './types';

// ============================================================================
// Deterministic analytics tools — the "approved functions" the AI is allowed to
// call. Each runs fixed, parameterised queries through the Supabase client, so
// every query is RLS-scoped to the caller's academy (tenant isolation is never
// bypassed) and every number is computed HERE in code, never by the model. The
// model's only job is to explain what these return.
//
// When USE_REAL_AI is switched on, this exact tool contract moves server-side
// into an edge function — the shapes below stay identical.
// ============================================================================

export interface ToolResult {
  key: string;
  label: string;
  summary: string;                          // one-line, human-readable
  filters: Record<string, string | number>; // what was queried (shown to the user)
  metrics: Record<string, number>;          // the deterministic figures
  rows?: { label: string; value: string }[]; // optional supporting rows
}

const monthKey = (offset = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offset, 1).toISOString().slice(0, 7);
};
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

// ── Core KPIs ─────────────────────────────────────────────────────────────────
export async function toolKpis(): Promise<ToolResult> {
  const m = monthKey();
  const [players, leads, trials, payments] = await Promise.all([
    supabase.from('players').select('id, status, joined_at'),
    supabase.from('leads').select('id, created_at'),
    supabase.from('trials').select('id, status'),
    supabase.from('payments').select('amount, status, paid_at'),
  ]);
  const pl = (players.data ?? []) as { status: string; joined_at: string | null }[];
  const active = pl.filter((p) => p.status === 'active').length;
  const newEnrol = pl.filter((p) => (p.joined_at ?? '').startsWith(m)).length;
  const newLeads = ((leads.data ?? []) as { created_at: string }[]).filter((l) => l.created_at >= daysAgo(30)).length;
  const trialsBooked = ((trials.data ?? []) as { status: string }[]).filter((t) => t.status === 'scheduled').length;
  const pay = (payments.data ?? []) as { amount: number; status: string; paid_at: string | null }[];
  const revenue = pay.filter((p) => p.status === 'confirmed' && (p.paid_at ?? '').startsWith(m)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstanding = pay.filter((p) => p.status !== 'confirmed').reduce((s, p) => s + Number(p.amount || 0), 0);

  const nextTarget = GROWTH_TARGETS.find((t) => t > active) ?? GROWTH_TARGETS[GROWTH_TARGETS.length - 1];
  return {
    key: 'kpis', label: 'Academy KPIs',
    summary: `${active} active players, ${newLeads} new leads (30d), ${newEnrol} enrolments this month, ${aed(revenue)} revenue.`,
    filters: { period: 'this month + last 30 days' },
    metrics: { active, newLeads, trialsBooked, newEnrol, revenue, outstanding, nextTarget },
    rows: [
      { label: 'Active players', value: String(active) },
      { label: 'Next growth milestone', value: String(nextTarget) },
      { label: 'New leads (30d)', value: String(newLeads) },
      { label: 'Enrolments (this month)', value: String(newEnrol) },
      { label: 'Revenue (this month)', value: aed(revenue) },
      { label: 'Outstanding', value: aed(outstanding) },
    ],
  };
}

// ── Funnel: this month vs last ─────────────────────────────────────────────────
export async function toolFunnel(): Promise<ToolResult> {
  const cur = monthKey(0), prev = monthKey(1);
  const [leads, trials, players] = await Promise.all([
    supabase.from('leads').select('created_at'),
    supabase.from('trials').select('trial_date, status'),
    supabase.from('players').select('joined_at'),
  ]);
  const L = (leads.data ?? []) as { created_at: string }[];
  const T = (trials.data ?? []) as { trial_date: string; status: string }[];
  const P = (players.data ?? []) as { joined_at: string | null }[];

  const snap = (mk: string) => {
    const l = L.filter((x) => x.created_at.startsWith(mk)).length;
    const tb = T.filter((x) => x.trial_date.startsWith(mk)).length;
    const ta = T.filter((x) => x.trial_date.startsWith(mk) && (x.status === 'attended' || x.status === 'converted')).length;
    const e = P.filter((x) => (x.joined_at ?? '').startsWith(mk)).length;
    return { leads: l, trialsBooked: tb, trialsAttended: ta, enrol: e, showRate: pct(ta, tb), enrolRate: pct(e, ta) };
  };
  const c = snap(cur), p = snap(prev);
  const delta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0));

  return {
    key: 'funnel', label: 'Acquisition funnel',
    summary: `Leads ${c.leads} (${delta(c.leads, p.leads)}%), trials booked ${c.trialsBooked} (${delta(c.trialsBooked, p.trialsBooked)}%), trial show-rate ${c.showRate}% vs ${p.showRate}%, enrolments ${c.enrol} (${delta(c.enrol, p.enrol)}%).`,
    filters: { current: cur, previous: prev },
    metrics: {
      leads: c.leads, trialsBooked: c.trialsBooked, trialsAttended: c.trialsAttended, enrol: c.enrol,
      showRate: c.showRate, enrolRate: c.enrolRate,
      leadsDelta: delta(c.leads, p.leads), trialsDelta: delta(c.trialsBooked, p.trialsBooked),
      showRateDelta: c.showRate - p.showRate, enrolDelta: delta(c.enrol, p.enrol),
    },
    rows: [
      { label: 'Leads', value: `${c.leads} (was ${p.leads})` },
      { label: 'Trials booked', value: `${c.trialsBooked} (was ${p.trialsBooked})` },
      { label: 'Trial show-rate', value: `${c.showRate}% (was ${p.showRate}%)` },
      { label: 'Enrolments', value: `${c.enrol} (was ${p.enrol})` },
    ],
  };
}

// ── Revenue ─────────────────────────────────────────────────────────────────--
export async function toolRevenue(): Promise<ToolResult> {
  const m = monthKey();
  const [payments, players] = await Promise.all([
    supabase.from('payments').select('amount, status, paid_at, player:players(lead_source)'),
    supabase.from('players').select('id, status').eq('status', 'active'),
  ]);
  type P = { amount: number; status: string; paid_at: string | null; player: { lead_source: string | null } | null };
  const pay = (payments.data ?? []) as unknown as P[];
  const month = pay.filter((p) => p.status === 'confirmed' && (p.paid_at ?? '').startsWith(m)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstanding = pay.filter((p) => p.status !== 'confirmed').reduce((s, p) => s + Number(p.amount || 0), 0);
  const active = (players.data ?? []).length;
  const bySource = new Map<string, number>();
  for (const p of pay.filter((x) => x.status === 'confirmed' && (x.paid_at ?? '').startsWith(m))) {
    const k = p.player?.lead_source ? sourceLabel(p.player.lead_source as LeadSource) : 'Unknown';
    bySource.set(k, (bySource.get(k) ?? 0) + Number(p.amount || 0));
  }
  const top = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
  const prev = monthKey(1);
  const lastMonth = pay.filter((p) => p.status === 'confirmed' && (p.paid_at ?? '').startsWith(prev)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const delta = lastMonth > 0 ? Math.round(((month - lastMonth) / lastMonth) * 100) : (month > 0 ? 100 : 0);
  return {
    key: 'revenue', label: 'Revenue',
    summary: `${aed(month)} this month (${delta >= 0 ? '+' : ''}${delta}% vs ${aed(lastMonth)} last month), ${aed(outstanding)} outstanding, ARPU ${aed(active ? Math.round(month / active) : 0)}.`,
    filters: { period: m, compared_to: prev },
    metrics: { month, lastMonth, delta, outstanding, arpu: active ? Math.round(month / active) : 0 },
    rows: top.map(([label, value]) => ({ label: `Revenue · ${label}`, value: aed(value) })),
  };
}

// ── At-risk players (transparent health) ───────────────────────────────────────
export async function toolAtRisk(): Promise<ToolResult> {
  const since30 = daysAgo(30).slice(0, 10);
  const [players, packages, payments, issues, assessments, attendance] = await Promise.all([
    supabase.from('players').select('id, full_name, last_seen_at, renewal_date, status').eq('status', 'active'),
    supabase.from('packages').select('player_id, sessions_remaining, sessions_total'),
    supabase.from('payments').select('player_id, status'),
    supabase.from('issues').select('player_id, status').eq('status', 'open'),
    supabase.from('assessments').select('player_id'),
    supabase.from('attendance_records').select('player_id, session:attendance_sessions(session_date)'),
  ]);
  const minRem = new Map<string, number>();
  for (const p of (packages.data ?? []) as { player_id: string; sessions_remaining: number | null; sessions_total: number | null }[]) {
    if (p.sessions_total == null || p.sessions_remaining == null) continue;
    minRem.set(p.player_id, Math.min(minRem.get(p.player_id) ?? Infinity, p.sessions_remaining));
  }
  const outstanding = new Set<string>();
  for (const p of (payments.data ?? []) as { player_id: string | null; status: string }[]) if (p.player_id && p.status !== 'confirmed') outstanding.add(p.player_id);
  const open = new Map<string, number>();
  for (const i of (issues.data ?? []) as { player_id: string | null }[]) if (i.player_id) open.set(i.player_id, (open.get(i.player_id) ?? 0) + 1);
  const assessed = new Set((assessments.data ?? []).map((a) => (a as { player_id: string }).player_id));
  const att = new Map<string, number>();
  for (const r of (attendance.data ?? []) as unknown as { player_id: string; session: { session_date: string } | null }[]) {
    if (r.session && r.session.session_date >= since30) att.set(r.player_id, (att.get(r.player_id) ?? 0) + 1);
  }
  const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000) : null);
  const dTo = (iso: string | null) => (iso ? Math.floor((new Date(iso).getTime() - Date.now()) / 86400_000) : null);

  const scored = ((players.data ?? []) as { id: string; full_name: string; last_seen_at: string | null; renewal_date: string | null }[])
    .map((p) => ({
      name: p.full_name,
      health: computeHealth({
        daysSinceLastSeen: days(p.last_seen_at), attendanceLast30: att.get(p.id) ?? 0,
        sessionsRemaining: minRem.has(p.id) ? minRem.get(p.id)! : null,
        hasOutstandingPayment: outstanding.has(p.id), openIssues: open.get(p.id) ?? 0,
        hasAssessment: assessed.has(p.id), daysToRenewal: dTo(p.renewal_date),
      }),
    }))
    .sort((a, b) => a.health.score - b.health.score);

  const red = scored.filter((s) => s.health.risk === 'red');
  const amber = scored.filter((s) => s.health.risk === 'amber');
  return {
    key: 'at_risk', label: 'Retention risk',
    summary: `${red.length} at-risk (red) and ${amber.length} to watch (amber) of ${scored.length} active players.`,
    filters: { scope: 'active players', signals: 'attendance, recency, package, payment, complaints' },
    metrics: { red: red.length, amber: amber.length, active: scored.length },
    rows: [...red, ...amber].slice(0, 8).map((s) => ({ label: `${s.name} · ${s.health.score}`, value: s.health.factors[0]?.label ?? '—' })),
  };
}

// ── Who to contact (transparent lead prioritisation) ───────────────────────────
export async function toolLeadsToContact(): Promise<ToolResult> {
  const { data } = await supabase.from('leads').select('player_name, stage, next_follow_up, trial_date, source').neq('stage', 'enrolled').neq('stage', 'lost');
  const leads = (data ?? []) as { player_name: string; stage: string; next_follow_up: string | null; trial_date: string | null; source: string }[];
  const t = today();
  const score = (l: typeof leads[number]) => {
    let s = 0; const why: string[] = [];
    if (l.stage === 'trial_attended') { s += 40; why.push('attended trial'); }
    if (l.stage === 'offer_sent') { s += 35; why.push('offer sent'); }
    if (l.next_follow_up && l.next_follow_up <= t) { s += 30; why.push('follow-up due'); }
    if (l.stage === 'new') { s += 20; why.push('new enquiry'); }
    if (l.stage === 'qualified') { s += 15; why.push('qualified'); }
    return { s, why: why.join(', ') || l.stage };
  };
  const ranked = leads.map((l) => ({ l, ...score(l) })).sort((a, b) => b.s - a.s).slice(0, 8);
  return {
    key: 'leads_to_contact', label: 'Priority leads',
    summary: `${leads.length} open leads; top priority: ${ranked[0]?.l.player_name ?? '—'}.`,
    filters: { scope: 'open leads', ranking: 'trial attended → offer → overdue follow-up → new' },
    metrics: { open: leads.length },
    rows: ranked.map((r) => ({ label: r.l.player_name, value: r.why })),
  };
}

// ── Capacity ────────────────────────────────────────────────────────────────--
export async function toolCapacity(): Promise<ToolResult> {
  const [batches, batchGroups, players, centers] = await Promise.all([
    supabase.from('batches').select('id, name, center_id, capacity'),
    supabase.from('batch_groups').select('batch_id, group_id'),
    supabase.from('players').select('group_id, status').eq('status', 'active'),
    supabase.from('training_centers').select('id, name'),
  ]);
  const cn = new Map((centers.data ?? []).map((c) => [(c as { id: string }).id, (c as { name: string }).name]));
  const perGroup = new Map<string, number>();
  for (const p of (players.data ?? []) as { group_id: string | null }[]) if (p.group_id) perGroup.set(p.group_id, (perGroup.get(p.group_id) ?? 0) + 1);
  const gByB = new Map<string, string[]>();
  for (const bg of (batchGroups.data ?? []) as { batch_id: string; group_id: string }[]) { const a = gByB.get(bg.batch_id) ?? []; a.push(bg.group_id); gByB.set(bg.batch_id, a); }
  const rows = ((batches.data ?? []) as { id: string; name: string; center_id: string | null; capacity: number | null }[]).map((b) => {
    const reg = (gByB.get(b.id) ?? []).reduce((s, g) => s + (perGroup.get(g) ?? 0), 0);
    const util = b.capacity ? Math.round((reg / b.capacity) * 100) : null;
    return { name: b.name, centre: b.center_id ? cn.get(b.center_id) ?? 'Centre' : 'Unassigned', reg, cap: b.capacity, util, band: capacityBand(util) };
  });
  const nearFull = rows.filter((r) => r.band === 'critical' || r.band === 'warning');
  const spare = rows.filter((r) => r.band === 'under');
  return {
    key: 'capacity', label: 'Capacity',
    summary: `${nearFull.length} batch(es) near/at capacity, ${spare.length} with spare room.`,
    filters: { scope: 'all batches with a set capacity' },
    metrics: { nearFull: nearFull.length, spare: spare.length, unset: rows.filter((r) => r.band === 'unset').length },
    rows: [...nearFull.map((r) => ({ label: `${r.name} · ${r.centre}`, value: `${r.util}% full` })), ...spare.slice(0, 3).map((r) => ({ label: `${r.name} · ${r.centre}`, value: `${r.reg}/${r.cap} — spare` }))],
  };
}

// ── Coach reporting ────────────────────────────────────────────────────────────
export async function toolCoachReports(): Promise<ToolResult> {
  const [coaches, reports] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('role', ['coach', 'head_coach']),
    supabase.from('reports').select('coach_id, created_at'),
  ]);
  const last = new Map<string, string>();
  for (const r of (reports.data ?? []) as { coach_id: string; created_at: string }[]) {
    if (!last.has(r.coach_id) || r.created_at > last.get(r.coach_id)!) last.set(r.coach_id, r.created_at);
  }
  const stale = ((coaches.data ?? []) as { id: string; full_name: string }[]).map((c) => {
    const l = last.get(c.id);
    const d = l ? Math.floor((Date.now() - new Date(l).getTime()) / 86400_000) : null;
    return { name: c.full_name, days: d };
  }).filter((c) => c.days == null || c.days > 14).sort((a, b) => (b.days ?? 999) - (a.days ?? 999));
  return {
    key: 'coach_reports', label: 'Coach reporting',
    summary: `${stale.length} coach(es) overdue on player reports (>14 days or none).`,
    filters: { threshold: '14 days' },
    metrics: { overdue: stale.length },
    rows: stale.map((c) => ({ label: c.name, value: c.days == null ? 'no reports yet' : `${c.days} days` })),
  };
}

// ── Churn ─────────────────────────────────────────────────────────────────────
export async function toolChurn(): Promise<ToolResult> {
  const { data } = await supabase.from('churn_records').select('reason, exit_date');
  const rows = (data ?? []) as { reason: string; exit_date: string }[];
  const q = daysAgo(90).slice(0, 10);
  const recent = rows.filter((r) => (r.exit_date ?? '') >= q);
  const byReason = new Map<string, number>();
  for (const r of recent) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  const top = [...byReason.entries()].sort((a, b) => b[1] - a[1]);
  return {
    key: 'churn', label: 'Churn (90 days)',
    summary: recent.length ? `${recent.length} exits in 90 days; top reason: ${churnReasonLabel(top[0][0] as never)}.` : 'No exits recorded in the last 90 days.',
    filters: { window: '90 days' },
    metrics: { exits90: recent.length },
    rows: top.map(([r, v]) => ({ label: churnReasonLabel(r as never), value: String(v) })),
  };
}

// ── Campaigns / marketing ──────────────────────────────────────────────────────
export async function toolCampaigns(): Promise<ToolResult> {
  const { data } = await supabase.from('campaigns').select('*');
  const camps = (data ?? []) as Campaign[];
  if (!camps.length) {
    return { key: 'campaigns', label: 'Campaigns', summary: 'No campaigns recorded yet.', filters: {}, metrics: { count: 0 }, rows: [] };
  }
  const scored = camps.map((c) => ({ c, m: campaignMetrics(c) }))
    .sort((a, b) => (b.m.roas ?? 0) - (a.m.roas ?? 0));
  const best = scored[0];
  return {
    key: 'campaigns', label: 'Campaigns',
    summary: `${camps.length} campaigns; best ROAS: ${best.c.name} at ${best.m.roas?.toFixed(1) ?? '—'}×.`,
    filters: { ranking: 'by ROAS (revenue ÷ spend)' },
    metrics: { count: camps.length },
    rows: scored.map(({ c, m }) => ({ label: c.name, value: `ROAS ${m.roas?.toFixed(1) ?? '—'}× · CAC ${m.cac != null ? aed(Math.round(m.cac)) : '—'}` })),
  };
}

// ── Coaching analyst tools (Phase 6) ───────────────────────────────────────────
export async function toolAssessmentsDue(): Promise<ToolResult> {
  const since = daysAgo(90).slice(0, 10);
  const [players, assessments] = await Promise.all([
    supabase.from('players').select('id, full_name, status').eq('status', 'active'),
    supabase.from('assessments').select('player_id, assessment_date'),
  ]);
  const recent = new Set(
    ((assessments.data ?? []) as { player_id: string; assessment_date: string }[])
      .filter((a) => (a.assessment_date ?? '') >= since).map((a) => a.player_id),
  );
  const due = ((players.data ?? []) as { id: string; full_name: string }[]).filter((p) => !recent.has(p.id));
  return {
    key: 'assessments_due', label: 'Assessments due',
    summary: `${due.length} of ${(players.data ?? []).length} active players have no assessment in the last 90 days.`,
    filters: { window: '90 days' },
    metrics: { due: due.length, active: (players.data ?? []).length },
    rows: due.slice(0, 10).map((p) => ({ label: p.full_name, value: 'assessment due' })),
  };
}

export async function toolReportsCoverage(): Promise<ToolResult> {
  const since = daysAgo(45).slice(0, 10);
  const [players, reports] = await Promise.all([
    supabase.from('players').select('id, full_name, status').eq('status', 'active'),
    supabase.from('reports').select('player_id, created_at'),
  ]);
  const recent = new Set(
    ((reports.data ?? []) as { player_id: string; created_at: string }[])
      .filter((r) => r.created_at.slice(0, 10) >= since).map((r) => r.player_id),
  );
  const uncovered = ((players.data ?? []) as { id: string; full_name: string }[]).filter((p) => !recent.has(p.id));
  return {
    key: 'reports_coverage', label: 'Report coverage',
    summary: `${uncovered.length} active players haven't had a report in the last 45 days.`,
    filters: { window: '45 days' },
    metrics: { uncovered: uncovered.length, active: (players.data ?? []).length },
    rows: uncovered.slice(0, 10).map((p) => ({ label: p.full_name, value: 'no recent report' })),
  };
}

export async function toolAttendanceDeclining(): Promise<ToolResult> {
  const last14 = daysAgo(14).slice(0, 10);
  const prevStart = daysAgo(45).slice(0, 10);
  const [players, attendance] = await Promise.all([
    supabase.from('players').select('id, full_name, status').eq('status', 'active'),
    supabase.from('attendance_records').select('player_id, session:attendance_sessions(session_date)'),
  ]);
  const recentN = new Map<string, number>(); const priorN = new Map<string, number>();
  for (const r of (attendance.data ?? []) as unknown as { player_id: string; session: { session_date: string } | null }[]) {
    const d = r.session?.session_date; if (!d) continue;
    if (d >= last14) recentN.set(r.player_id, (recentN.get(r.player_id) ?? 0) + 1);
    else if (d >= prevStart) priorN.set(r.player_id, (priorN.get(r.player_id) ?? 0) + 1);
  }
  const declining = ((players.data ?? []) as { id: string; full_name: string }[])
    .filter((p) => (priorN.get(p.id) ?? 0) >= 2 && (recentN.get(p.id) ?? 0) === 0);
  return {
    key: 'attendance_declining', label: 'Declining attendance',
    summary: `${declining.length} players attended regularly last month but not in the last 14 days.`,
    filters: { recent: 'last 14 days', prior: 'the 4 weeks before' },
    metrics: { declining: declining.length },
    rows: declining.slice(0, 10).map((p) => ({ label: p.full_name, value: 'was regular, now absent' })),
  };
}

export async function toolMatchExposure(): Promise<ToolResult> {
  const [players, matchPlayers] = await Promise.all([
    supabase.from('players').select('id, full_name, status').eq('status', 'active'),
    supabase.from('match_players').select('player_id'),
  ]);
  const played = new Set((matchPlayers.data ?? []).map((m) => (m as { player_id: string }).player_id));
  const none = ((players.data ?? []) as { id: string; full_name: string }[]).filter((p) => !played.has(p.id));
  return {
    key: 'match_exposure', label: 'Match exposure',
    summary: `${none.length} active players have no recorded match appearances yet.`,
    filters: { scope: 'all recorded matches' },
    metrics: { noMatches: none.length, active: (players.data ?? []).length },
    rows: none.slice(0, 10).map((p) => ({ label: p.full_name, value: 'no matches' })),
  };
}

export const TOOL_REGISTRY = {
  kpis: toolKpis, funnel: toolFunnel, revenue: toolRevenue, at_risk: toolAtRisk,
  leads_to_contact: toolLeadsToContact, capacity: toolCapacity, coach_reports: toolCoachReports,
  churn: toolChurn, campaigns: toolCampaigns,
  assessments_due: toolAssessmentsDue, reports_coverage: toolReportsCoverage,
  attendance_declining: toolAttendanceDeclining, match_exposure: toolMatchExposure,
} as const;

export type ToolKey = keyof typeof TOOL_REGISTRY;
