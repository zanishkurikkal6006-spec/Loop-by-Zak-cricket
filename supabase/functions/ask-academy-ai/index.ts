// Supabase Edge Function: ask-academy-ai
// The real-AI backend for Ask SKA AI. The ANTHROPIC_API_KEY lives only in
// Supabase secrets and is NEVER shipped to the browser.
//
// IMPORTANT — how this stays deterministic and tenant-safe:
//   • The client runs the APPROVED analytics tools first, under the signed-in
//     user's own session (RLS-scoped to their academy), and passes the RESULTS
//     in the request body. This function never queries the database and never
//     computes a figure — it only PHRASES the numbers it is given.
//   • The system prompt forbids inventing or altering any number. If the tools
//     returned nothing useful, it must say so rather than guess.
//   • Because the tools already ran under the caller's access, this function
//     cannot reach another tenant's data — it only sees what was handed to it.
//
// Deploy:  supabase functions deploy ask-academy-ai
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Then in the app set VITE_AI_PROVIDER=anthropic (or openai) and redeploy.

import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-4-8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ToolResult {
  key: string;
  label: string;
  summary: string;
  filters: Record<string, string | number>;
  metrics: Record<string, number>;
  rows?: { label: string; value: string }[];
}
interface RequestBody {
  question: string;
  role?: string | null;
  tools: ToolResult[];
}

const SYSTEM = [
  'You are the operations analyst for a cricket academy management platform (Powered by Loop by Zak Cricket).',
  'You are given a question and the RESULTS of pre-computed, permission-scoped analytics tools.',
  'Rules you must never break:',
  '1. Use ONLY the numbers in the provided tool results. Never invent, estimate, or alter a figure.',
  '2. If the tools do not contain enough to answer, say "I don\'t have enough recorded data to answer this reliably" and name what to start capturing.',
  '3. Never claim to have taken an action or decided anything — you only explain the data.',
  '4. Be concise, specific and business-like. No hedging, no fluff.',
  'Return ONLY a JSON object with exactly these keys: {"answer": string, "why": string, "actions": string[]}.',
  '"answer" is one or two sentences directly answering the question using the figures.',
  '"why" is the most likely data-supported explanation.',
  '"actions" is 2–4 short, prioritised, practical next steps.',
].join('\n');

function buildPrompt(b: RequestBody): string {
  const toolBlocks = (b.tools ?? []).map((t) => {
    const rows = (t.rows ?? []).map((r) => `    - ${r.label}: ${r.value}`).join('\n');
    return [
      `TOOL: ${t.label} (${t.key})`,
      `  summary: ${t.summary}`,
      `  filters: ${JSON.stringify(t.filters)}`,
      `  metrics: ${JSON.stringify(t.metrics)}`,
      rows ? `  rows:\n${rows}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return [
    b.role ? `The person asking has the role: ${b.role}.` : '',
    `Question: "${b.question}"`,
    '',
    'Tool results (the only data you may use):',
    toolBlocks || '(no tools returned data)',
    '',
    'Respond with the JSON object described in the system prompt.',
  ].filter(Boolean).join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body.question) {
      return new Response(JSON.stringify({ error: 'question is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(body) }],
    });

    const text = message.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join('\n')
      .trim();

    // Extract the JSON object the model was asked to return.
    let parsed: { answer?: string; why?: string; actions?: string[] } = {};
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    } catch {
      parsed = { answer: text };
    }

    return new Response(JSON.stringify({
      answer: parsed.answer ?? text,
      why: parsed.why ?? '',
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[ask-academy-ai] error', err);
    return new Response(JSON.stringify({ error: 'Failed to answer' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
