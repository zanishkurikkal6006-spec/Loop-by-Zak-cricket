-- ============================================================================
-- Loop by Zak Cricket — Phase 2: Retention & Parent Experience
-- Player Health, At-Risk context, Issues & Feedback, and Churn. The health
-- score is a TRANSPARENT weighted signal that flags players needing human
-- attention — it never decides on its own that a player will leave. Snapshots
-- are stored so the trend can be charted over time.
--
-- Multi-tenant: every table carries academy_id. Experience tables are visible
-- to the management layer AND the head coach (who needs at-risk context).
-- ============================================================================

-- Management + head coach (experience / retention context).
create or replace function public.can_see_experience()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('director','operations_manager','admin','head_coach'), false)
$$;

-- ── Enums ─────────────────────────────────────────────────────────────────────
create type risk_level as enum ('green', 'amber', 'red');
create type issue_category as enum (
  'coaching','schedule','payment','communication','facility',
  'match_selection','tournament','safety','other'
);
create type issue_status as enum ('open', 'in_progress', 'resolved');
create type churn_reason as enum (
  'price','location','timing','coach','school_pressure','no_improvement',
  'insufficient_match_exposure','child_lost_interest','moved_country',
  'joined_competitor','facility','parent_experience','other'
);

-- ── Issues & feedback (parent experience) ─────────────────────────────────────
create table issues (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references academies (id) on delete cascade,
  player_id    uuid references players (id) on delete set null,
  parent_id    uuid references parents (id) on delete set null,
  category     issue_category not null default 'other',
  title        text not null,
  body         text,
  priority     task_priority not null default 'medium',
  status       issue_status not null default 'open',
  owner_id     uuid references profiles (id) on delete set null,
  resolution   text,
  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index on issues (academy_id);
create index on issues (status);
create index on issues (player_id);

-- ── Player health snapshots (trend over time) ─────────────────────────────────
create table player_health_snapshots (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references academies (id) on delete cascade,
  player_id   uuid not null references players (id) on delete cascade,
  score       int not null,
  risk        risk_level not null,
  factors     jsonb not null default '[]'::jsonb,  -- [{ label, penalty }]
  snapshot_date date not null default current_date,
  created_at  timestamptz not null default now(),
  unique (player_id, snapshot_date)
);
create index on player_health_snapshots (academy_id);
create index on player_health_snapshots (player_id);

-- ── Churn records (every exit has a reason) ───────────────────────────────────
create table churn_records (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references academies (id) on delete cascade,
  player_id     uuid not null references players (id) on delete cascade,
  exit_date     date not null default current_date,
  reason        churn_reason not null default 'other',
  reason_detail text,
  lead_source   lead_source,        -- copied from player for cohort analysis
  join_cohort   text,               -- YYYY-MM the player joined
  recorded_by   uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on churn_records (academy_id);
create index on churn_records (reason);

-- ── Extend players: renewal proximity + exit stamp ────────────────────────────
alter table players
  add column if not exists renewal_date date,
  add column if not exists exited_at    date;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table issues                  enable row level security;
alter table player_health_snapshots enable row level security;
alter table churn_records           enable row level security;

do $$
declare t text;
  exp_tables text[] := array['issues','player_health_snapshots','churn_records'];
begin
  foreach t in array exp_tables loop
    execute format($f$
      create policy %1$s_exp_all on %1$s
        for all
        using (academy_id = public.user_academy_id() and public.can_see_experience())
        with check (academy_id = public.user_academy_id() and public.can_see_experience());
    $f$, t);
  end loop;
end $$;
