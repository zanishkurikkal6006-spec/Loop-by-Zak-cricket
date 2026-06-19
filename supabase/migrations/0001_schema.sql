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
