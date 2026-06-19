-- ============================================================================
-- Loop by Zak Cricket — Row Level Security
-- Multi-tenancy is enforced here, in Postgres, not in the app. Every table is
-- locked to the signed-in user's academy. Finance tables additionally deny
-- read access to coach / head_coach roles.
-- ============================================================================

-- ── Helpers ───────────────────────────────────────────────────────────────────
-- Returns the academy_id of the currently signed-in user. SECURITY DEFINER so
-- it can read profiles regardless of that table's own RLS (avoids recursion).
create or replace function auth.user_academy_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select academy_id from public.profiles where id = auth.uid()
$$;

create or replace function auth.user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- True when the signed-in user can see finance (admin only).
create or replace function auth.can_see_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false)
$$;

-- ── Enable RLS everywhere ─────────────────────────────────────────────────────
alter table academies            enable row level security;
alter table profiles             enable row level security;
alter table training_centers     enable row level security;
alter table groups               enable row level security;
alter table batches              enable row level security;
alter table batch_groups         enable row level security;
alter table coach_groups         enable row level security;
alter table players              enable row level security;
alter table package_types        enable row level security;
alter table packages             enable row level security;
alter table one_to_one_blocks    enable row level security;
alter table one_to_one_sessions  enable row level security;
alter table attendance_sessions  enable row level security;
alter table attendance_records   enable row level security;
alter table reports              enable row level security;
alter table matches              enable row level security;
alter table match_players        enable row level security;
alter table payments             enable row level security;
alter table match_fees           enable row level security;
alter table ground_fees          enable row level security;
alter table badge_types          enable row level security;
alter table player_badges        enable row level security;
alter table programs             enable row level security;
alter table program_enrollments  enable row level security;
alter table outbound_messages    enable row level security;

-- ── Academies: a user sees only their own academy ─────────────────────────────
create policy academy_select on academies
  for select using (id = auth.user_academy_id());
create policy academy_update on academies
  for update using (id = auth.user_academy_id() and auth.user_role() = 'admin');

-- ── Profiles: read same-academy; users update their own row ───────────────────
create policy profiles_select on profiles
  for select using (academy_id = auth.user_academy_id());
create policy profiles_update_self on profiles
  for update using (id = auth.uid());
create policy profiles_admin_write on profiles
  for all using (academy_id = auth.user_academy_id() and auth.user_role() = 'admin')
  with check (academy_id = auth.user_academy_id() and auth.user_role() = 'admin');

-- ── Generic per-academy policy for the bulk of tables ─────────────────────────
-- Helper to apply "same academy, full access" to a list of tables.
do $$
declare
  t text;
  tenant_tables text[] := array[
    'training_centers','groups','batches','coach_groups','players',
    'package_types','packages','one_to_one_blocks','one_to_one_sessions',
    'attendance_sessions','attendance_records','reports','matches',
    'match_players','badge_types','player_badges','programs',
    'program_enrollments','outbound_messages'
  ];
begin
  foreach t in array tenant_tables loop
    execute format($f$
      create policy %1$s_tenant_all on %1$s
        for all
        using (academy_id = auth.user_academy_id())
        with check (academy_id = auth.user_academy_id());
    $f$, t);
  end loop;
end $$;

-- batch_groups has no academy_id of its own — gate via its parent batch.
create policy batch_groups_tenant_all on batch_groups
  for all
  using (exists (
    select 1 from batches b
    where b.id = batch_groups.batch_id and b.academy_id = auth.user_academy_id()
  ))
  with check (exists (
    select 1 from batches b
    where b.id = batch_groups.batch_id and b.academy_id = auth.user_academy_id()
  ));

-- badge_types also exposes global defaults (academy_id is null) read-only.
create policy badge_types_global_read on badge_types
  for select using (academy_id is null);

-- ── Finance tables: same academy AND admin-only ───────────────────────────────
-- payments / match_fees / ground_fees. Head Coach and Coach get NO access here.
-- (Coaches collect match fees through a dedicated, scoped path — see note below.)
create policy payments_admin_only on payments
  for all
  using (academy_id = auth.user_academy_id() and auth.can_see_finance())
  with check (academy_id = auth.user_academy_id() and auth.can_see_finance());

create policy ground_fees_admin_only on ground_fees
  for all
  using (academy_id = auth.user_academy_id() and auth.can_see_finance())
  with check (academy_id = auth.user_academy_id() and auth.can_see_finance());

-- match_fees: admin full access; a coach may read/update fees for matches they
-- coordinate (they collect/confirm on the ground), but never academy-wide totals.
create policy match_fees_admin_all on match_fees
  for all
  using (academy_id = auth.user_academy_id() and auth.can_see_finance())
  with check (academy_id = auth.user_academy_id() and auth.can_see_finance());

create policy match_fees_coach_own on match_fees
  for select
  using (
    academy_id = auth.user_academy_id()
    and exists (
      select 1 from matches m
      where m.id = match_fees.match_id and m.coach_id = auth.uid()
    )
  );

create policy match_fees_coach_update on match_fees
  for update
  using (
    academy_id = auth.user_academy_id()
    and exists (
      select 1 from matches m
      where m.id = match_fees.match_id and m.coach_id = auth.uid()
    )
  );
