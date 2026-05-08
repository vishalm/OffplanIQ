-- ─────────────────────────────────────────────
-- Phase 4.3 — Saved searches + daily-diff alerts
-- ─────────────────────────────────────────────
-- A saved search captures a structured filter set (same shape the chat agent
-- and /search page consume). The `saved-search-diffs` edge fn re-runs each
-- search daily and emits a 'saved_search_diff' alert when the matching set
-- gains or loses projects vs the prior run.
--
-- Source-of-truth ownership:
--   * `last_run_match_ids` is overwritten by the diff fn each cycle.
--   * `last_run_at` / `last_run_match_count` are diagnostic.
--
-- Each user owns their own searches (RLS).

create table saved_searches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references user_profiles(id) on delete cascade,
  name            text not null,                          -- user-supplied label
  filters         jsonb not null,                         -- same shape as search_projects tool args
  notify_on_diff  boolean default true,

  last_run_at         timestamptz,
  last_run_match_count integer,
  last_run_match_ids  uuid[] default '{}',                -- previous run's project ids

  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

create index idx_saved_searches_user on saved_searches(user_id);
create index idx_saved_searches_last_run on saved_searches(last_run_at nulls first);

create trigger trg_saved_searches_updated
  before update on saved_searches
  for each row execute function touch_updated_at();

-- ─── Row-level security ──────────────────────────────────────
alter table saved_searches enable row level security;

create policy "saved_searches_owner_read"   on saved_searches for select
  using (auth.uid() = user_id);
create policy "saved_searches_owner_write"  on saved_searches for insert
  with check (auth.uid() = user_id);
create policy "saved_searches_owner_update" on saved_searches for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saved_searches_owner_delete" on saved_searches for delete
  using (auth.uid() = user_id);

-- ─── Add 'saved_search_diff' to alert_type enum ──────────────
-- alter type ... add value isn't transactional in older Postgres; using IF NOT
-- EXISTS keeps this idempotent across re-runs.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'alert_type' and e.enumlabel = 'saved_search_diff'
  ) then
    alter type alert_type add value 'saved_search_diff';
  end if;
end $$;
