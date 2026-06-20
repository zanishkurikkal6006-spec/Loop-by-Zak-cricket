-- ============================================================================
-- Loop by Zak Cricket — demo bootstrap (for testing login)
--
-- Run this ONCE, in the Supabase SQL editor, AFTER you have:
--   1. Applied migrations 0001 → 0002 → 0003 to the project, AND
--   2. Created three confirmed auth users in Authentication → Users
--      (click "Add user", tick "Auto Confirm User"), using these emails:
--         admin@zakcricket.ae   (password of your choice)
--         head@zakcricket.ae
--         coach@zakcricket.ae
--
-- This creates one academy, links each auth user to it with the right role,
-- seeds the package catalogue, and adds a little demo data so the screens
-- aren't empty. It is safe to re-run (idempotent).
-- ============================================================================

do $$
declare
  v_academy uuid;
  v_coach   uuid;
  v_center  uuid;
  g_elite   uuid;
  g_level   uuid;
  g_launch  uuid;
begin
  -- ── Academy (reuse if it already exists) ──────────────────────────────────
  select id into v_academy from public.academies where name = 'Zak Cricket Academy' limit 1;
  if v_academy is null then
    insert into public.academies (name) values ('Zak Cricket Academy') returning id into v_academy;
    perform public.provision_academy_defaults(v_academy);
  end if;

  -- ── Link each auth user (by email) to the academy with a role ─────────────
  insert into public.profiles (id, academy_id, role, full_name, email)
  select u.id, v_academy, v.role::user_role, v.full_name, u.email
  from (values
    ('admin@zakcricket.ae', 'Academy Admin', 'admin'),
    ('head@zakcricket.ae',  'Head Coach',    'head_coach'),
    ('coach@zakcricket.ae', 'Zanish',        'coach')
  ) as v(email, full_name, role)
  join auth.users u on lower(u.email) = lower(v.email)
  on conflict (id) do update
    set academy_id = excluded.academy_id,
        role       = excluded.role,
        full_name  = excluded.full_name,
        email      = excluded.email;

  select id into v_coach from public.profiles
  where academy_id = v_academy and role = 'coach' limit 1;

  -- ── Demo data (only if this academy has no groups yet) ────────────────────
  if not exists (select 1 from public.groups where academy_id = v_academy) then
    insert into public.training_centers (academy_id, name) values (v_academy, 'ICC Academy')
      returning id into v_center;

    insert into public.groups (academy_id, name, color, age_category, default_center_id)
      values (v_academy, 'Elite', '#9C1116', 'Under 16', v_center) returning id into g_elite;
    insert into public.groups (academy_id, name, color, age_category, default_center_id)
      values (v_academy, 'Level Up', '#C9A84C', 'Under 14', v_center) returning id into g_level;
    insert into public.groups (academy_id, name, color, age_category, default_center_id)
      values (v_academy, 'Launch Pad', '#1F8A4C', 'Under 12', v_center) returning id into g_launch;

    -- Assign the coach to all three groups so their screens have data.
    if v_coach is not null then
      insert into public.coach_groups (academy_id, coach_id, group_id)
        values (v_academy, v_coach, g_elite), (v_academy, v_coach, g_level), (v_academy, v_coach, g_launch);
    end if;

    -- A few players with parent numbers (use a real number to test WhatsApp).
    insert into public.players (academy_id, full_name, age, group_id, center_id, parent_name, parent_phone)
    values
      (v_academy, 'Ahmed Khan',   15, g_elite,  v_center, 'Mr. Khan',   '+971500000001'),
      (v_academy, 'Zara Ali',     13, g_level,  v_center, 'Mrs. Ali',   '+971500000002'),
      (v_academy, 'Rohan Mehta',  11, g_launch, v_center, 'Mr. Mehta',  '+971500000003'),
      (v_academy, 'Sara Hussain', 14, g_elite,  v_center, 'Mrs. Hussain','+971500000004');
  end if;

  raise notice 'Bootstrap complete for academy %', v_academy;
end $$;
