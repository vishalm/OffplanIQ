-- Migration: 007_add_narrative_and_news
-- Adds LLM-generated narrative + sentiment to projects, plus a news_mentions
-- table that the news fetcher will populate.
--
-- The narrative is driven by:
--   1. structured project data (sellthrough, PSF momentum, score breakdown)
--   2. comparable projects in the same area
--   3. recent news mentions (when present)
--
-- All fields are nullable so the schema is forward-compatible — pages render
-- a quiet empty state when no narrative exists yet.

alter table projects add column if not exists narrative text;
alter table projects add column if not exists narrative_updated_at timestamptz;
alter table projects add column if not exists narrative_model text;          -- e.g. "gpt-4o-mini"
alter table projects add column if not exists sentiment_score numeric;        -- -1.0 (very negative) to +1.0 (very positive)
alter table projects add column if not exists sentiment_label text;           -- 'positive' | 'neutral' | 'negative'

create table if not exists news_mentions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade,
  developer_id    uuid references developers(id) on delete cascade,
  source          text not null,                -- e.g. "Khaleej Times"
  headline        text not null,
  url             text,
  published_at    timestamptz,
  snippet         text,
  sentiment       numeric,                      -- -1 to +1
  sentiment_label text,                         -- 'positive' | 'neutral' | 'negative'
  fetched_at      timestamptz default now(),
  unique (project_id, url)
);

create index if not exists news_mentions_project_idx     on news_mentions (project_id, published_at desc);
create index if not exists news_mentions_developer_idx   on news_mentions (developer_id, published_at desc);
create index if not exists news_mentions_published_idx   on news_mentions (published_at desc);

-- RLS: news_mentions is publicly readable (it's just published news).
alter table news_mentions enable row level security;
do $$ begin
  create policy news_mentions_read on news_mentions for select using (true);
exception when duplicate_object then null;
end $$;
