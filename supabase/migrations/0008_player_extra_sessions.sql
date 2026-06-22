-- ============================================================================
-- Loop by Zak Cricket — extra (no-package) sessions counter
-- Players who attend without an active package accrue "extra sessions". The
-- count is shown while marking attendance and is netted off the next package
-- they buy (e.g. 12 extra taken, then a 12-session package ⇒ 0 remaining).
-- ============================================================================

alter table players
  add column if not exists extra_sessions int not null default 0;
