// Supabase Edge Function: generate-report
// Writes AI parent reports using the Anthropic API. The ANTHROPIC_API_KEY lives
// only in Supabase secrets and is NEVER shipped to the browser — the client
// calls this function, the function calls Anthropic.
//
// Deploy:  supabase functions deploy generate-report
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Two report types (both coach-triggered; nothing auto-fires):
//   - quick:       per-session feedback expanded from 2–3 rough words
//   - development: end-of-block report from structured stats
// Every report addresses the child by first name so it reads personal.

import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-4-8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  type: 'quick' | 'development';
  childFirstName: string;
  coachName?: string;
  notes?: string; // quick: the 2–3 rough words
  // development:
  groupName?: string;
  focusAreas?: string;
  stats?: Record<string, string | number>;
  rewrite?: boolean; // ask for a fresh take on a regenerate
}

function buildPrompt(b: RequestBody): string {
  const child = b.childFirstName;
  if (b.type === 'quick') {
    return [
      `Write a warm, personal WhatsApp message from a cricket coach to ${child}'s parent about today's training session.`,
      `Address the child by their first name (${child}) so it reads personal, not generic.`,
      `The coach's rough notes: "${b.notes ?? ''}".`,
      `Expand these into 2–4 encouraging sentences a parent would love to receive.`,
      `Keep it specific to what the notes say. Professional but warm. No hashtags, no emoji spam (one tasteful emoji at most).`,
      b.coachName ? `Sign off as Coach ${b.coachName}.` : '',
      `Return ONLY the message text, ready to send.`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  // development
  const statLines = Object.entries(b.stats ?? {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return [
    `Write an end-of-block cricket development report for ${child} (group: ${b.groupName ?? 'n/a'}).`,
    `Address the child by first name throughout.`,
    `Focus areas this block: ${b.focusAreas ?? 'general development'}.`,
    statLines ? `Session/performance stats:\n${statLines}` : '',
    `Structure the report with these sections, each a short paragraph:`,
    `1. Focus areas  2. Progress & strengths  3. What to work on next  4. Coach's note.`,
    `Tone: premium, professional, encouraging — written for serious parents, not a kids' app.`,
    b.coachName ? `Coach's note is from Coach ${b.coachName}.` : '',
    `Return the report body only (no preamble like "Here is").`,
  ]
    .filter(Boolean)
    .join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Require an authenticated Supabase user (JWT forwarded by the client).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body.childFirstName || !body.type) {
      return new Response(JSON.stringify({ error: 'childFirstName and type are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: 'adaptive' },
      system:
        "You are an expert cricket coach at Loop by Zak Cricket, a premium UAE academy. " +
        "You write warm, specific, professional messages to parents. You always address " +
        "the child by their first name so the message feels personal. You never invent " +
        "achievements that aren't supported by the coach's notes.",
      messages: [{ role: 'user', content: buildPrompt(body) }],
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim();

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[generate-report] error', err);
    return new Response(JSON.stringify({ error: 'Failed to generate report' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
