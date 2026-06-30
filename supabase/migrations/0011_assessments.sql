-- ============================================================================
-- Loop by Zak Cricket — 3-month skill assessments
-- A structured coach assessment (skill ratings 1–5 + comments + narrative
-- sections + optional video link), saved per player so progress can be tracked
-- across blocks and re-sent to parents as a branded report.
-- ============================================================================

create table if not exists assessments (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references academies (id) on delete cascade,
  player_id       uuid not null references players (id) on delete cascade,
  coach_id        uuid references profiles (id) on delete set null,
  assessment_date date not null default current_date,
  ratings         jsonb not null default '{}'::jsonb,  -- { skillKey: { rating, comment } }
  strengths       text,
  areas           text,
  coach_comments  text,
  goals           text,
  video_url       text,
  created_at      timestamptz not null default now()
);
create index if not exists assessments_academy_id_idx on assessments (academy_id);
create index if not exists assessments_player_id_idx on assessments (player_id);

alter table assessments enable row level security;
drop policy if exists assessments_tenant_all on assessments;
create policy assessments_tenant_all on assessments
  for all
  using (academy_id = public.user_academy_id())
  with check (academy_id = public.user_academy_id());
