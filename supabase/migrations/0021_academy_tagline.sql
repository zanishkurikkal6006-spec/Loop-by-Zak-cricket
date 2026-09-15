-- ============================================================================
-- Loop by Zak Cricket — per-academy tagline
-- A short brand line (e.g. "We don't just build players. We build character.")
-- shown on parent-facing reports and messages. Per-tenant, editable in
-- Admin → Settings → Branding.
-- ============================================================================

alter table academies
  add column if not exists tagline text;
