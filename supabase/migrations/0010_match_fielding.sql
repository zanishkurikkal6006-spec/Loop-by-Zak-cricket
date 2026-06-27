-- ============================================================================
-- Loop by Zak Cricket — fielding stats on the scorecard
-- Capture catches and run-outs per player per match so the per-player record
-- (batting + bowling + fielding) is complete and shareable with parents.
-- ============================================================================

alter table match_players
  add column if not exists catches  int not null default 0,
  add column if not exists run_outs int not null default 0;
