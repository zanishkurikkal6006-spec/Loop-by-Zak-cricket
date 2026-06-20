// Supabase Edge Function: create-staff
// Lets an academy ADMIN create a coach / head-coach / admin login from the app.
//
// Creating auth users requires the service-role key, which must never be in the
// browser — so it happens here. Supabase injects SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY into edge functions automatically, so there is no
// secret to set. Deploy with:  supabase functions deploy create-staff
//
// Security: the caller's JWT is verified, and we confirm the caller is an admin
// before creating anyone. The new staff member is always placed in the caller's
// own academy (never a client-supplied academy_id) — multi-tenancy stays intact.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const ROLES = ['coach', 'head_coach', 'admin'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const jwt = authHeader.replace('Bearer ', '');

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    // 1. Identify the caller and confirm they are an admin.
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

    const { data: caller } = await admin
      .from('profiles')
      .select('academy_id, role')
      .eq('id', userData.user.id)
      .single();
    if (!caller || caller.role !== 'admin') return json({ error: 'Admins only' }, 403);

    // 2. Validate input.
    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const fullName = String(body.full_name ?? '').trim();
    const role = String(body.role ?? '');
    if (!email || password.length < 6 || !fullName || !ROLES.includes(role)) {
      return json({ error: 'email, password (6+ chars), full_name and a valid role are required' }, 400);
    }

    // 3. Create the confirmed auth user.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? 'Could not create user' }, 400);
    }

    // 4. Link them to the caller's academy with the chosen role.
    const { error: profErr } = await admin.from('profiles').insert({
      id: created.user.id,
      academy_id: caller.academy_id,
      role,
      full_name: fullName,
      email,
    });
    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id); // best-effort rollback
      return json({ error: profErr.message }, 400);
    }

    return json({ ok: true, id: created.user.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
