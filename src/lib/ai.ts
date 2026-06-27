import { supabase } from './supabase';
import type { Player } from './types';

// ============================================================================
// AI report generation — THE SINGLE SWAP POINT for all Anthropic-powered AI.
//
// Right now everything runs in PLACEHOLDER mode: realistic sample data is
// returned locally so the entire flow (notes → Generate → edit → WhatsApp,
// and CricHeros import) is fully testable for FREE — no Anthropic key, no cost.
//
// To go live with real AI later, this file is the ONLY thing that changes:
//   1. Flip USE_REAL_AI to true.
//   2. Add ANTHROPIC_API_KEY as a Supabase Edge Function secret and deploy
//      the `generate-report` function (already written, see supabase/functions).
// No UI, flow, component, or database changes are required — the function
// signatures below stay identical.
// ============================================================================

/** ← Flip to `true` once the Anthropic key is added and the edge fn is deployed. */
const USE_REAL_AI = false;

export interface QuickReportInput {
  type: 'quick';
  childFirstName: string;
  coachName?: string;
  notes: string;
  rewrite?: boolean;
}

export interface DevelopmentReportInput {
  type: 'development';
  childFirstName: string;
  coachName?: string;
  groupName?: string;
  focusAreas?: string;
  stats?: Record<string, string | number>;
  rewrite?: boolean;
}

export type ReportInput = QuickReportInput | DevelopmentReportInput;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Generate a parent report. Same signature in placeholder and real mode, so the
 * calling UI never changes.
 */
export async function generateReport(input: ReportInput): Promise<string> {
  if (USE_REAL_AI) {
    // ── REAL ANTHROPIC PATH ──────────────────────────────────────────────
    // Calls the Supabase Edge Function, which holds the Anthropic key
    // server-side — the key is never shipped to the browser.
    const { data, error } = await supabase.functions.invoke<{ text: string }>('generate-report', {
      body: input,
    });
    if (error) throw error;
    if (!data?.text) throw new Error('No report text returned');
    return data.text;
  }

  // PLACEHOLDER — replace with real Anthropic API call when API key is added.
  // Simulates the AI: a short delay (so the "generating" loop ring shows) then
  // a realistic, child-name-personalised sample report. Remove this block (or
  // just rely on USE_REAL_AI above) to go live.
  await delay(1100 + Math.random() * 600);
  return input.type === 'quick'
    ? samplePlaceholderQuickReport(input)
    : samplePlaceholderDevelopmentReport(input);
}

export interface ParsedScorecard {
  opponent: string;
  teamScore: string;
  result: string;
  playerOfMatchName?: string;
  players: {
    full_name: string;
    batting_position: number;
    runs: number;
    balls: number;
    how_out: string;
    wickets: number;
  }[];
}

/**
 * Read a CricHeros scorecard. Same signature in placeholder and real mode.
 * In real mode this would upload the scorecard and have the AI extract stats.
 */
export async function parseCricHerosScorecard(roster: Player[]): Promise<ParsedScorecard> {
  if (USE_REAL_AI) {
    // ── REAL ANTHROPIC PATH ──────────────────────────────────────────────
    const { data, error } = await supabase.functions.invoke<ParsedScorecard>('generate-report', {
      body: { type: 'cricheros', roster: roster.map((p) => p.full_name) },
    });
    if (error) throw error;
    if (!data) throw new Error('No scorecard returned');
    return data;
  }

  // PLACEHOLDER — replace with real Anthropic API call when API key is added.
  // Produces a believable scorecard from the coach's real roster so the import
  // → verify → save flow is fully testable for free.
  await delay(1400 + Math.random() * 800);
  return samplePlaceholderScorecard(roster);
}

// ── Placeholder sample generators ───────────────────────────────────────────
// (Everything below is sample data only; deleted once real AI is wired.)

function samplePlaceholderQuickReport(i: QuickReportInput): string {
  const name = i.childFirstName;
  const note = i.notes.trim();
  const noteClause = note ? ` — ${note.replace(/\.$/, '')}` : '';
  const signoff = i.coachName ? `\n\n— Coach ${i.coachName.split(' ')[0]}` : '';
  const variants = [
    `${name} showed great focus today${noteClause}. Their footwork is really improving and they're starting to trust their technique under pressure. A pleasure to coach — see you next session! 🏏${signoff}`,
    `Really pleased with ${name} today${noteClause}. They listened well, applied the feedback straight away, and kept their energy up throughout the session. Keep encouraging them at home — the progress is clear.${signoff}`,
    `${name} put in a brilliant shift today${noteClause}. Lovely attitude, sharp in the field, and asking good questions about their game. Exactly the mindset that turns into runs and wickets.${signoff}`,
    `Great session from ${name}${noteClause}. We worked on staying balanced at the crease and they picked it up quickly. Consistency is the next step, and they're well on the way.${signoff}`,
  ];
  return pick(variants);
}

function samplePlaceholderDevelopmentReport(i: DevelopmentReportInput): string {
  const name = i.childFirstName;
  const group = i.groupName ? ` (${i.groupName})` : '';
  const focus = i.focusAreas?.trim() || 'batting technique, game awareness, and fielding intensity';
  const coach = i.coachName ? `Coach ${i.coachName.split(' ')[0]}` : 'The coaching team';
  const strengthsVariants = [
    `${name} has made real strides this block. Their hand-eye coordination and timing at the crease have noticeably improved, and they're far more decisive in shot selection. In the field, their anticipation and commitment have stood out.`,
    `It's been a strong block for ${name}. They've grown in confidence, communicate well with teammates, and consistently bring energy to every drill. Their bowling action is becoming more repeatable, which is paying off in control.`,
  ];
  const nextVariants = [
    `Next block we'll focus on playing straighter under pace and building longer innings through better running between the wickets. A little work on the front-foot defence will round out a very solid game.`,
    `The next step is converting good starts into bigger scores and sharpening decision-making in the middle overs. We'll also add some targeted work on backing up in the field.`,
  ];
  const headlineVariants = [
    `A really encouraging block for ${name}${group} — clear progress, a great attitude, and plenty to build on.`,
    `${name}${group} has grown noticeably this block, both in skill and confidence. Here's the full picture.`,
    `A strong block of development for ${name}${group}, with standout moments and clear next steps.`,
  ];
  const attitudeVariants = [
    `${name} brings energy and a coachable attitude to every session, listens carefully, and supports teammates well.`,
    `Consistent effort, great body language, and a genuine love for the game — ${name} sets a positive tone in the group.`,
  ];
  // Sections are emitted as UPPERCASE headings followed by body text; the PDF
  // renders each as its own styled block (the title is added by the template).
  return [
    `HEADLINE`,
    pick(headlineVariants),
    ``,
    `FOCUS AREAS THIS BLOCK`,
    focus.charAt(0).toUpperCase() + focus.slice(1) + '.',
    ``,
    `PROGRESS & STRENGTHS`,
    pick(strengthsVariants),
    ``,
    `ATTITUDE & EFFORT`,
    pick(attitudeVariants),
    ``,
    `WHAT TO WORK ON NEXT`,
    pick(nextVariants),
    ``,
    `COACH'S NOTE`,
    `${name} is a joy to coach. Keep supporting their love of the game at home — the foundations being laid now will serve them well. — ${coach}, Loop by Zak Cricket`,
  ].join('\n');
}

function samplePlaceholderScorecard(roster: Player[]): ParsedScorecard {
  const sample = roster.slice(0, Math.min(7, roster.length));
  const outcomes = ['Bowled', 'Caught', 'LBW', 'Run out', 'Not out', 'Stumped'];
  const players = sample.map((p, idx) => {
    const runs = Math.floor(Math.random() * 60);
    const balls = runs + Math.floor(Math.random() * 25);
    return {
      full_name: p.full_name,
      batting_position: idx + 1,
      runs,
      balls,
      how_out: idx === sample.length - 1 ? 'Not out' : pick(outcomes),
      wickets: Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 1 : 0,
    };
  });
  const total = players.reduce((s, p) => s + p.runs, 0) + 12; // + extras
  const wkts = players.filter((p) => p.how_out !== 'Not out').length;
  const pom = [...players].sort((a, b) => b.runs - a.runs)[0];
  return {
    opponent: pick(['Dubai Stars CC', 'Sharjah Falcons', 'Abu Dhabi Titans', 'Gulf Juniors']),
    teamScore: `${total}/${wkts}`,
    result: Math.random() > 0.5 ? 'Won' : 'Lost',
    playerOfMatchName: pom?.full_name,
    players,
  };
}
