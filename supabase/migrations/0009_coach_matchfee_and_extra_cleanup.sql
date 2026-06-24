-- ============================================================================
-- Loop by Zak Cricket — coach match-fee insert + legacy extra-session cleanup
-- 1. Coaches coordinate matches and collect fees on the ground, so they need to
--    INSERT match fees for their own matches (they already had select/update,
--    but no insert — which blocked "Add match" from the coach side).
-- 2. Older "extra sessions" were stored as a package line (12/12 used). Fold
--    those into the players.extra_sessions counter and remove the lines so a
--    kid shows "took N extra" instead of a fake fully-used package.
-- ============================================================================

-- 1 · Coach can add match fees for matches they coordinate.
drop policy if exists match_fees_coach_insert on match_fees;
create policy match_fees_coach_insert on match_fees
  for insert
  with check (
    academy_id = public.user_academy_id()
    and exists (
      select 1 from matches m
      where m.id = match_fees.match_id and m.coach_id = auth.uid()
    )
  );

-- 2 · Migrate legacy extra-session package lines into the counter.
update players p
set extra_sessions = p.extra_sessions + sub.total
from (
  select player_id, sum(sessions_total)::int as total
  from packages
  where package_type_id is null
    and sessions_total is not null
    and sessions_used = sessions_total
  group by player_id
) sub
where p.id = sub.player_id;

delete from packages
where package_type_id is null
  and sessions_total is not null
  and sessions_used = sessions_total;
