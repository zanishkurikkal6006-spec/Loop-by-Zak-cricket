-- ============================================================================
-- Loop by Zak Cricket — seed & provisioning helpers
-- Global badge defaults (academy_id null, readable by all) + a function that
-- bootstraps a new academy with the standard package catalogue.
-- ============================================================================

-- ── Global badge catalogue (26 badges across 4 groups) ────────────────────────
-- Moment / match badges auto-send on match log; season badges (performance /
-- progress / attendance) go to the manager-approval queue first.
insert into badge_types (academy_id, key, name, category, accent, emblem, criteria, send_flow) values
  -- Performance (8) — approval
  (null, 'half_century',   'Half Century',     'performance', '#9C1116', '🏏', 'Score 50+ in a match',                 'approval'),
  (null, 'century',        'Century',          'performance', '#C9A84C', '💯', 'Score 100+ in a match',                'approval'),
  (null, 'five_wicket',    'Five-For',         'performance', '#9C1116', '🎯', 'Take 5 wickets in an innings',         'approval'),
  (null, 'hat_trick',      'Hat-Trick Hero',   'performance', '#C9A84C', '🔥', 'Three wickets in three balls',         'approval'),
  (null, 'run_machine',    'Run Machine',      'performance', '#9C1116', '🚀', '200+ runs in a season',                'approval'),
  (null, 'wicket_taker',   'Wicket Taker',     'performance', '#9C1116', '🎳', '20+ wickets in a season',              'approval'),
  (null, 'big_hitter',     'Big Hitter',       'performance', '#C9A84C', '💥', '5+ sixes in a season',                 'approval'),
  (null, 'sharp_fielder',  'Safe Hands',       'performance', '#9C1116', '🧤', '5+ catches in a season',               'approval'),
  -- Attendance (5) — gap-based, fair to flexible attendance — approval
  (null, 'session_keeper', 'Session Keeper',   'attendance',  '#1F8A4C', '📅', 'No 10-day gap for 2 months',           'approval'),
  (null, 'all_season_pro', 'All-Season Pro',   'attendance',  '#1F8A4C', '🗓️', 'No gap >14 days across the season',    'approval'),
  (null, 'relentless',     'Relentless',       'attendance',  '#C9A84C', '⚡', '20+ sessions in a calendar month',     'approval'),
  (null, 'early_bird',     'Early Bird',       'attendance',  '#1F8A4C', '🌅', 'On time for 15 sessions running',      'approval'),
  (null, 'comeback',       'Comeback',         'attendance',  '#1F8A4C', '🔄', 'Return after a long break',            'approval'),
  -- Progress (4) — approval
  (null, 'rising_star',    'Rising Star',      'progress',    '#C9A84C', '⭐', 'First development report milestone',    'approval'),
  (null, 'most_improved',  'Most Improved',    'progress',    '#C9A84C', '📈', 'Biggest improvement in a block',       'approval'),
  (null, 'block_complete', 'Block Graduate',   'progress',    '#1F8A4C', '🎓', 'Complete a full coaching block',       'approval'),
  (null, 'goal_getter',    'Goal Getter',      'progress',    '#C9A84C', '🏁', 'Hit a coach-set development goal',      'approval'),
  -- Moment (10) — auto-send on match log
  (null, 'player_of_match','Player of the Match','moment',    '#C9A84C', '🏆', 'Named player of the match',            'auto'),
  (null, 'debut',          'Debut',            'moment',      '#9C1116', '🎬', 'First match for the academy',           'auto'),
  (null, 'first_wicket',   'First Wicket',     'moment',      '#9C1116', '🎯', 'Take your first match wicket',          'auto'),
  (null, 'first_fifty',    'Maiden Fifty',     'moment',      '#C9A84C', '5️⃣', 'Your first match half-century',         'auto'),
  (null, 'match_winner',   'Match Winner',     'moment',      '#9C1116', '🥇', 'Win the game for your team',            'auto'),
  (null, 'clutch',         'Clutch',           'moment',      '#C9A84C', '🎲', 'Decisive contribution under pressure',  'auto'),
  (null, 'duck_breaker',   'Duck Breaker',     'moment',      '#9C1116', '🦆', 'Bounce back after a duck',              'auto'),
  (null, 'captains_knock', "Captain's Knock",  'moment',      '#C9A84C', '🧢', 'Lead the side with the bat',            'auto'),
  (null, 'partnership',    'Partnership',      'moment',      '#1F8A4C', '🤝', '50+ run partnership',                   'auto'),
  (null, 'allrounder',     'All-Rounder',      'moment',      '#C9A84C', '🌟', 'Runs and wickets in one match',         'auto');

-- ── Provision a new academy with the standard package catalogue ───────────────
-- Call after creating an academy + its first admin profile.
create or replace function public.provision_academy_defaults(p_academy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into package_types (academy_id, name, sessions, price, kind) values
    (p_academy_id, '4 Sessions',    4,    200,  'standard'),
    (p_academy_id, '8 Sessions',    8,    380,  'standard'),
    (p_academy_id, '12 Sessions',   12,   550,  'standard'),
    (p_academy_id, '20 Sessions',   20,   850,  'standard'),
    (p_academy_id, 'Unlimited',     null, 1200, 'unlimited'),
    (p_academy_id, 'Complimentary', null, 0,    'complimentary');
end $$;
