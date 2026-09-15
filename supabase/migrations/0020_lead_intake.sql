-- ============================================================================
-- Loop by Zak Cricket — Lead intake automation
-- 1. Every new lead (however it arrives — Meta/Zapier webhook, website form,
--    manual, or CSV) automatically gets a high-priority "Call parent" follow-up
--    task, so nothing is ever missed and no one has to add it by hand.
-- 2. Each academy gets a secret intake_token so an external source can POST
--    leads to the intake edge function without a logged-in user.
-- ============================================================================

-- ── Per-academy intake secret ─────────────────────────────────────────────────
alter table academies
  add column if not exists intake_token uuid not null default gen_random_uuid();
-- Existing rows created before the default keep their token; new ones auto-get one.

-- ── Auto "Call parent" task on every new lead ─────────────────────────────────
-- SECURITY DEFINER so it works for any insert path (webhook via service role,
-- or a logged-in user), and always tenant-correct (academy_id from the lead).
create or replace function public.autotask_on_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.follow_up_tasks (academy_id, kind, title, lead_id, owner_id, due_date, priority, status)
  values (
    new.academy_id,
    'new_lead',
    'Call ' || coalesce(new.parent_name, new.player_name, 'new lead'),
    new.id,
    new.assigned_to,          -- owner = whoever the lead is assigned to (may be null)
    current_date,
    'high',
    'open'
  );
  return new;
end;
$$;

drop trigger if exists trg_autotask_on_lead on leads;
create trigger trg_autotask_on_lead
  after insert on leads
  for each row execute function public.autotask_on_lead();
