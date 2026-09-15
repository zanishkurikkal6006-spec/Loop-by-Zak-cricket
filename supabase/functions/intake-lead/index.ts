// Supabase Edge Function: intake-lead
// A secure inbox for leads from outside the app — Meta Lead Ads (via Zapier or
// Make), a website form, WhatsApp, etc. The caller proves which academy it is
// with that academy's secret intake_token; no logged-in user is needed.
//
// It inserts a row into `leads`; the autotask_on_lead DB trigger then creates
// the "Call parent" follow-up automatically. Uses the service-role key (kept in
// Supabase secrets, never in the browser) but scopes strictly to the academy
// the token resolves to — so one academy can never post into another.
//
// Deploy:  supabase functions deploy intake-lead --no-verify-jwt
// Secrets: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (already set for the app)
//
// POST body (JSON) — flexible field names so it maps cleanly from Zapier:
//   { "token": "<academy intake_token>",
//     "parent_name" | "full_name" | "name",
//     "player_name" | "child_name",
//     "phone" | "phone_number", "email", "area", "school",
//     "source" (default "meta"), "campaign", "notes" }
// Meta's raw { "field_data": [{ "name": "...", "values": ["..."] }] } is also read.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const VALID_SOURCES = new Set([
  'meta', 'google', 'instagram_organic', 'website', 'whatsapp', 'school', 'referral',
  'event', 'community', 'walk_in', 'super_kings_database', 'partner', 'other',
]);

/** Flatten Meta's field_data array into a plain lookup. */
function fromMeta(fieldData: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(fieldData)) {
    for (const f of fieldData) {
      const name = (f?.name ?? '').toString().toLowerCase();
      const value = Array.isArray(f?.values) ? f.values[0] : f?.value;
      if (name && value != null) out[name] = String(value);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'Server not configured' }, 500);

    const raw = (await req.json()) as Record<string, unknown>;
    const meta = fromMeta(raw.field_data);
    const pick = (...keys: string[]): string | null => {
      for (const k of keys) {
        const v = (raw[k] ?? meta[k] ?? meta[k.replace(/_/g, ' ')]) as string | undefined;
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
      return null;
    };

    const token = pick('token', 'intake_token');
    if (!token) return json({ error: 'Missing token' }, 401);

    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Resolve the academy from the secret token (this is the authorisation).
    const { data: academy, error: aErr } = await db
      .from('academies').select('id').eq('intake_token', token).single();
    if (aErr || !academy) return json({ error: 'Invalid token' }, 401);

    const playerName = pick('player_name', 'child_name', 'child', 'player');
    const parentName = pick('parent_name', 'full_name', 'name', 'parent');
    if (!playerName && !parentName) return json({ error: 'A player or parent name is required' }, 400);

    let source = (pick('source') ?? 'meta').toLowerCase().replace(/[\s-]+/g, '_');
    if (!VALID_SOURCES.has(source)) source = 'other';

    const { data: lead, error: lErr } = await db.from('leads').insert({
      academy_id: academy.id,
      player_name: playerName ?? parentName,
      parent_name: parentName,
      phone: pick('phone', 'phone_number', 'mobile'),
      email: pick('email'),
      area: pick('area', 'location', 'city'),
      school: pick('school'),
      source,
      campaign: pick('campaign', 'campaign_name', 'ad_name'),
      notes: pick('notes', 'message', 'comments'),
      stage: 'new',
    }).select('id').single();
    if (lErr) return json({ error: 'Could not save lead', detail: lErr.message }, 500);

    // The autotask_on_lead trigger has already created the "Call parent" task.
    return json({ ok: true, lead_id: lead.id });
  } catch (err) {
    console.error('[intake-lead] error', err);
    return json({ error: 'Bad request' }, 400);
  }
});
