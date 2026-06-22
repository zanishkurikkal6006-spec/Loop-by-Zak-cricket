-- ============================================================================
-- Loop by Zak Cricket — match venue (ground)
-- A match can record the venue/ground it was played at. When a coach logs a
-- match with a venue + ground fee, a ground_fees booking is created against that
-- centre so the ground-booking payment can be tracked alongside match fees.
-- ============================================================================

alter table matches
  add column if not exists center_id uuid references training_centers (id) on delete set null;

create index if not exists matches_center_id_idx on matches (center_id);
