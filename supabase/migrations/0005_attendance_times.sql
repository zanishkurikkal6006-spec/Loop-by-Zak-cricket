-- ============================================================================
-- Loop by Zak Cricket — batch-time-wise attendance
-- Attendance is marked per batch (time slot). A group can run several batches
-- (e.g. Elite has 2, Level Up / Launch Pad 1 each). attendance_sessions already
-- has batch_id; we add optional per-session start/end times so a one-off or
-- recurring weekend class can be marked at a customised time without changing
-- the batch's standing schedule.
-- ============================================================================

alter table attendance_sessions
  add column if not exists start_time time,
  add column if not exists end_time   time;
