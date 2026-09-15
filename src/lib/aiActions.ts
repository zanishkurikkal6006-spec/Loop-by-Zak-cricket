import { supabase } from './supabase';
import { computeHealth } from './health';
import { createFollowUp } from './crm';
import { renewalContext } from './utils';

// ============================================================================
// AI Actions — the AI PROPOSES operational work; a human confirms; the system
// executes and records it. Nothing here writes without an explicit execute call
// from a confirmed user action, and every execution logs to ai_actions +
// audit_logs. Writes go through normal RLS, so an action can only ever do what
// the user could do by hand.
// ============================================================================

export type ActionKind = 'create_followups_leads' | 'renewals' | 'flag_retention' | 'post_trial';

export interface ActionItem { id: string; label: string; leadId?: string; note?: string }
export interface ProposedAction {
  kind: ActionKind;
  title: string;
  description: string;
  items: ActionItem[];
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

/** Look at the academy and propose actions worth taking. Read-only. */
export async function proposeActions(): Promise<ProposedAction[]> {
  const since30 = daysAgo(30).slice(0, 10);
  const [leads, tasks, players, packages, payments, issues, assessments, attendance, trials, trialAssess] = await Promise.all([
    supabase.from('leads').select('id, player_name, stage'),
    supabase.from('follow_up_tasks').select('lead_id, player_id, status').eq('status', 'open'),
    supabase.from('players').select('id, full_name, last_seen_at, renewal_date, extra_sessions, status').eq('status', 'active'),
    supabase.from('packages').select('player_id, sessions_remaining, sessions_total'),
    supabase.from('payments').select('player_id, status'),
    supabase.from('issues').select('player_id, status').eq('status', 'open'),
    supabase.from('assessments').select('player_id'),
    supabase.from('attendance_records').select('player_id, session:attendance_sessions(session_date)'),
    supabase.from('trials').select('id, player_name, lead_id, status'),
    supabase.from('trial_assessments').select('trial_id'),
  ]);

  const openLeadIds = new Set<string>();
  const openPlayerIds = new Set<string>();
  for (const t of (tasks.data ?? []) as { lead_id: string | null; player_id: string | null }[]) {
    if (t.lead_id) openLeadIds.add(t.lead_id);
    if (t.player_id) openPlayerIds.add(t.player_id);
  }

  const proposals: ProposedAction[] = [];

  // 1 · New leads not yet being worked.
  const newLeads = ((leads.data ?? []) as { id: string; player_name: string; stage: string }[])
    .filter((l) => l.stage === 'new' && !openLeadIds.has(l.id));
  if (newLeads.length) proposals.push({
    kind: 'create_followups_leads',
    title: `Create contact tasks for ${newLeads.length} new lead${newLeads.length === 1 ? '' : 's'}`,
    description: 'New leads with no follow-up task yet. Creates a high-priority "Contact" task due today for each.',
    items: newLeads.map((l) => ({ id: l.id, label: l.player_name })),
  });

  // 2 · Renewals approaching (≤2 sessions left).
  const minRem = new Map<string, number>();
  for (const p of (packages.data ?? []) as { player_id: string; sessions_remaining: number | null; sessions_total: number | null }[]) {
    if (p.sessions_total == null || p.sessions_remaining == null) continue;
    minRem.set(p.player_id, Math.min(minRem.get(p.player_id) ?? Infinity, p.sessions_remaining));
  }
  const activePlayers = (players.data ?? []) as { id: string; full_name: string; last_seen_at: string | null; renewal_date: string | null; extra_sessions: number }[];
  const ctxFor = (id: string, extra: number) => renewalContext(minRem.has(id) ? minRem.get(id)! : null, extra ?? 0);
  const renewals = activePlayers.filter((p) => (minRem.get(p.id) ?? Infinity) <= 2 && !openPlayerIds.has(p.id));
  if (renewals.length) proposals.push({
    kind: 'renewals',
    title: `Create renewal tasks for ${renewals.length} player${renewals.length === 1 ? '' : 's'}`,
    description: 'Players with 2 or fewer sessions left and no open task. Creates a renewal follow-up for each, noting exactly where their package stands.',
    items: renewals.map((p) => ({ id: p.id, label: p.full_name, note: ctxFor(p.id, p.extra_sessions) })),
  });
  const renewalIds = new Set(renewals.map((r) => r.id));

  // 3 · Red-risk retention flags (transparent health).
  const outstanding = new Set<string>();
  for (const p of (payments.data ?? []) as { player_id: string | null; status: string }[]) if (p.player_id && p.status !== 'confirmed') outstanding.add(p.player_id);
  const openIssues = new Map<string, number>();
  for (const i of (issues.data ?? []) as { player_id: string | null }[]) if (i.player_id) openIssues.set(i.player_id, (openIssues.get(i.player_id) ?? 0) + 1);
  const assessed = new Set((assessments.data ?? []).map((a) => (a as { player_id: string }).player_id));
  const att = new Map<string, number>();
  for (const r of (attendance.data ?? []) as unknown as { player_id: string; session: { session_date: string } | null }[]) {
    if (r.session && r.session.session_date >= since30) att.set(r.player_id, (att.get(r.player_id) ?? 0) + 1);
  }
  const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000) : null);
  const dTo = (iso: string | null) => (iso ? Math.floor((new Date(iso).getTime() - Date.now()) / 86400_000) : null);
  const redRisk = activePlayers.filter((p) => {
    if (openPlayerIds.has(p.id) || renewalIds.has(p.id)) return false;
    const h = computeHealth({
      daysSinceLastSeen: days(p.last_seen_at), attendanceLast30: att.get(p.id) ?? 0,
      sessionsRemaining: minRem.has(p.id) ? minRem.get(p.id)! : null,
      hasOutstandingPayment: outstanding.has(p.id), openIssues: openIssues.get(p.id) ?? 0,
      hasAssessment: assessed.has(p.id), daysToRenewal: dTo(p.renewal_date),
    });
    return h.risk === 'red';
  });
  if (redRisk.length) proposals.push({
    kind: 'flag_retention',
    title: `Flag ${redRisk.length} at-risk famil${redRisk.length === 1 ? 'y' : 'ies'} for a retention call`,
    description: 'Red-risk players with no open task. Creates a critical retention check-in for each.',
    items: redRisk.map((p) => ({ id: p.id, label: p.full_name, note: ctxFor(p.id, p.extra_sessions) })),
  });

  // 4 · Trials attended but not yet assessed / followed up.
  const assessedTrials = new Set((trialAssess.data ?? []).map((a) => (a as { trial_id: string }).trial_id));
  const postTrial = ((trials.data ?? []) as { id: string; player_name: string; lead_id: string | null; status: string }[])
    .filter((t) => t.status === 'attended' && !assessedTrials.has(t.id) && (!t.lead_id || !openLeadIds.has(t.lead_id)));
  if (postTrial.length) proposals.push({
    kind: 'post_trial',
    title: `Create post-trial follow-ups for ${postTrial.length} trial${postTrial.length === 1 ? '' : 's'}`,
    description: 'Attended trials with no assessment or task yet. Creates a post-trial follow-up for each.',
    items: postTrial.map((t) => ({ id: t.id, label: t.player_name, leadId: t.lead_id ?? undefined })),
  });

  return proposals;
}

/** Execute a confirmed action: writes the tasks, records ai_actions + audit_log. */
export async function executeAction(
  action: ProposedAction,
  ctx: { academyId: string; userId: string },
): Promise<number> {
  const due = today();
  for (const item of action.items) {
    if (action.kind === 'create_followups_leads') {
      await createFollowUp({ academyId: ctx.academyId, kind: 'new_lead', title: `Contact ${item.label}`, leadId: item.id, ownerId: ctx.userId, dueDate: due, priority: 'high', createdBy: ctx.userId });
    } else if (action.kind === 'renewals') {
      await createFollowUp({ academyId: ctx.academyId, kind: 'renewal_follow_up', title: `Renewal · ${item.label}`, playerId: item.id, ownerId: ctx.userId, dueDate: due, priority: 'high', notes: item.note ?? null, createdBy: ctx.userId });
    } else if (action.kind === 'flag_retention') {
      await createFollowUp({ academyId: ctx.academyId, kind: 'renewal_follow_up', title: `Retention check-in · ${item.label}`, playerId: item.id, ownerId: ctx.userId, dueDate: due, priority: 'critical', notes: item.note ?? null, createdBy: ctx.userId });
    } else if (action.kind === 'post_trial') {
      await createFollowUp({ academyId: ctx.academyId, kind: 'post_trial', title: `Post-trial follow-up · ${item.label}`, leadId: item.leadId ?? null, trialId: item.id, ownerId: ctx.userId, dueDate: due, priority: 'high', createdBy: ctx.userId });
    }
  }

  const count = action.items.length;
  const { data: rec } = await supabase.from('ai_actions').insert({
    academy_id: ctx.academyId, user_id: ctx.userId, kind: action.kind, title: action.title,
    description: action.description, payload: { items: action.items }, status: 'executed',
    result: { count }, executed_at: new Date().toISOString(), executed_by: ctx.userId,
  }).select('id').single();

  await supabase.from('audit_logs').insert({
    academy_id: ctx.academyId, actor_id: ctx.userId, action: 'ai_execute',
    entity: 'follow_up_tasks', entity_id: (rec as { id: string } | null)?.id ?? null,
    detail: { kind: action.kind, count, title: action.title },
  });

  return count;
}

export interface AuditEntry { id: string; action: string; entity: string | null; detail: Record<string, unknown>; created_at: string }

export async function fetchAuditLog(limit = 20): Promise<AuditEntry[]> {
  const { data, error } = await supabase.from('audit_logs').select('id, action, entity, detail, created_at').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}
