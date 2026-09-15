-- ============================================================================
-- Loop by Zak Cricket — Director & Operations Manager roles
-- Extends the platform beyond admin/head_coach/coach so Super Kings (and any
-- future tenant) can run a management layer:
--   • director            — full business visibility, strategy, forecasting
--   • operations_manager  — full operational control (CRM, trials, ops, comms)
--
-- NOTE: ALTER TYPE ... ADD VALUE must be committed before the new values can be
-- used, so the enum change lives in its own migration. The helper functions and
-- RLS policies that reference these values are in 0013_crm.sql (next file =
-- next transaction), which is why they are split.
-- ============================================================================

alter type user_role add value if not exists 'operations_manager';
alter type user_role add value if not exists 'director';
