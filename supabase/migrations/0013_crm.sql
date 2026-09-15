-- ============================================================================
-- Loop by Zak Cricket — Growth Engine (Phase 1): Lead CRM, Trials, Follow-ups
-- The front half of the player lifecycle — everything before enrolment. A lead
-- is CONVERTED into the existing players table (never duplicated); its
-- acquisition history stays attached to the player permanently.
--
-- Multi-tenant: every table carries academy_id and the standard tenant RLS.
-- Management-only tables additionally gate on the new can_manage_ops() helper.
-- ============================================================================

-- ── Role helpers (now that 0012 committed the new enum values) ────────────────
-- Management = director / operations_manager / admin.
create or replace function public.can_manage_ops()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('director','operations_manager','admin'), false)
$$;

-- Finance now visible to the management layer as well as admin.
create or replace function public.can_see_finance()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('director','operations_manager','admin'), false)
$$;

-- ── Enums ─────────────────────────────────────────────────────────────────────
create type lead_stage as enum (
  'new','contacted','qualified','trial_booked','trial_attended',
  'offer_sent','enrolled','nurture','lost'
);
create type lead_source as enum (
  'meta','google','instagram_organic','website','whatsapp','school','referral',
  'event','community','walk_in','super_kings_database','partner','other'
);
create type lead_activity_type as enum (
  'note','call','whatsapp','email','stage_change','trial','follow_up','system'
);
create type trial_status as enum ('scheduled','attended','no_show','converted','cancelled');
create type task_priority as enum ('critical','high','medium','low');
create type task_status   as enum ('open','done','snoozed','cancelled');
create type task_kind     as enum (
  'new_lead','unanswered_enquiry','trial_reminder','trial_no_show','post_trial',
  'offer_follow_up','nurture','renewal_follow_up','referral_follow_up',
  'school_follow_up','other'
);

-- ── Parents / families ────────────────────────────────────────────────────────
-- A single family record leads, trials and players can all point at. Anchors the
-- future referral engine and parent-experience timeline.
create table parents (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  full_name  text,
  phone      text,
  email      text,
  area       text,
  notes      text,
  created_at timestamptz not null default now()
);
create index on parents (academy_id);

-- ── Leads ─────────────────────────────────────────────────────────────────────
create table leads (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid not null references academies (id) on delete cascade,
  lead_date           date not null default current_date,
  parent_id           uuid references parents (id) on delete set null,
  parent_name         text,
  player_name         text not null,
  dob                 date,
  age                 int,
  phone               text,
  email               text,
  area                text,
  school              text,               -- school_id FK added in Phase 3
  cricket_experience  text,
  playing_level       text,
  preferred_center_id uuid references training_centers (id) on delete set null,
  preferred_days      text,
  preferred_timing    text,
  source              lead_source not null default 'other',
  campaign            text,               -- campaign_id FK added in Phase 3
  assigned_to         uuid references profiles (id) on delete set null,
  stage               lead_stage not null default 'new',
  last_interaction_at timestamptz,
  next_follow_up      date,
  trial_date          date,
  lost_reason         text,
  notes               text,
  converted_player_id uuid references players (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index on leads (academy_id);
create index on leads (stage);
create index on leads (next_follow_up);
create index on leads (assigned_to);

-- Complete activity history for every lead.
create table lead_activities (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  lead_id    uuid not null references leads (id) on delete cascade,
  type       lead_activity_type not null default 'note',
  body       text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on lead_activities (academy_id);
create index on lead_activities (lead_id);

-- ── Trials ────────────────────────────────────────────────────────────────────
create table trials (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references academies (id) on delete cascade,
  lead_id     uuid references leads (id) on delete set null,
  player_name text not null,
  trial_date  date not null,
  time_slot   text,
  center_id   uuid references training_centers (id) on delete set null,
  group_id    uuid references groups (id) on delete set null,
  coach_id    uuid references profiles (id) on delete set null,
  status      trial_status not null default 'scheduled',
  created_at  timestamptz not null default now()
);
create index on trials (academy_id);
create index on trials (trial_date);
create index on trials (status);

-- Coach's structured trial assessment (feeds the recommendation + conversion).
create table trial_assessments (
  id                   uuid primary key default gen_random_uuid(),
  academy_id           uuid not null references academies (id) on delete cascade,
  trial_id             uuid not null references trials (id) on delete cascade,
  coach_id             uuid references profiles (id) on delete set null,
  ratings              jsonb not null default '{}'::jsonb, -- { batting:1-5, bowling:1-5, ... }
  strength             text,
  development_priority text,
  recommended_program  text,
  recommended_level    text,
  comments             text,
  created_at           timestamptz not null default now()
);
create index on trial_assessments (academy_id);
create index on trial_assessments (trial_id);

-- ── Follow-up tasks (the sales / action queue) ────────────────────────────────
create table follow_up_tasks (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references academies (id) on delete cascade,
  kind         task_kind not null default 'other',
  title        text not null,
  lead_id      uuid references leads (id) on delete cascade,
  trial_id     uuid references trials (id) on delete cascade,
  player_id    uuid references players (id) on delete set null,
  owner_id     uuid references profiles (id) on delete set null,
  due_date     date,
  priority     task_priority not null default 'medium',
  status       task_status not null default 'open',
  outcome      text,
  notes        text,
  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index on follow_up_tasks (academy_id);
create index on follow_up_tasks (status);
create index on follow_up_tasks (due_date);
create index on follow_up_tasks (owner_id);

-- ── Extend players with acquisition history (attached permanently) ─────────────
alter table players
  add column if not exists lead_id         uuid references leads (id) on delete set null,
  add column if not exists parent_id       uuid references parents (id) on delete set null,
  add column if not exists lead_source     lead_source,
  add column if not exists source_campaign text,
  add column if not exists school          text,
  add column if not exists area            text;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table parents           enable row level security;
alter table leads             enable row level security;
alter table lead_activities   enable row level security;
alter table trials            enable row level security;
alter table trial_assessments enable row level security;
alter table follow_up_tasks   enable row level security;

-- Management-only (contains contact info / commercial funnel data).
do $$
declare t text;
  mgmt_tables text[] := array['parents','leads','lead_activities','follow_up_tasks'];
begin
  foreach t in array mgmt_tables loop
    execute format($f$
      create policy %1$s_mgmt_all on %1$s
        for all
        using (academy_id = public.user_academy_id() and public.can_manage_ops())
        with check (academy_id = public.user_academy_id() and public.can_manage_ops());
    $f$, t);
  end loop;
end $$;

-- Trials + trial assessments: any academy user (coaches run trials on the ground).
create policy trials_tenant_all on trials
  for all
  using (academy_id = public.user_academy_id())
  with check (academy_id = public.user_academy_id());

create policy trial_assessments_tenant_all on trial_assessments
  for all
  using (academy_id = public.user_academy_id())
  with check (academy_id = public.user_academy_id());
