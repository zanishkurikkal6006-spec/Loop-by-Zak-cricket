-- ============================================================================
-- Loop by Zak Cricket — partial ground payments + coach access
-- Coaches sometimes pay a ground partially on the day, so track how much has
-- been paid (paid_amount) against the booking total (amount). Also let coaches
-- (not just admin) view and record ground payments, since they pay on the
-- ground — payments/match-fee totals stay admin-only.
-- ============================================================================

alter table ground_fees
  add column if not exists paid_amount numeric not null default 0;

-- Backfill: anything already confirmed is fully paid.
update ground_fees set paid_amount = amount where status = 'confirmed' and paid_amount = 0;

-- Allow any staff member in the academy to read/record ground payments.
-- (OR-ed with the existing admin-only policy.)
drop policy if exists ground_fees_staff_all on ground_fees;
create policy ground_fees_staff_all on ground_fees
  for all
  using (academy_id = public.user_academy_id())
  with check (academy_id = public.user_academy_id());
