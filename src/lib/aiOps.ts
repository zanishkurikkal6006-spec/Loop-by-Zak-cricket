import { supabase } from './supabase';
import { TOOL_REGISTRY, type ToolKey, type ToolResult } from './aiTools';
import { GROWTH_TARGETS } from './crm';
import { academyName } from './branding';
import type { UserRole } from './types';

// ============================================================================
// AI Operations pipeline — the single swap point for academy AI.
//
//   question → PLAN (pick approved tools) → RUN (deterministic, RLS-scoped)
//            → COMPOSE (Answer / Evidence / Why / Actions / Confidence)
//
// Provider-agnostic: VITE_AI_PROVIDER = placeholder | anthropic | openai. In
// placeholder mode the composer is templated from REAL tool output, so it never
// fabricates a number. When a real provider is set, the same deterministic tool
// results are handed to an edge function that asks the model only to explain
// them — the numbers still come from the tools, never the model.
// ============================================================================

const PROVIDER = (import.meta.env.VITE_AI_PROVIDER as string | undefined) ?? 'placeholder';

export interface AiAnswer {
  answer: string;
  evidence: string[];
  why: string;
  actions: string[];
  confidence: string;
  tools: ToolResult[];
}

type Intent =
  | 'growth' | 'enrolments' | 'revenue' | 'at_risk' | 'churn' | 'contact'
  | 'capacity' | 'coach' | 'marketing' | 'week' | 'today' | 'overview';

const has = (q: string, ...w: string[]) => w.some((x) => q.includes(x));

/** Keyword planner — maps a question to an intent + the tools it needs. */
function plan(question: string): { intent: Intent; tools: ToolKey[] } {
  const q = question.toLowerCase();
  if (has(q, 'on track', 'target', '500', '75 player', 'growth', 'grow to', 'pace')) return { intent: 'growth', tools: ['kpis', 'funnel'] };
  if (has(q, 'enrol', 'sign up', 'signup', 'joined', 'conversion')) return { intent: 'enrolments', tools: ['funnel'] };
  if (has(q, 'revenue', 'money', 'income', 'outstanding', 'owe', 'collect', 'cash', 'arpu')) return { intent: 'revenue', tools: ['revenue'] };
  if (has(q, 'risk', 'at-risk', 'about to leave', 'losing', 'retention')) return { intent: 'at_risk', tools: ['at_risk'] };
  if (has(q, 'churn', 'left', 'quit', 'competitor', 'why are parents', 'dropping out', 'drop out')) return { intent: 'churn', tools: ['churn'] };
  if (has(q, 'call', 'contact', 'follow up', 'follow-up', 'who should i', 'chase', 'convert')) return { intent: 'contact', tools: ['leads_to_contact'] };
  if (has(q, 'capacity', 'full', 'batch', 'saturday', 'space', 'another coach', 'another batch', 'waitlist')) return { intent: 'capacity', tools: ['capacity'] };
  if (has(q, 'coach', 'report overdue', 'reports overdue', 'assessments due')) return { intent: 'coach', tools: ['coach_reports'] };
  if (has(q, 'marketing', 'campaign', 'spend', 'channel', 'budget', 'ads', 'meta', 'google', 'cac', 'roas')) return { intent: 'marketing', tools: ['campaigns'] };
  if (has(q, 'this week', 'what happened', 'summary', 'weekly', 'update me')) return { intent: 'week', tools: ['kpis', 'funnel', 'at_risk', 'revenue'] };
  if (has(q, 'today', 'priorit', 'right now', 'first')) return { intent: 'today', tools: ['leads_to_contact', 'at_risk', 'capacity', 'coach_reports'] };
  return { intent: 'overview', tools: ['kpis'] };
}

// ── Coaching scope (Head Coach): coaching data only, no finance/marketing ──────
type CoachingIntent = 'assessments' | 'reports' | 'attendance' | 'match' | 'coach' | 'at_risk' | 'capacity' | 'coaching_overview';

/** Returns null when the question is outside a coach's scope (finance/sales). */
function planCoaching(question: string): { intent: CoachingIntent; tools: ToolKey[] } | null {
  const q = question.toLowerCase();
  if (has(q, 'revenue', 'money', 'income', 'marketing', 'campaign', 'spend', 'budget', 'lead', 'sales', 'profit', 'outstanding', 'owe', 'churn', 'enrol')) return null;
  if (has(q, 'assessment')) return { intent: 'assessments', tools: ['assessments_due'] };
  if (has(q, 'report')) return has(q, 'overdue', 'which coach', 'coaches')
    ? { intent: 'coach', tools: ['coach_reports'] }
    : { intent: 'reports', tools: ['reports_coverage'] };
  if (has(q, 'attendance', 'declining', 'not coming', 'missing', 'absent', 'dropping off')) return { intent: 'attendance', tools: ['attendance_declining'] };
  if (has(q, 'match', 'game time', 'exposure', 'played', 'selection')) return { intent: 'match', tools: ['match_exposure'] };
  if (has(q, 'risk', 'at-risk', 'leaving', 'retention')) return { intent: 'at_risk', tools: ['at_risk'] };
  if (has(q, 'capacity', 'batch', 'full', 'group size')) return { intent: 'capacity', tools: ['capacity'] };
  if (has(q, 'coach')) return { intent: 'coach', tools: ['coach_reports'] };
  return { intent: 'coaching_overview', tools: ['coach_reports', 'assessments_due', 'reports_coverage', 'attendance_declining'] };
}

function composeCoaching(intent: CoachingIntent, tools: ToolResult[]): Omit<AiAnswer, 'tools'> {
  const evidence = tools.map((t) => t.summary);
  const sign = `Based on ${academyName()}'s coaching records.`;
  const t = (k: string) => byKey(tools, k)!;
  switch (intent) {
    case 'assessments':
      return { answer: t('assessments_due').summary, evidence, why: 'Assessments every ~3 months keep development tracked and parents informed.', actions: ['Book assessments for the players listed', 'Start with those who have none on record'], confidence: `High — ${sign}` };
    case 'reports':
      return { answer: t('reports_coverage').summary, evidence, why: 'A regular report cadence (every 4–6 weeks) keeps parents engaged and is a retention signal.', actions: ['Write reports for the uncovered players', 'Use the AI draft to speed it up'], confidence: `High — ${sign}` };
    case 'attendance':
      return { answer: t('attendance_declining').summary, evidence, why: 'Players who were regular and then stop are the earliest, most actionable churn signal.', actions: ['Check in with these players and parents', 'Flag any pattern to Operations for a retention call'], confidence: `High — ${sign}` };
    case 'match':
      return { answer: t('match_exposure').summary, evidence, why: 'Match minutes drive development and parent satisfaction; players with none need a pathway.', actions: ['Give the listed players match minutes', 'Balance selection across the squad'], confidence: `High — ${sign}` };
    case 'coach':
      return { answer: t('coach_reports').summary, evidence, why: 'Freshness threshold is 14 days since a coach last wrote a report.', actions: t('coach_reports').metrics.overdue > 0 ? ['Nudge overdue coaches', 'Check their groups for assessments due'] : ['Reporting is current'], confidence: `High — ${sign}` };
    case 'at_risk':
      return { answer: t('at_risk').summary, evidence, why: 'A transparent weighted signal (attendance, recency, complaints) — it flags who needs attention, not a prediction.', actions: ['Give at-risk players extra attention in sessions', 'Flag red-risk families to Operations'], confidence: `High — ${sign}` };
    case 'capacity':
      return { answer: t('capacity').summary, evidence, why: 'Utilization is registered players ÷ safe capacity.', actions: ['Balance group sizes where near-full', 'Use spare slots for new players'], confidence: `High — ${sign}` };
    default:
      return { answer: 'Coaching status across reports, assessments and attendance is summarised below.', evidence, why: 'A rollup of the coaching signals that need attention.', actions: ['Clear overdue reports and assessments', 'Check in with players whose attendance is slipping'], confidence: `High — ${sign}` };
  }
}

const COACHING_REFUSAL: Omit<AiAnswer, 'tools'> = {
  answer: "That's outside your coaching view.",
  evidence: [],
  why: 'As Head Coach, the assistant covers coaching operations only — assessments, reports, attendance, match exposure, at-risk players and capacity. Finance, marketing and sales sit with the Director / Operations Manager.',
  actions: ['Ask about assessments due, players without reports, declining attendance, or match exposure'],
  confidence: '—',
};

async function runTools(keys: ToolKey[]): Promise<ToolResult[]> {
  const results = await Promise.all(keys.map((k) => TOOL_REGISTRY[k]()));
  return results;
}

function byKey(tools: ToolResult[], key: string): ToolResult | undefined {
  return tools.find((t) => t.key === key);
}

/** Compose the structured answer from real tool output (placeholder mode). */
function compose(intent: Intent, tools: ToolResult[]): Omit<AiAnswer, 'tools'> {
  const evidence = tools.map((t) => t.summary);
  const sign = `Based on ${academyName()}'s recorded data.`;

  switch (intent) {
    case 'growth': {
      const k = byKey(tools, 'kpis')!.metrics;
      const active = k.active; const next = k.nextTarget;
      const idx = GROWTH_TARGETS.indexOf(next);
      const monthLabel = idx >= 0 ? `Month ${idx + 1}` : 'the next milestone';
      const gap = Math.max(0, next - active);
      return {
        answer: `You have ${active} active players; the next milestone is ${next} (${monthLabel}) — a gap of ${gap}.`,
        evidence,
        why: `Net growth is enrolments minus exits. This month you added ${k.newEnrol} enrolments from ${k.newLeads} new leads (30d).`,
        actions: gap > 0
          ? [`Convert ${Math.min(gap, byKey(tools, 'funnel')?.metrics.trialsAttended ?? gap)} of the players who've attended trials`, 'Book more trials from open leads', 'Protect retention so growth is net, not churned back']
          : ['Milestone reached — reset the target to the next band'],
        confidence: active > 0 ? `High — ${sign}` : `Low — no active players recorded yet.`,
      };
    }
    case 'enrolments': {
      const f = byKey(tools, 'funnel')!.metrics;
      const worst = f.showRateDelta < -5 ? 'trial attendance (show-rate)'
        : f.trialsDelta < -5 ? 'trial bookings'
        : f.leadsDelta < -5 ? 'lead volume' : 'end-to-end conversion';
      return {
        answer: `Enrolments are ${f.enrolDelta >= 0 ? 'up' : 'down'} ${Math.abs(f.enrolDelta)}% vs last month (${f.enrol} this month).`,
        evidence,
        why: `The biggest movement is in ${worst}. Leads ${f.leadsDelta}%, trials booked ${f.trialsDelta}%, show-rate ${f.showRate}% (Δ ${f.showRateDelta}pts).`,
        actions: worst.includes('show')
          ? ['Add 24-hour WhatsApp trial reminders', 'Call unconfirmed trial families', 'Test alternative weekend trial slots']
          : worst.includes('booking')
          ? ['Speed up first response to new leads', 'Offer more trial slots this week']
          : ['Review lead sources for volume drop', 'Re-engage the nurture list'],
        confidence: f.leads > 0 || f.enrol > 0 ? `High — ${sign}` : `Low — not enough leads/enrolments recorded this month to compare reliably.`,
      };
    }
    case 'revenue': {
      const r = byKey(tools, 'revenue')!.metrics;
      return {
        answer: `${fmtAed(r.month)} collected this month (${r.delta >= 0 ? '+' : ''}${r.delta}% vs ${fmtAed(r.lastMonth)} last month); ${fmtAed(r.outstanding)} outstanding. ARPU ${fmtAed(r.arpu)}.`,
        evidence,
        why: r.outstanding > 0 ? 'Outstanding balance is the fastest lever — collecting it needs no new sales.' : 'Collection is clean this month.',
        actions: r.outstanding > 0 ? ['Send payment reminders on overdue balances', 'Prioritise the oldest unpaid first'] : ['Focus on renewals to grow ARPU'],
        confidence: `High — figures computed from the payment ledger. ${sign}`,
      };
    }
    case 'at_risk': {
      const a = byKey(tools, 'at_risk')!.metrics;
      return {
        answer: `${a.red} players are at-risk (red) and ${a.amber} need watching (amber), of ${a.active} active.`,
        evidence,
        why: 'Risk is a transparent weighted score (attendance recency, package status, payments, complaints). It flags who needs a human — it does not predict anyone will leave.',
        actions: ['Call the red-risk families this week', 'Log a retention check-in for each', 'Resolve any open complaints driving the score'],
        confidence: a.active > 0 ? `High — ${sign}` : 'Low — no active players to score.',
      };
    }
    case 'churn': {
      const c = byKey(tools, 'churn')!;
      return {
        answer: c.summary,
        evidence,
        why: c.metrics.exits90 > 0 ? 'Reasons are only as complete as what was recorded at exit.' : 'No exits recorded in the window.',
        actions: c.metrics.exits90 > 0 ? ['Address the top exit reason directly', 'Make exit reason mandatory so this stays reliable'] : ['Keep logging every exit with a reason'],
        confidence: c.metrics.exits90 > 0 ? `Medium — depends on exit-reason completeness. ${sign}` : 'Low — no churn recorded yet.',
      };
    }
    case 'contact': {
      const l = byKey(tools, 'leads_to_contact')!;
      return {
        answer: l.summary,
        evidence,
        why: 'Leads are ranked on transparent intent signals: trial attended, offer sent, overdue follow-up, then new enquiries.',
        actions: ['Work the list top-down today', 'Log the outcome on each so the queue stays clean'],
        confidence: l.metrics.open > 0 ? `High — ${sign}` : 'Low — no open leads recorded.',
      };
    }
    case 'capacity': {
      const c = byKey(tools, 'capacity')!.metrics;
      return {
        answer: `${c.nearFull} batch(es) near/at capacity; ${c.spare} with spare room${c.unset ? `; ${c.unset} still need a capacity set` : ''}.`,
        evidence,
        why: 'Utilization is registered players ÷ safe capacity. Above 85% signals expansion; below 60% is spare room for trials.',
        actions: c.nearFull > 0 ? ['Add a batch or coach where near-full', 'Place new trials into the spare-capacity slots'] : ['Direct new trials into spare slots'],
        confidence: c.unset > 0 ? 'Medium — some batches have no safe capacity set yet.' : `High — ${sign}`,
      };
    }
    case 'coach': {
      const c = byKey(tools, 'coach_reports')!;
      return {
        answer: c.summary,
        evidence,
        why: 'Freshness threshold is 14 days since a coach last wrote a player report.',
        actions: c.metrics.overdue > 0 ? ['Nudge overdue coaches (WhatsApp from Coach Utilization)', 'Check whether their groups have assessments due too'] : ['Reporting is current — no action needed'],
        confidence: `High — ${sign}`,
      };
    }
    case 'marketing': {
      const c = byKey(tools, 'campaigns')!;
      return {
        answer: c.summary,
        evidence,
        why: c.metrics.count > 0 ? 'Ranked by ROAS (revenue ÷ spend); CAC shown alongside. Cheap leads that never enrol are not rewarded.' : 'No campaign data recorded yet.',
        actions: c.metrics.count > 0 ? ['Shift budget toward the best ROAS / lowest CAC', 'Pause or fix the weakest campaign'] : ['Log campaigns with spend + funnel to enable this analysis'],
        confidence: c.metrics.count > 0 ? `Medium — retention-by-source strengthens this in Phase 6. ${sign}` : 'Low — no campaigns recorded.',
      };
    }
    case 'week': {
      const k = byKey(tools, 'kpis')!.metrics; const f = byKey(tools, 'funnel')!.metrics; const a = byKey(tools, 'at_risk')!.metrics;
      return {
        answer: `${k.active} active players, ${f.enrol} enrolments this month (${f.enrolDelta >= 0 ? '+' : ''}${f.enrolDelta}% vs last), ${a.red} at-risk to address.`,
        evidence,
        why: 'A rollup of growth, funnel, revenue and retention for the period.',
        actions: ['Clear at-risk check-ins', 'Push trial show-rate', 'Collect outstanding balances'],
        confidence: `High — ${sign}`,
      };
    }
    case 'today': {
      const l = byKey(tools, 'leads_to_contact')!.metrics; const a = byKey(tools, 'at_risk')!.metrics; const c = byKey(tools, 'capacity')!.metrics; const cr = byKey(tools, 'coach_reports')!.metrics;
      return {
        answer: `Today: ${l.open} open leads to work, ${a.red} red-risk families, ${c.nearFull} capacity flags, ${cr.overdue} coach reports overdue.`,
        evidence,
        why: 'Compiled from the live action signals across the funnel, retention, capacity and coaching.',
        actions: ['Contact the top priority leads', 'Call red-risk families', 'Resolve capacity flags', 'Nudge overdue coaches'],
        confidence: `High — ${sign}`,
      };
    }
    default: {
      const k = byKey(tools, 'kpis')!;
      return { answer: k.summary, evidence, why: 'A snapshot of the core academy KPIs.', actions: ['Ask a more specific question to go deeper'], confidence: `High — ${sign}` };
    }
  }
}

function fmtAed(n: number) { return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n); }

export interface AskOptions {
  academyId: string;
  userId?: string | null;
  conversationId?: string | null;
  /** The asker's role — scopes which tools the AI may use. */
  role?: UserRole | null;
  /** Prior Q for follow-up context (e.g. "what about only Jumeirah?"). */
  previousQuestion?: string | null;
}

/** Ask the academy AI. Runs the full plan → tools → compose pipeline, scoped to role. */
export async function askAcademyAI(question: string, opts: AskOptions): Promise<AiAnswer> {
  // Follow-up carries the previous question's intent if the new one is a refinement.
  const effective = question.trim().length < 24 && opts.previousQuestion
    ? `${opts.previousQuestion} — ${question}`
    : question;

  const coaching = opts.role === 'head_coach';
  let toolKeys: ToolKey[];
  let tools: ToolResult[];
  let composed: Omit<AiAnswer, 'tools'>;

  if (coaching) {
    const c = planCoaching(effective);
    if (!c) {
      const refusal: AiAnswer = { ...COACHING_REFUSAL, tools: [] };
      try {
        await supabase.from('ai_queries').insert({ academy_id: opts.academyId, user_id: opts.userId ?? null, question, tools: [], filters: {}, answer: refusal.answer, confidence: refusal.confidence });
      } catch { /* best-effort */ }
      return refusal;
    }
    toolKeys = c.tools;
    tools = await runTools(toolKeys);
    composed = composeCoaching(c.intent, tools);
  } else {
    const planned = plan(effective);
    toolKeys = planned.tools;
    tools = await runTools(toolKeys);
    composed = compose(planned.intent, tools);
  }

  // Real-provider path: hand the deterministic tool output to the model to
  // phrase, never to compute. Falls back to the templated answer on any error.
  if (PROVIDER !== 'placeholder') {
    try {
      const { data } = await supabase.functions.invoke<{ answer: string; why: string; actions: string[] }>('ask-academy-ai', {
        body: { question, role: opts.role ?? null, tools },
      });
      if (data?.answer) composed = { ...composed, answer: data.answer, why: data.why ?? composed.why, actions: data.actions ?? composed.actions };
    } catch {
      /* fall back to placeholder composition */
    }
  }

  const result: AiAnswer = { ...composed, tools };

  // Best-effort audit log — never block the answer on logging.
  try {
    await supabase.from('ai_queries').insert({
      academy_id: opts.academyId, user_id: opts.userId ?? null,
      question, tools: toolKeys, filters: tools.reduce((acc, t) => ({ ...acc, [t.key]: t.filters }), {}),
      answer: result.answer, confidence: result.confidence,
    });
    if (opts.conversationId) {
      await supabase.from('ai_messages').insert([
        { academy_id: opts.academyId, conversation_id: opts.conversationId, role: 'user', content: question },
        { academy_id: opts.academyId, conversation_id: opts.conversationId, role: 'assistant', content: result.answer, meta: { evidence: result.evidence, actions: result.actions, confidence: result.confidence } },
      ]);
    }
  } catch { /* logging is best-effort */ }

  return result;
}

// ── Briefs ─────────────────────────────────────────────────────────────────────
export interface Brief {
  generatedAt: string;
  metrics: { label: string; value: string }[];
  priorities: string[];
  sections?: { title: string; lines: string[] }[];
}

export async function generateDailyBrief(): Promise<Brief> {
  const [kpis, leads, atRisk, capacity, coaches] = await runTools(['kpis', 'leads_to_contact', 'at_risk', 'capacity', 'coach_reports']);
  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: 'Active players', value: String(kpis.metrics.active) },
      { label: 'New leads (30d)', value: String(kpis.metrics.newLeads) },
      { label: 'Open leads to work', value: String(leads.metrics.open) },
      { label: 'Red-risk families', value: String(atRisk.metrics.red) },
      { label: 'Capacity flags', value: String(capacity.metrics.nearFull) },
      { label: 'Coach reports overdue', value: String(coaches.metrics.overdue) },
      { label: 'Outstanding', value: fmtAed(kpis.metrics.outstanding) },
    ],
    priorities: [
      leads.metrics.open > 0 ? `Contact the top priority leads (${leads.metrics.open} open)` : 'No leads waiting — good',
      atRisk.metrics.red > 0 ? `Call ${atRisk.metrics.red} red-risk famil${atRisk.metrics.red === 1 ? 'y' : 'ies'}` : 'No red-risk players today',
      capacity.metrics.nearFull > 0 ? `Review ${capacity.metrics.nearFull} near-capacity batch(es)` : 'Capacity healthy',
      coaches.metrics.overdue > 0 ? `Nudge ${coaches.metrics.overdue} overdue coach(es)` : 'Coach reporting current',
      kpis.metrics.outstanding > 0 ? `Chase ${fmtAed(kpis.metrics.outstanding)} outstanding` : 'Collections clean',
    ].filter(Boolean),
  };
}

export async function generateWeeklyBrief(): Promise<Brief> {
  const [kpis, funnel, revenue, atRisk, churn, capacity, coaches, campaigns] =
    await runTools(['kpis', 'funnel', 'revenue', 'at_risk', 'churn', 'capacity', 'coach_reports', 'campaigns']);
  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: 'Active players', value: String(kpis.metrics.active) },
      { label: 'Enrolments (mo)', value: `${funnel.metrics.enrol} (${funnel.metrics.enrolDelta >= 0 ? '+' : ''}${funnel.metrics.enrolDelta}%)` },
      { label: 'Revenue (mo)', value: fmtAed(revenue.metrics.month) },
      { label: 'Outstanding', value: fmtAed(revenue.metrics.outstanding) },
      { label: 'At-risk (red)', value: String(atRisk.metrics.red) },
      { label: 'Exits (90d)', value: String(churn.metrics.exits90) },
    ],
    sections: [
      { title: 'Growth', lines: [kpis.summary, funnel.summary] },
      { title: 'Revenue', lines: [revenue.summary] },
      { title: 'Retention', lines: [atRisk.summary, churn.summary] },
      { title: 'Capacity', lines: [capacity.summary] },
      { title: 'Coaching', lines: [coaches.summary] },
      { title: 'Marketing', lines: [campaigns.summary] },
    ],
    priorities: [
      funnel.metrics.showRateDelta < -5 ? 'Fix trial show-rate (add 24h reminders)' : 'Keep trial pipeline full',
      atRisk.metrics.red > 0 ? `Retention: work ${atRisk.metrics.red} red-risk families` : 'Retention healthy',
      revenue.metrics.outstanding > 0 ? `Collect ${fmtAed(revenue.metrics.outstanding)} outstanding` : 'Collections clean',
      capacity.metrics.nearFull > 0 ? 'Plan capacity where near-full' : 'Capacity has room',
    ],
  };
}

export { PROVIDER as AI_PROVIDER };
