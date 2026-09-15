import { supabase } from './supabase';
import { GROWTH_TARGETS } from './crm';

// ============================================================================
// Deterministic forecasting + scenario maths. Numbers are computed here, in
// code, from recorded history — the AI only ever explains them. Assumptions are
// always returned alongside the projection and shown to the user; nothing is
// hidden. Scenarios are clearly separated from the base forecast.
// ============================================================================

const endOfMonth = (monthsAgo: number): string => {
  const d = new Date();
  // Day 0 of (thisMonth - monthsAgo + 1) = last day of the target month.
  return new Date(d.getFullYear(), d.getMonth() - monthsAgo + 1, 0).toISOString().slice(0, 10);
};
const monthsBetween = (isoA: string, isoB: number | Date): number => {
  const a = new Date(isoA); const b = isoB instanceof Date ? isoB : new Date(isoB);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
};

export interface GrowthForecast {
  current: number;
  avgEnrol: number;         // avg gross monthly enrolments (recent window)
  avgExit: number;          // avg monthly exits (recent window)
  net: number;              // avgEnrol − avgExit
  monthsSinceLaunch: number;
  targetNow: number;        // 24-month plan target for the current month
  onTrackDelta: number;     // current − targetNow
  arpu: number;
  history: { label: string; actual: number; target: number }[];
  projection: { month: number; projected: number; target: number; revenue: number }[];
  reachMonthsTo500: number | null;
  reachDate: string | null;
  assumptions: string[];
  dataThin: boolean;
}

/** Reconstruct the active-player series and project it forward, deterministically. */
export async function computeGrowthForecast(): Promise<GrowthForecast> {
  const [players, churn, academy, payments] = await Promise.all([
    supabase.from('players').select('joined_at, exited_at, status'),
    supabase.from('churn_records').select('exit_date'),
    supabase.from('academies').select('created_at').single(),
    supabase.from('payments').select('amount, status, paid_at'),
  ]);

  const pl = (players.data ?? []) as { joined_at: string | null; exited_at: string | null; status: string }[];
  const churnRows = (churn.data ?? []) as { exit_date: string }[];
  const createdAt = (academy.data as { created_at: string } | null)?.created_at ?? new Date().toISOString();

  const activeAt = (dateISO: string) => pl.filter((p) =>
    (p.joined_at ?? '9999') <= dateISO && (!p.exited_at || p.exited_at > dateISO),
  ).length;

  const current = pl.filter((p) => p.status === 'active').length;
  const monthsSinceLaunch = Math.max(0, monthsBetween(createdAt, Date.now()));
  const targetFor = (monthIdx: number) => GROWTH_TARGETS[Math.min(Math.max(monthIdx, 0), GROWTH_TARGETS.length - 1)];
  const targetNow = targetFor(monthsSinceLaunch);

  // Recent averages over the last 3 months.
  const since3 = endOfMonth(3);
  const enrol3 = pl.filter((p) => (p.joined_at ?? '') > since3).length;
  const exit3 = churnRows.filter((c) => (c.exit_date ?? '') > since3).length;
  const avgEnrol = Math.round((enrol3 / 3) * 10) / 10;
  const avgExit = Math.round((exit3 / 3) * 10) / 10;
  const net = Math.round((avgEnrol - avgExit) * 10) / 10;

  // ARPU from last month's confirmed revenue.
  const mPrefix = new Date().toISOString().slice(0, 7);
  const pay = (payments.data ?? []) as { amount: number; status: string; paid_at: string | null }[];
  const monthRevenue = pay.filter((p) => p.status === 'confirmed' && (p.paid_at ?? '').startsWith(mPrefix)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const arpu = current ? Math.round(monthRevenue / current) : 0;

  // History: last 6 months actual vs plan.
  const history: GrowthForecast['history'] = [];
  for (let m = 5; m >= 0; m--) {
    history.push({
      label: new Date(new Date().getFullYear(), new Date().getMonth() - m, 1).toLocaleDateString('en-AE', { month: 'short' }),
      actual: activeAt(endOfMonth(m)),
      target: targetFor(monthsSinceLaunch - m),
    });
  }

  // Projection: 12 months forward at the current net rate.
  const projection: GrowthForecast['projection'] = [];
  let running = current;
  for (let m = 1; m <= 12; m++) {
    running = Math.max(0, Math.round(running + net));
    projection.push({ month: monthsSinceLaunch + m, projected: running, target: targetFor(monthsSinceLaunch + m), revenue: running * arpu });
  }

  // Months to 500 at the current net rate.
  let reachMonthsTo500: number | null = null;
  if (net > 0 && current < 500) {
    reachMonthsTo500 = Math.ceil((500 - current) / net);
  } else if (current >= 500) {
    reachMonthsTo500 = 0;
  }
  const reachDate = reachMonthsTo500 != null
    ? new Date(new Date().getFullYear(), new Date().getMonth() + reachMonthsTo500, 1).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })
    : null;

  const dataThin = enrol3 + exit3 < 3;

  return {
    current, avgEnrol, avgExit, net, monthsSinceLaunch, targetNow,
    onTrackDelta: current - targetNow, arpu, history, projection, reachMonthsTo500, reachDate,
    assumptions: [
      `Net growth held at the last-3-month average (${avgEnrol}/mo enrolments − ${avgExit}/mo exits = ${net}/mo).`,
      `ARPU held at ${arpu} AED (this month's revenue ÷ active players).`,
      `Plan targets from the 24-month 500-player ramp, anchored to the academy's start month.`,
    ],
    dataThin,
  };
}

// ── Scenario planner (levers on the base forecast) ─────────────────────────────
export interface ScenarioLevers {
  extraEnrolPerMonth: number; // e.g. marketing / trial-conversion uplift
  exitReductionPct: number;   // retention improvement, 0–100
  capacityAddPerMonth: number; // new batches/centre add headroom
}

export interface ScenarioResult {
  baseNet: number;
  scenarioNet: number;
  base12: number;
  scenario12: number;
  reachBase: number | null;
  reachScenario: number | null;
  assumptions: string[];
}

/** Apply levers to the base forecast. Clearly a SCENARIO, not a forecast. */
export function runScenario(f: GrowthForecast, levers: ScenarioLevers): ScenarioResult {
  const scenarioEnrol = f.avgEnrol + levers.extraEnrolPerMonth + levers.capacityAddPerMonth;
  const scenarioExit = Math.max(0, f.avgExit * (1 - levers.exitReductionPct / 100));
  const scenarioNet = Math.round((scenarioEnrol - scenarioExit) * 10) / 10;

  const project = (net: number) => { let r = f.current; for (let m = 0; m < 12; m++) r = Math.max(0, r + net); return Math.round(r); };
  const reach = (net: number) => (net > 0 && f.current < 500 ? Math.ceil((500 - f.current) / net) : f.current >= 500 ? 0 : null);

  return {
    baseNet: f.net, scenarioNet,
    base12: project(f.net), scenario12: project(scenarioNet),
    reachBase: reach(f.net), reachScenario: reach(scenarioNet),
    assumptions: [
      `+${levers.extraEnrolPerMonth} enrolments/mo from acquisition/conversion uplift.`,
      `Exits reduced ${levers.exitReductionPct}% from retention work.`,
      `+${levers.capacityAddPerMonth} enrolments/mo of added capacity headroom.`,
      'Historical net rate is the base; levers are applied on top. This is a scenario, not a prediction.',
    ],
  };
}
