-- ─────────────────────────────────────────────
-- Developer enrichment columns (sourced from the curated UAE master DB)
-- ─────────────────────────────────────────────
-- Adds free-form metadata fields that come from the user's external Excel
-- master DB (tier, ownership, contact info, social, key persons). The
-- existing columns (name, slug, official_url, founded_year, hq_location,
-- developer_score, total_projects_count) keep their meanings; this migration
-- only adds new optional surface area.
--
-- All new columns are nullable — keeps the seeder idempotent and lets us
-- patch in stages without breaking existing rows.

alter table developers
  add column if not exists tier            text,
  add column if not exists tier_rank       integer,         -- 1=master, 2=fast-grow, 3=boutique, 4=long-tail
  add column if not exists ownership_type  text,
  add column if not exists key_person      text,
  add column if not exists hq_address      text,
  add column if not exists phone_direct    text,
  add column if not exists phone_hotline   text,
  add column if not exists email           text,
  add column if not exists segments        text,
  add column if not exists employees       text,            -- "15,000+" — kept as text since formats vary
  add column if not exists est_revenue     text,
  add column if not exists geographic_presence text,
  add column if not exists stock_listing   text,
  add column if not exists social_media    text,
  add column if not exists key_projects    text;            -- comma-separated free text

create index if not exists idx_developers_tier_rank on developers(tier_rank);
create index if not exists idx_developers_hq_emirate on developers(hq_location);
