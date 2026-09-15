-- ============================================================================
-- Loop by Zak Cricket — Phase 5: AI Operations foundation
-- Conversation memory + a full audit trail for AI. Every significant AI answer
-- stores the question, the deterministic tools it called, the filters used, and
-- the response — so management can verify what the AI did.
--
-- AI is management-scoped for now (director / operations_manager / admin) via
-- can_manage_ops(); the head-coach coaching assistant arrives in Phase 6.
-- The AI itself never bypasses RLS: its tools run under the caller's session,
-- so it can only ever read the caller's own academy.
-- ============================================================================

create type ai_role as enum ('user', 'assistant');

create table ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  user_id    uuid references profiles (id) on delete set null,
  title      text,
  created_at timestamptz not null default now()
);
create index on ai_conversations (academy_id);

create table ai_messages (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references academies (id) on delete cascade,
  conversation_id uuid not null references ai_conversations (id) on delete cascade,
  role            ai_role not null,
  content         text not null,
  meta            jsonb default '{}'::jsonb,   -- { evidence, actions, confidence, tools }
  created_at      timestamptz not null default now()
);
create index on ai_messages (conversation_id);

-- One row per analytical answer: what was asked, which tools ran, filters, reply.
create table ai_queries (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies (id) on delete cascade,
  user_id    uuid references profiles (id) on delete set null,
  question   text not null,
  tools      text[] not null default '{}',
  filters    jsonb default '{}'::jsonb,
  answer     text,
  confidence text,
  created_at timestamptz not null default now()
);
create index on ai_queries (academy_id);

-- ── RLS (management only) ─────────────────────────────────────────────────────
alter table ai_conversations enable row level security;
alter table ai_messages      enable row level security;
alter table ai_queries       enable row level security;

do $$
declare t text;
  ai_tables text[] := array['ai_conversations','ai_messages','ai_queries'];
begin
  foreach t in array ai_tables loop
    execute format($f$
      create policy %1$s_ai_all on %1$s
        for all
        using (academy_id = public.user_academy_id() and public.can_manage_ops())
        with check (academy_id = public.user_academy_id() and public.can_manage_ops());
    $f$, t);
  end loop;
end $$;
