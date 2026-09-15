-- ============================================================================
-- Loop by Zak Cricket — Phase 3: Acquisition
-- The channels that fill the top of the funnel: school partnerships, events,
-- the referral engine, and paid-campaign analytics. All feed the Lead CRM and,
-- through it, enrolments — so channel quality can be measured by retained
-- players, not just cheap leads.
--
-- Multi-tenant + management-gated (can_manage_ops), same pattern as Phase 1.
-- ============================================================================

-- ── Enums ─────────────────────────────────────────────────────────────────────
create type school_stage as enum (
  'target','contacted','meeting','proposal','activation_agreed','active_partner','closed_lost'
);
create type event_type as enum (
  'junior_cricket_day','open_day','camp','tournament','school_activation',
  'community','awards','talent_day','other'
);
create type referral_status as enum ('created','lead','trial','enrolled','rewarded','expired');
create type reward_status as enum ('none','pending','approved','paid');

-- ── Schools (partnership pipeline) ────────────────────────────────────────────
create table schools (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references academies (id) on delete cascade,
  name              text not null,
  area              text,
  curriculum        text,               -- British / IB / American / CBSE / …
  contact_name      text,
  contact_role      text,
  phone             text,
  email             text,
  stage             school_stage not null default 'target',
  potential_students int,
  first_contact     date,
  last_contact      date,
  next_action       text,
  next_action_date  date,
  activation_date   date,
  -- outcome counters (updated as the partnership produces results)
  students_reached  int not null default 0,
  leads             int not null default 0,
  trials            int not null default 0,
  enrolments        int not null default 0,
  revenue           numeric(10,2) not null default 0,
  notes             text,
  created_at        timestamptz not null default now()
);
create index on schools (academy_id);
create index on schools (stage);

create table school_activities (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  school_id  uuid not null references schools (id) on delete cascade,
  body       text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on school_activities (academy_id);
create index on school_activities (school_id);

-- ── Events ────────────────────────────────────────────────────────────────────
create table events (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references academies (id) on delete cascade,
  name          text not null,
  type          event_type not null default 'other',
  event_date    date,
  center_id     uuid references training_centers (id) on delete set null,
  budget        numeric(10,2) not null default 0,
  registrations int not null default 0,
  attendance    int not null default 0,
  leads         int not null default 0,
  trials        int not null default 0,
  enrolments    int not null default 0,
  revenue       numeric(10,2) not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);
create index on events (academy_id);

-- ── Campaigns (paid marketing) ────────────────────────────────────────────────
create table campaigns (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references academies (id) on delete cascade,
  platform         text,               -- Meta / Google / TikTok / …
  name             text not null,
  period           text,               -- YYYY-MM or free label
  spend            numeric(10,2) not null default 0,
  leads            int not null default 0,
  qualified_leads  int not null default 0,
  trials           int not null default 0,
  trial_attendance int not null default 0,
  enrolments       int not null default 0,
  revenue          numeric(10,2) not null default 0,
  notes            text,
  created_at       timestamptz not null default now()
);
create index on campaigns (academy_id);

-- ── Referral engine ───────────────────────────────────────────────────────────
create table referrals (
  id                 uuid primary key default gen_random_uuid(),
  academy_id         uuid not null references academies (id) on delete cascade,
  code               text not null,
  referrer_player_id uuid references players (id) on delete set null,
  referrer_name      text,
  invited_name       text,
  invited_phone      text,
  invited_lead_id    uuid references leads (id) on delete set null,
  status             referral_status not null default 'created',
  reward             text,
  reward_status      reward_status not null default 'none',
  reward_value       numeric(10,2) not null default 0,
  created_at         timestamptz not null default now(),
  unique (academy_id, code)
);
create index on referrals (academy_id);
create index on referrals (referrer_player_id);

-- ── RLS (management only) ─────────────────────────────────────────────────────
alter table schools          enable row level security;
alter table school_activities enable row level security;
alter table events           enable row level security;
alter table campaigns        enable row level security;
alter table referrals        enable row level security;

do $$
declare t text;
  mkt_tables text[] := array['schools','school_activities','events','campaigns','referrals'];
begin
  foreach t in array mkt_tables loop
    execute format($f$
      create policy %1$s_mkt_all on %1$s
        for all
        using (academy_id = public.user_academy_id() and public.can_manage_ops())
        with check (academy_id = public.user_academy_id() and public.can_manage_ops());
    $f$, t);
  end loop;
end $$;
