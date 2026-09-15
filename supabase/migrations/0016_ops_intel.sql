-- ============================================================================
-- Loop by Zak Cricket — Phase 4: Operations Intelligence
-- The data prerequisites for the intelligence screens (Revenue, Capacity,
-- Venues, Coach Utilization). Revenue / capacity / coach dashboards are derived
-- from existing tables; this migration only adds what those views need:
--   • batches.capacity  — a batch's safe player capacity (for utilization)
--   • venues            — venue economics (rental, hours, contract)
--
-- The deterministic analytics RPC layer the AI will call is intentionally built
-- in Phase 5, next to its consumer, rather than shipped unused here.
--
-- Multi-tenant + management-gated, same pattern as earlier phases.
-- ============================================================================

-- Safe capacity per batch (time slot) — powers utilization bands.
alter table batches
  add column if not exists capacity int;

-- ── Venues (economics) ────────────────────────────────────────────────────────
create table venues (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references academies (id) on delete cascade,
  name           text not null,
  center_id      uuid references training_centers (id) on delete set null,
  rental_cost    numeric(10,2) not null default 0,  -- per month
  available_hours numeric(6,1) not null default 0,  -- bookable hours per month
  contract_start date,
  contract_end   date,
  notes          text,
  created_at     timestamptz not null default now()
);
create index on venues (academy_id);

alter table venues enable row level security;
create policy venues_mgmt_all on venues
  for all
  using (academy_id = public.user_academy_id() and public.can_manage_ops())
  with check (academy_id = public.user_academy_id() and public.can_manage_ops());
