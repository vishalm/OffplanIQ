-- ─────────────────────────────────────────────
-- Phase 5.6 — Persistent chat threads
-- ─────────────────────────────────────────────
-- The AI-first surface routes every conversation through `/ask/[threadId]`,
-- so we need durable thread + message storage with the assistant's tool
-- invocations and source citations preserved.
--
-- One row per turn (user OR assistant). Tool runs are recorded as separate
-- 'tool' rows so the conversation can be reconstructed exactly.

create table chat_threads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references user_profiles(id) on delete cascade,
  title         text,                       -- auto-derived from first user message
  is_pinned     boolean default false,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

create index idx_chat_threads_user on chat_threads(user_id, updated_at desc);

create trigger trg_chat_threads_updated
  before update on chat_threads
  for each row execute function touch_updated_at();

create table chat_messages (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references chat_threads(id) on delete cascade,

  role            text not null check (role in ('user','assistant','tool','system')),
  content         text,                     -- nullable: assistant turns that ONLY do tool calls have no content
  tool_name       text,                     -- set on role='tool' rows
  tool_args       jsonb,                    -- set on role='tool' rows (args sent to executor)
  tool_result     jsonb,                    -- set on role='tool' rows (executor return)
  sources         jsonb,                    -- set on role='assistant' rows: [{title,url,doc_type,similarity}]
  iterations      integer,                  -- assistant rows: how many tool-call loops it took
  metadata        jsonb default '{}'::jsonb,

  created_at      timestamptz default now() not null
);

create index idx_chat_messages_thread on chat_messages(thread_id, created_at);

-- ─── Row-level security ──────────────────────────────────────
alter table chat_threads  enable row level security;
alter table chat_messages enable row level security;

-- Threads: each owner manages their own.
create policy "chat_threads_owner_read"   on chat_threads for select
  using (auth.uid() = user_id);
create policy "chat_threads_owner_write"  on chat_threads for insert
  with check (auth.uid() = user_id);
create policy "chat_threads_owner_update" on chat_threads for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "chat_threads_owner_delete" on chat_threads for delete
  using (auth.uid() = user_id);

-- Messages: same scope as their parent thread.
create policy "chat_messages_owner_read" on chat_messages for select
  using (thread_id in (select id from chat_threads where user_id = auth.uid()));
create policy "chat_messages_owner_write" on chat_messages for insert
  with check (thread_id in (select id from chat_threads where user_id = auth.uid()));
create policy "chat_messages_owner_delete" on chat_messages for delete
  using (thread_id in (select id from chat_threads where user_id = auth.uid()));
