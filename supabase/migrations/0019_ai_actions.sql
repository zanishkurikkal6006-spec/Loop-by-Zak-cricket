-- ============================================================================
-- Loop by Zak Cricket — Phase 8: AI Actions (propose → confirm → execute → audit)
-- The AI may PROPOSE operational actions, but never performs a data-changing
-- action on its own. A human reviews and confirms; only then does the system
-- write, and every execution is recorded in ai_actions + audit_logs.
--
-- Management-gated (can_manage_ops). Writes still go through normal RLS on the
-- target tables, so an approved action can only ever do what the user could do
-- by hand.
-- ============================================================================

create type ai_action_status as enum ('proposed', 'approved', 'executed', 'dismissed');

create table ai_actions (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references academies (id) on delete cascade,
  user_id     uuid references profiles (id) on delete set null,
  kind        text not null,                    -- create_followups_leads | flag_retention | renewals | post_trial
  title       text not null,
  description text,
  payload     jsonb not null default '{}'::jsonb, -- { items: [{ id, label }] }
  status      ai_action_status not null default 'proposed',
  result      jsonb default '{}'::jsonb,          -- { count }
  created_at  timestamptz not null default now(),
  executed_at timestamptz,
  executed_by uuid references profiles (id) on delete set null
);
create index on ai_actions (academy_id);

-- General audit trail — significant actions across the platform.
create table audit_logs (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  actor_id   uuid references profiles (id) on delete set null,
  action     text not null,        -- e.g. ai_execute
  entity     text,                 -- e.g. follow_up_tasks
  entity_id  uuid,
  detail     jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (academy_id);
create index on audit_logs (created_at);

alter table ai_actions enable row level security;
alter table audit_logs enable row level security;

do $$
declare t text;
  tbls text[] := array['ai_actions','audit_logs'];
begin
  foreach t in array tbls loop
    execute format($f$
      create policy %1$s_action_all on %1$s
        for all
        using (academy_id = public.user_academy_id() and public.can_manage_ops())
        with check (academy_id = public.user_academy_id() and public.can_manage_ops());
    $f$, t);
  end loop;
end $$;
