import { supabase } from './supabase';

// ============================================================================
// Expansion intelligence — area-level demand clustering from recorded geography
// (players, leads, lost leads, distance objections, school demand). It surfaces
// areas worth INVESTIGATING for a second centre. It never claims to have chosen
// a site, and it always names the data that's missing.
// ============================================================================

const norm = (a: string | null | undefined) => (a && a.trim() ? a.trim() : null);

export interface AreaSignal {
  area: string;
  activePlayers: number;
  leads: number;
  lostLeads: number;
  distanceObjections: number; // lost leads whose reason mentions location/distance/timing
  schoolPotential: number;    // sum of potential_students from schools in the area
  score: number;
  risks: string[];
}

export interface ExpansionReport {
  areas: AreaSignal[];
  missingData: string[];
  covered: number; // % of records that had an area recorded
}

export async function computeExpansion(): Promise<ExpansionReport> {
  const [players, leads, schools] = await Promise.all([
    supabase.from('players').select('area, status').eq('status', 'active'),
    supabase.from('leads').select('area, stage, lost_reason'),
    supabase.from('schools').select('area, potential_students, stage'),
  ]);

  const pl = (players.data ?? []) as { area: string | null }[];
  const ld = (leads.data ?? []) as { area: string | null; stage: string; lost_reason: string | null }[];
  const sc = (schools.data ?? []) as { area: string | null; potential_students: number | null }[];

  const map = new Map<string, AreaSignal>();
  const get = (area: string) => {
    let s = map.get(area);
    if (!s) { s = { area, activePlayers: 0, leads: 0, lostLeads: 0, distanceObjections: 0, schoolPotential: 0, score: 0, risks: [] }; map.set(area, s); }
    return s;
  };

  let withArea = 0; const total = pl.length + ld.length;
  for (const p of pl) { const a = norm(p.area); if (a) { get(a).activePlayers += 1; withArea++; } }
  for (const l of ld) {
    const a = norm(l.area); if (!a) continue; withArea++;
    const s = get(a); s.leads += 1;
    if (l.stage === 'lost') {
      s.lostLeads += 1;
      const r = (l.lost_reason ?? '').toLowerCase();
      if (r.includes('distance') || r.includes('location') || r.includes('far') || r.includes('timing') || r.includes('travel')) s.distanceObjections += 1;
    }
  }
  for (const s of sc) { const a = norm(s.area); if (a) get(a).schoolPotential += Number(s.potential_students || 0); }

  // Demand score: unmet interest (leads + distance objections + school potential)
  // relative to how little is currently served there.
  const areas = [...map.values()].map((s) => {
    s.score = s.leads * 2 + s.distanceObjections * 4 + Math.round(s.schoolPotential / 20) - s.activePlayers;
    if (s.activePlayers > 0 && s.distanceObjections === 0) s.risks.push('Already partly served — validate incremental demand');
    if (s.leads < 5 && s.schoolPotential === 0) s.risks.push('Thin data — few leads and no school pipeline recorded');
    if (s.distanceObjections > 0) s.risks.push(`${s.distanceObjections} lead(s) lost citing distance/timing`);
    return s;
  }).sort((a, b) => b.score - a.score);

  const missingData: string[] = [];
  const coverage = total > 0 ? Math.round((withArea / total) * 100) : 0;
  if (coverage < 70) missingData.push(`Only ${coverage}% of players/leads have an area recorded — make Area a required field to improve this.`);
  if (!ld.some((l) => l.stage === 'lost' && l.lost_reason)) missingData.push('Few lost leads have a reason — capture Lost Reason so distance objections are visible.');
  if (!sc.length) missingData.push('No schools recorded — the school pipeline strengthens area demand signals.');

  return { areas, missingData, covered: coverage };
}
