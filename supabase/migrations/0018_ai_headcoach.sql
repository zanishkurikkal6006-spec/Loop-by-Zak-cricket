-- ============================================================================
-- Loop by Zak Cricket — Phase 6: Head Coach AI access
-- Opens the AI tables to the head coach so they can use the coaching-scoped
-- assistant. The assistant's TOOLS still run under the caller's own session, so
-- a head coach only ever reads coaching data — finance and marketing tables
-- stay blocked by their existing RLS, and the planner refuses out-of-scope
-- questions before any tool runs.
--
-- These are ADDITIONAL permissive policies (OR-ed with the existing
-- management-only ones); they do not widen access to any other table.
-- ============================================================================

do $$
declare t text;
  ai_tables text[] := array['ai_conversations','ai_messages','ai_queries'];
begin
  foreach t in array ai_tables loop
    execute format($f$
      create policy %1$s_ai_headcoach on %1$s
        for all
        using (academy_id = public.user_academy_id() and public.user_role() = 'head_coach')
        with check (academy_id = public.user_academy_id() and public.user_role() = 'head_coach');
    $f$, t);
  end loop;
end $$;
