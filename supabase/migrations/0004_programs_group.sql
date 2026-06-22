-- ============================================================================
-- Loop by Zak Cricket — link programs to a group/category for auto-enrolment
-- A program can optionally be tied to a group (Elite / Level Up / Launch Pad).
-- When a player is added to that group, the app auto-enrols them into every
-- program linked to it. Programs with no group stay manual-only ("special"
-- programs you enrol into by hand).
-- ============================================================================

alter table programs
  add column if not exists group_id uuid references groups (id) on delete set null;

create index if not exists programs_group_id_idx on programs (group_id);
