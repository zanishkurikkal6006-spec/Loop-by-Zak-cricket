-- ============================================================================
-- Loop by Zak Cricket — COMPLETE DATABASE SETUP (one-paste bundle)
--
-- Convenience copy of migrations/0001_schema + 0002_rls + 0003_seed, in order.
-- Source of truth is supabase/migrations/. Paste this whole file into the
-- Supabase SQL Editor and Run to create every table, RLS policy, and seed.
-- Creates 25 tables, 15 enums, RLS on all tables, and the badge/package seed.
-- ============================================================================

-- ▼▼▼ 0001_schema.sql ▼▼▼
-- ============================================================================
-- Loop by Zak Cricket — schema
-- Multi-tenant: every table carries academy_id. RLS (in 0002_rls.sql) enforces
-- per-academy isolation. This file defines tables, enums, and helpers only.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────
create type user_role        as enum ('admin', 'head_coach', 'coach');
create type package_kind      as enum ('standard', 'unlimited', 'complimentary');
create type package_source    as enum ('admin_assigned', 'coach_added');
create type payment_status    as enum ('paid', 'pending');
create type attendance_state  as enum ('present', 'late');           -- NO "absent"
create type attendance_status as enum ('pending', 'confirmed');
create type report_type       as enum ('quick', 'development');
create type report_status     as enum ('draft', 'sent');
create type match_source      as enum ('manual', 'cricheros');
create type payment_category  as enum ('package', 'one_to_one', 'match_fee', 'ground_fee');
create type payment_mode      as enum ('cash', 'bank', 'pending', 'screenshot');
create type payment_state     as enum ('confirmed', 'pending', 'awaiting');
create type badge_category    as enum ('performance', 'attendance', 'progress', 'moment');
create type badge_send_flow   as enum ('auto', 'approval');
create type badge_approval    as enum ('pending', 'approved', 'sent');

-- ── Tenancy root ─────────────────────────────────────────────────────────────
create table academies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  logo_url     text,
  bank_details jsonb default '{}'::jsonb,   -- shared with parents for transfers
  wa_settings  jsonb default '{}'::jsonb,   -- WhatsApp config (future Business API)
  created_at   timestamptz not null default now()
);

-- Profiles mirror auth.users 1:1 and bind a user to an academy + role.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  academy_id  uuid not null references academies (id) on delete cascade,
  role        user_role not null default 'coach',
  full_name   text not null,
  email       text,
  phone       text,
  avatar_url  text,
  status      text default 'active',
  created_at  timestamptz not null default now()
);
create index on profiles (academy_id);

-- ── Org structure ────────────────────────────────────────────────────────────
create table training_centers (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  name       text not null,
  address    text
);
create index on training_centers (academy_id);

create table groups (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references academies (id) on delete cascade,
  name              text not null,
  color             text default '#9C1116',
  age_category      text,
  default_center_id uuid references training_centers (id) on delete set null
);
create index on groups (academy_id);

create table batches (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  name       text not null,
  center_id  uuid references training_centers (id) on delete set null,
  start_time time,
  end_time   time
);
create index on batches (academy_id);

-- batch ↔ groups (a batch can run multiple groups)
create table batch_groups (
  batch_id uuid not null references batches (id) on delete cascade,
  group_id uuid not null references groups (id) on delete cascade,
  primary key (batch_id, group_id)
);

-- a coach's assigned groups (a coach only ever sees these)
create table coach_groups (
  academy_id uuid not null references academies (id) on delete cascade,
  coach_id   uuid not null references profiles (id) on delete cascade,
  group_id   uuid not null references groups (id) on delete cascade,
  primary key (coach_id, group_id)
);
create index on coach_groups (academy_id);

-- ── Players ──────────────────────────────────────────────────────────────────
create table players (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references academies (id) on delete cascade,
  full_name    text not null,
  dob          date,
  age          int,
  group_id     uuid references groups (id) on delete set null,
  center_id    uuid references training_centers (id) on delete set null,
  parent_name  text,
  parent_phone text,                          -- E.164 for wa.me click-to-send
  avatar_url   text,
  joined_at    date default now(),
  status       text default 'active',
  last_seen_at date,                          -- updated on attendance; "not seen" lists
  created_at   timestamptz not null default now()
);
create index on players (academy_id);
create index on players (group_id);

-- ── Packages (group sessions) ─────────────────────────────────────────────────
-- Catalogue: 4/200 · 8/380 · 12/550 · 20/850 · Unlimited/1200 · Complimentary
create table package_types (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  name       text not null,
  sessions   int,                  -- null = unlimited
  price      numeric(10,2) not null default 0,
  kind       package_kind not null default 'standard'
);
create index on package_types (academy_id);

create table packages (
  id                 uuid primary key default gen_random_uuid(),
  academy_id         uuid not null references academies (id) on delete cascade,
  player_id          uuid not null references players (id) on delete cascade,
  package_type_id    uuid references package_types (id) on delete set null,
  sessions_total     int,                                 -- null = unlimited
  sessions_used      int not null default 0,
  -- "remaining auto-calculates" (day-one mid-package import sets sessions_used)
  sessions_remaining int generated always as (
    case when sessions_total is null then null else sessions_total - sessions_used end
  ) stored,
  source             package_source not null default 'admin_assigned',
  payment_status     payment_status not null default 'paid',
  assigned_by        uuid references profiles (id) on delete set null,
  started_at         date default now(),
  created_at         timestamptz not null default now()
);
create index on packages (academy_id);
create index on packages (player_id);

-- ── 1-on-1 blocks ──────────────────────────────────────────────────────────--
create table one_to_one_blocks (
  id                 uuid primary key default gen_random_uuid(),
  academy_id         uuid not null references academies (id) on delete cascade,
  player_id          uuid not null references players (id) on delete cascade,
  coach_id           uuid not null references profiles (id) on delete cascade,
  focus_note         text,
  sessions_total     int not null,
  sessions_used      int not null default 0,
  sessions_remaining int generated always as (sessions_total - sessions_used) stored,
  source             package_source not null default 'admin_assigned',
  payment_status     payment_status not null default 'paid',
  assigned_by        uuid references profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index on one_to_one_blocks (academy_id);
create index on one_to_one_blocks (coach_id);

create table one_to_one_sessions (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references academies (id) on delete cascade,
  block_id     uuid not null references one_to_one_blocks (id) on delete cascade,
  session_date date not null default now(),
  time_slot    text,
  report_id    uuid,                          -- FK added after reports table
  logged_by    uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on one_to_one_sessions (academy_id);

-- ── Attendance (Present / Late only) ──────────────────────────────────────────
create table attendance_sessions (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references academies (id) on delete cascade,
  batch_id          uuid references batches (id) on delete set null,
  group_id          uuid references groups (id) on delete set null,
  session_date      date not null default now(),
  coach_id          uuid references profiles (id) on delete set null,
  credited_coach_id uuid references profiles (id) on delete set null, -- admin "covers"
  status            attendance_status not null default 'pending',
  submitted_at      timestamptz default now(),
  confirmed_by      uuid references profiles (id) on delete set null,
  dedup_choice      jsonb default '{}'::jsonb,  -- cross-coach double-marking choices
  created_at        timestamptz not null default now()
);
create index on attendance_sessions (academy_id);
create index on attendance_sessions (session_date);

create table attendance_records (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references academies (id) on delete cascade,
  session_id       uuid not null references attendance_sessions (id) on delete cascade,
  player_id        uuid not null references players (id) on delete cascade,
  state            attendance_state not null,             -- present | late
  also_marked_by   uuid references profiles (id) on delete set null, -- double-marking
  deduct_sessions  int not null default 1,                -- 1 (default) or 2
  unique (session_id, player_id)
);
create index on attendance_records (academy_id);

-- ── Reports (AI, coach-triggered) ─────────────────────────────────────────────
create table reports (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references academies (id) on delete cascade,
  player_id   uuid not null references players (id) on delete cascade,
  coach_id    uuid not null references profiles (id) on delete cascade,
  type        report_type not null,
  raw_notes   text,                 -- the 2–3 rough words the coach typed
  ai_draft    text,                 -- the AI-expanded draft
  final_text  text,                 -- edited, child-first-name-addressed message
  status      report_status not null default 'draft',
  block_id    uuid references one_to_one_blocks (id) on delete set null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index on reports (academy_id);
create index on reports (coach_id);

-- now that reports exists, link 1-on-1 sessions to their report
alter table one_to_one_sessions
  add constraint one_to_one_sessions_report_fk
  foreign key (report_id) references reports (id) on delete set null;

-- ── Matches (evidence record) ─────────────────────────────────────────────────
create table matches (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references academies (id) on delete cascade,
  group_id        uuid references groups (id) on delete set null,
  coach_id        uuid references profiles (id) on delete set null,
  match_date      date not null,
  opponent        text,
  team_score      text,
  result          text,
  player_of_match uuid references players (id) on delete set null,
  source          match_source not null default 'manual',
  season          text,
  created_at      timestamptz not null default now()
);
create index on matches (academy_id);

create table match_players (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references academies (id) on delete cascade,
  match_id         uuid not null references matches (id) on delete cascade,
  player_id        uuid not null references players (id) on delete cascade,
  batting_position int,
  runs             int default 0,
  balls            int default 0,
  how_out          text,
  wickets          int default 0,
  coach_why_note   text             -- "moved to 4 to face spin" — the accountability note
);
create index on match_players (academy_id);

-- ── Finance ───────────────────────────────────────────────────────────────────
create table payments (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references academies (id) on delete cascade,
  player_id      uuid references players (id) on delete set null,
  category       payment_category not null,
  ref_id         uuid,                       -- package / block / match id
  amount         numeric(10,2) not null default 0,
  mode           payment_mode not null default 'pending',
  status         payment_state not null default 'pending',
  screenshot_url text,
  center_id      uuid references training_centers (id) on delete set null,
  paid_at        date,
  confirmed_by   uuid references profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index on payments (academy_id);
create index on payments (category);

create table match_fees (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references academies (id) on delete cascade,
  match_id       uuid not null references matches (id) on delete cascade,
  player_id      uuid not null references players (id) on delete cascade,
  fee            numeric(10,2) not null default 0,
  state          payment_state not null default 'awaiting',
  mode           payment_mode,
  screenshot_url text,
  confirmed_by   uuid references profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index on match_fees (academy_id);

create table ground_fees (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references academies (id) on delete cascade,
  center_id    uuid references training_centers (id) on delete set null,
  booking_date date not null,
  amount       numeric(10,2) not null default 0,
  mode         payment_mode,
  status       payment_state not null default 'pending',
  created_at   timestamptz not null default now()
);
create index on ground_fees (academy_id);

-- ── Badges ─────────────────────────────────────────────────────────────────---
create table badge_types (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid references academies (id) on delete cascade,  -- null = global default
  key        text not null,
  name       text not null,
  category   badge_category not null,
  accent     text default '#C9A84C',
  emblem     text,
  criteria   text,
  send_flow  badge_send_flow not null default 'approval'
);
create index on badge_types (academy_id);

create table player_badges (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references academies (id) on delete cascade,
  player_id       uuid not null references players (id) on delete cascade,
  badge_type_id   uuid not null references badge_types (id) on delete cascade,
  earned_at       timestamptz not null default now(),
  approval_status badge_approval not null default 'pending',
  sent_at         timestamptz
);
create index on player_badges (academy_id);

-- ── Programs ──────────────────────────────────────────────────────────────────
create table programs (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references academies (id) on delete cascade,
  name        text not null,
  emoji       text,
  accent      text default '#9C1116',
  description text
);
create index on programs (academy_id);

create table program_enrollments (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  program_id uuid not null references programs (id) on delete cascade,
  player_id  uuid not null references players (id) on delete cascade,
  unique (program_id, player_id)
);
create index on program_enrollments (academy_id);

-- ── Outbound messages (WhatsApp abstraction) ─────────────────────────────────
-- Logs every parent message. Today channel = 'whatsapp_click'; swapping to the
-- official Business API later is a backend-only change.
create table outbound_messages (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references academies (id) on delete cascade,
  player_id    uuid references players (id) on delete set null,
  channel      text not null default 'whatsapp_click',
  template_key text,
  body         text,
  ref_type     text,
  ref_id       uuid,
  status       text default 'composed',
  created_at   timestamptz not null default now()
);
create index on outbound_messages (academy_id);

-- ▼▼▼ 0002_rls.sql ▼▼▼
-- ============================================================================
-- Loop by Zak Cricket — Row Level Security
-- Multi-tenancy is enforced here, in Postgres, not in the app. Every table is
-- locked to the signed-in user's academy. Finance tables additionally deny
-- read access to coach / head_coach roles.
-- ============================================================================

-- ── Helpers ───────────────────────────────────────────────────────────────────
-- These live in `public` (not `auth`): on Supabase the migration role cannot
-- CREATE in the `auth` schema, and Supabase recommends keeping custom helpers in
-- `public`. SECURITY DEFINER so they read profiles regardless of that table's
-- own RLS (avoids recursion).
create or replace function public.user_academy_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select academy_id from public.profiles where id = auth.uid()
$$;

create or replace function public.user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- True when the signed-in user can see finance (admin only).
create or replace function public.can_see_finance()
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
  for select using (id = public.user_academy_id());
create policy academy_update on academies
  for update using (id = public.user_academy_id() and public.user_role() = 'admin');

-- ── Profiles: read same-academy; users update their own row ───────────────────
create policy profiles_select on profiles
  for select using (academy_id = public.user_academy_id());
create policy profiles_update_self on profiles
  for update using (id = auth.uid());
create policy profiles_admin_write on profiles
  for all using (academy_id = public.user_academy_id() and public.user_role() = 'admin')
  with check (academy_id = public.user_academy_id() and public.user_role() = 'admin');

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
        using (academy_id = public.user_academy_id())
        with check (academy_id = public.user_academy_id());
    $f$, t);
  end loop;
end $$;

-- batch_groups has no academy_id of its own — gate via its parent batch.
create policy batch_groups_tenant_all on batch_groups
  for all
  using (exists (
    select 1 from batches b
    where b.id = batch_groups.batch_id and b.academy_id = public.user_academy_id()
  ))
  with check (exists (
    select 1 from batches b
    where b.id = batch_groups.batch_id and b.academy_id = public.user_academy_id()
  ));

-- badge_types also exposes global defaults (academy_id is null) read-only.
create policy badge_types_global_read on badge_types
  for select using (academy_id is null);

-- ── Finance tables: same academy AND admin-only ───────────────────────────────
-- payments / match_fees / ground_fees. Head Coach and Coach get NO access here.
-- (Coaches collect match fees through a dedicated, scoped path — see note below.)
create policy payments_admin_only on payments
  for all
  using (academy_id = public.user_academy_id() and public.can_see_finance())
  with check (academy_id = public.user_academy_id() and public.can_see_finance());

create policy ground_fees_admin_only on ground_fees
  for all
  using (academy_id = public.user_academy_id() and public.can_see_finance())
  with check (academy_id = public.user_academy_id() and public.can_see_finance());

-- match_fees: admin full access; a coach may read/update fees for matches they
-- coordinate (they collect/confirm on the ground), but never academy-wide totals.
create policy match_fees_admin_all on match_fees
  for all
  using (academy_id = public.user_academy_id() and public.can_see_finance())
  with check (academy_id = public.user_academy_id() and public.can_see_finance());

create policy match_fees_coach_own on match_fees
  for select
  using (
    academy_id = public.user_academy_id()
    and exists (
      select 1 from matches m
      where m.id = match_fees.match_id and m.coach_id = auth.uid()
    )
  );

create policy match_fees_coach_update on match_fees
  for update
  using (
    academy_id = public.user_academy_id()
    and exists (
      select 1 from matches m
      where m.id = match_fees.match_id and m.coach_id = auth.uid()
    )
  );

-- ▼▼▼ 0003_seed.sql ▼▼▼
-- ============================================================================
-- Loop by Zak Cricket — seed & provisioning helpers
-- Global badge defaults (academy_id null, readable by all) + a function that
-- bootstraps a new academy with the standard package catalogue.
-- ============================================================================

-- ── Global badge catalogue (26 badges across 4 groups) ────────────────────────
-- Moment / match badges auto-send on match log; season badges (performance /
-- progress / attendance) go to the manager-approval queue first.
insert into badge_types (academy_id, key, name, category, accent, emblem, criteria, send_flow) values
  -- Performance (8) — approval
  (null, 'half_century',   'Half Century',     'performance', '#9C1116', '🏏', 'Score 50+ in a match',                 'approval'),
  (null, 'century',        'Century',          'performance', '#C9A84C', '💯', 'Score 100+ in a match',                'approval'),
  (null, 'five_wicket',    'Five-For',         'performance', '#9C1116', '🎯', 'Take 5 wickets in an innings',         'approval'),
  (null, 'hat_trick',      'Hat-Trick Hero',   'performance', '#C9A84C', '🔥', 'Three wickets in three balls',         'approval'),
  (null, 'run_machine',    'Run Machine',      'performance', '#9C1116', '🚀', '200+ runs in a season',                'approval'),
  (null, 'wicket_taker',   'Wicket Taker',     'performance', '#9C1116', '🎳', '20+ wickets in a season',              'approval'),
  (null, 'big_hitter',     'Big Hitter',       'performance', '#C9A84C', '💥', '5+ sixes in a season',                 'approval'),
  (null, 'sharp_fielder',  'Safe Hands',       'performance', '#9C1116', '🧤', '5+ catches in a season',               'approval'),
  -- Attendance (5) — gap-based, fair to flexible attendance — approval
  (null, 'session_keeper', 'Session Keeper',   'attendance',  '#1F8A4C', '📅', 'No 10-day gap for 2 months',           'approval'),
  (null, 'all_season_pro', 'All-Season Pro',   'attendance',  '#1F8A4C', '🗓️', 'No gap >14 days across the season',    'approval'),
  (null, 'relentless',     'Relentless',       'attendance',  '#C9A84C', '⚡', '20+ sessions in a calendar month',     'approval'),
  (null, 'early_bird',     'Early Bird',       'attendance',  '#1F8A4C', '🌅', 'On time for 15 sessions running',      'approval'),
  (null, 'comeback',       'Comeback',         'attendance',  '#1F8A4C', '🔄', 'Return after a long break',            'approval'),
  -- Progress (4) — approval
  (null, 'rising_star',    'Rising Star',      'progress',    '#C9A84C', '⭐', 'First development report milestone',    'approval'),
  (null, 'most_improved',  'Most Improved',    'progress',    '#C9A84C', '📈', 'Biggest improvement in a block',       'approval'),
  (null, 'block_complete', 'Block Graduate',   'progress',    '#1F8A4C', '🎓', 'Complete a full coaching block',       'approval'),
  (null, 'goal_getter',    'Goal Getter',      'progress',    '#C9A84C', '🏁', 'Hit a coach-set development goal',      'approval'),
  -- Moment (10) — auto-send on match log
  (null, 'player_of_match','Player of the Match','moment',    '#C9A84C', '🏆', 'Named player of the match',            'auto'),
  (null, 'debut',          'Debut',            'moment',      '#9C1116', '🎬', 'First match for the academy',           'auto'),
  (null, 'first_wicket',   'First Wicket',     'moment',      '#9C1116', '🎯', 'Take your first match wicket',          'auto'),
  (null, 'first_fifty',    'Maiden Fifty',     'moment',      '#C9A84C', '5️⃣', 'Your first match half-century',         'auto'),
  (null, 'match_winner',   'Match Winner',     'moment',      '#9C1116', '🥇', 'Win the game for your team',            'auto'),
  (null, 'clutch',         'Clutch',           'moment',      '#C9A84C', '🎲', 'Decisive contribution under pressure',  'auto'),
  (null, 'duck_breaker',   'Duck Breaker',     'moment',      '#9C1116', '🦆', 'Bounce back after a duck',              'auto'),
  (null, 'captains_knock', 'Captain''s Knock', 'moment',      '#C9A84C', '🧢', 'Lead the side with the bat',            'auto'),
  (null, 'partnership',    'Partnership',      'moment',      '#1F8A4C', '🤝', '50+ run partnership',                   'auto'),
  (null, 'allrounder',     'All-Rounder',      'moment',      '#C9A84C', '🌟', 'Runs and wickets in one match',         'auto');

-- ── Provision a new academy with the standard package catalogue ───────────────
-- Call after creating an academy + its first admin profile.
create or replace function public.provision_academy_defaults(p_academy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into package_types (academy_id, name, sessions, price, kind) values
    (p_academy_id, '4 Sessions',    4,    200,  'standard'),
    (p_academy_id, '8 Sessions',    8,    380,  'standard'),
    (p_academy_id, '12 Sessions',   12,   550,  'standard'),
    (p_academy_id, '20 Sessions',   20,   850,  'standard'),
    (p_academy_id, 'Unlimited',     null, 1200, 'unlimited'),
    (p_academy_id, 'Complimentary', null, 0,    'complimentary');
end $$;
