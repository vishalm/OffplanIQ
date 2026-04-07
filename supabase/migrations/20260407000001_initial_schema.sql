-- OffplanIQ Database Schema
-- Migration: 001_initial_schema
-- Run: supabase db push
-- 
-- CONVENTIONS:
--   - All monetary values in AED stored as INTEGER (fils, i.e. AED * 100)
--   - PSF values stored as INTEGER (AED per sqft, no decimals)
--   - Timestamps always UTC, displayed in Asia/Dubai (UTC+4) in the app
--   - UUID primary keys throughout
--   - soft deletes via deleted_at where needed

-- ─────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────
-- gen_random_uuid() is built into PG 13+, no extension needed on Supabase Cloud
create extension if not exists "pg_cron";

-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────
create type project_status as enum (
  'pre_launch',    -- announced but not RERA registered
  'active',        -- selling, RERA registered
  'sold_out',      -- 100% units sold
  'completed',     -- handed over
  'delayed',       -- flagged delay vs original handover
  'cancelled'      -- RERA cancellation
);

create type handover_status as enum (
  'on_track',
  'at_risk',       -- within 90 days of original date, <80% construction
  'delayed',
  'completed'
);

create type unit_type as enum ('studio', '1br', '2br', '3br', '4br', 'penthouse', 'villa', 'townhouse');

create type alert_type as enum (
  'score_drop',
  'score_rise',
  'new_launch',
  'handover_delay',
  'psf_spike',
  'psf_drop',
  'sellthrough_stall',
  'developer_flag'
);

create type subscription_tier as enum ('free', 'investor', 'agency');

-- ─────────────────────────────────────────────
-- DEVELOPERS
-- ─────────────────────────────────────────────
create table developers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,
  rera_developer_id     text,                    -- RERA registration number
  founded_year          integer,
  hq_location           text default 'Dubai',
  website_url           text,
  logo_url              text,

  -- Scorecard fields (updated by scraper + manual review)
  on_time_delivery_pct  integer,                 -- 0-100, % of projects delivered on time
  avg_quality_rating    numeric(3,1),            -- 1.0 - 5.0
  rera_complaints_count integer default 0,
  rera_violations_count integer default 0,
  total_projects_count  integer default 0,
  completed_projects    integer default 0,
  active_projects       integer default 0,
  avg_roi_pct           integer,                 -- historical avg ROI across completed projects
  developer_score       integer,                 -- 0-100, computed by score-recalculator

  notes                 text,                    -- internal notes for manual overrides
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ─────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────
create table projects (
  id                    uuid primary key default gen_random_uuid(),
  developer_id          uuid references developers(id) not null,

  -- Identity
  name                  text not null,
  slug                  text not null unique,
  rera_project_id       text unique,             -- RERA registration number
  property_finder_id    text,                    -- for scraper dedup
  bayut_id              text,                    -- for scraper dedup

  -- Location
  area                  text not null,           -- 'Business Bay', 'JVC', etc.
  subarea               text,
  latitude              numeric(10,7),
  longitude             numeric(10,7),
  google_maps_url       text,

  -- Project details
  status                project_status default 'active',
  handover_status       handover_status default 'on_track',
  unit_types            unit_type[],
  total_units           integer not null,
  total_floors          integer,
  launch_date           date,
  original_handover_date date,
  current_handover_date  date,                   -- updated if delayed
  handover_delay_days   integer default 0,

  -- Pricing (all in AED, PSF as integer)
  launch_psf            integer,                 -- AED per sqft at launch
  current_psf           integer,                 -- latest observed PSF
  min_price             integer,                 -- AED, smallest available unit
  max_price             integer,                 -- AED, largest available unit

  -- Sales velocity
  units_sold            integer default 0,
  sellthrough_pct       integer default 0,       -- 0-100
  resale_premium_pct    integer default 0,       -- % above launch price on resale market

  -- Score (0-100, computed)
  score                 integer default 0,
  score_breakdown       jsonb,                   -- {sellthrough: 40, psf_delta: 30, developer: 20, handover: 10}
  score_updated_at      timestamptz,

  -- Metadata
  description           text,
  amenities             text[],
  images                text[],                  -- array of CDN URLs
  brochure_url          text,
  is_featured           boolean default false,
  is_verified           boolean default false,   -- manually verified by team

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index idx_projects_area on projects(area);
create index idx_projects_status on projects(status);
create index idx_projects_score on projects(score desc);
create index idx_projects_developer on projects(developer_id);

-- ─────────────────────────────────────────────
-- PSF HISTORY
-- The core time-series table. Appended daily by scraper.
-- ─────────────────────────────────────────────
create table psf_history (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) not null,
  recorded_date date not null,
  psf           integer not null,               -- AED per sqft
  source        text not null,                  -- 'dld', 'property_finder', 'bayut', 'manual'
  sample_size   integer default 1,              -- number of transactions that day
  created_at    timestamptz default now(),

  unique(project_id, recorded_date, source)
);

create index idx_psf_project_date on psf_history(project_id, recorded_date desc);

-- ─────────────────────────────────────────────
-- PAYMENT PLANS
-- Multiple plans per project (developer can offer 60/40, 1%, post-handover, etc.)
-- ─────────────────────────────────────────────
create table payment_plans (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid references projects(id) not null,
  name                  text not null,           -- '60/40 Standard', '1% Monthly', 'Post-Handover'
  description           text,

  -- Simplified plan structure for IRR calc
  down_payment_pct      integer not null,        -- % due immediately
  construction_pct      integer default 0,       -- % paid during construction
  handover_pct          integer default 0,       -- % due at handover
  post_handover_pct     integer default 0,       -- % paid after handover
  post_handover_months  integer default 0,       -- months to pay post-handover balance
  monthly_pct           integer default 0,       -- for 1%-per-month style plans

  is_active             boolean default true,
  created_at            timestamptz default now()
);

-- ─────────────────────────────────────────────
-- DLD TRANSACTIONS
-- Raw transaction records from Dubai Land Department
-- ─────────────────────────────────────────────
create table dld_transactions (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid references projects(id),   -- nullable, matched by scraper
  dld_transaction_id    text unique not null,
  transaction_date      date not null,
  transaction_type      text,                    -- 'sale', 'mortgage', 'gift'
  property_type         text,
  area_name             text,
  building_name         text,
  unit_number           text,
  floor_number          integer,
  actual_area_sqft      numeric(10,2),
  transaction_value     integer not null,        -- AED total
  psf                   integer,                 -- computed: value / area
  is_off_plan           boolean default true,
  source_url            text,
  scraped_at            timestamptz default now()
);

create index idx_dld_project on dld_transactions(project_id);
create index idx_dld_date on dld_transactions(transaction_date desc);
create index idx_dld_area on dld_transactions(area_name);

-- ─────────────────────────────────────────────
-- USERS & SUBSCRIPTIONS
-- ─────────────────────────────────────────────
-- Note: auth.users is managed by Supabase Auth
-- This table extends it with app-specific fields

create table user_profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null,
  full_name             text,
  company               text,
  phone                 text,
  subscription_tier     subscription_tier default 'free',
  stripe_customer_id    text unique,
  stripe_subscription_id text,
  subscription_ends_at  timestamptz,
  seats_limit           integer default 1,       -- agency plan = 5
  agency_id             uuid,                    -- for multi-seat agency accounts
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ─────────────────────────────────────────────
-- WATCHLISTS
-- Users can watch specific projects for alerts
-- ─────────────────────────────────────────────
create table watchlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references user_profiles(id) on delete cascade not null,
  project_id  uuid references projects(id) on delete cascade not null,
  created_at  timestamptz default now(),
  unique(user_id, project_id)
);

-- ─────────────────────────────────────────────
-- ALERT PREFERENCES
-- ─────────────────────────────────────────────
create table alert_preferences (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references user_profiles(id) on delete cascade not null unique,
  score_drop_threshold    integer default 5,     -- alert if score drops >= N points
  score_rise_threshold    integer default 5,
  psf_change_threshold    integer default 5,     -- alert if PSF moves >= N%
  notify_new_launches     boolean default true,
  notify_handover_delays  boolean default true,
  notify_sellthrough_stall boolean default true, -- if <5% change over 60 days
  email_alerts            boolean default true,
  weekly_digest           boolean default true,
  created_at              timestamptz default now()
);

-- ─────────────────────────────────────────────
-- ALERTS LOG
-- Every fired alert is logged here (for dedup + history)
-- ─────────────────────────────────────────────
create table alerts_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references user_profiles(id) on delete cascade not null,
  project_id      uuid references projects(id),
  alert_type      alert_type not null,
  title           text not null,
  body            text,
  metadata        jsonb,                         -- old_score, new_score, old_psf, new_psf, etc.
  is_read         boolean default false,
  sent_at         timestamptz default now()
);

create index idx_alerts_user on alerts_log(user_id, sent_at desc);

-- ─────────────────────────────────────────────
-- SCORE SNAPSHOTS
-- Daily snapshot of each project's score (for trend charts)
-- ─────────────────────────────────────────────
create table score_snapshots (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) not null,
  score_date  date not null,
  score       integer not null,
  breakdown   jsonb,
  unique(project_id, score_date)
);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
alter table user_profiles     enable row level security;
alter table watchlist          enable row level security;
alter table alert_preferences  enable row level security;
alter table alerts_log         enable row level security;

-- Projects, developers, psf_history, dld_transactions are PUBLIC (read-only for all)
-- but INSERT/UPDATE/DELETE only via service_role key (scraper, edge functions)
alter table projects           enable row level security;
alter table developers         enable row level security;
alter table psf_history        enable row level security;
alter table dld_transactions   enable row level security;
alter table payment_plans      enable row level security;
alter table score_snapshots    enable row level security;

-- Public read policies
create policy "projects_public_read"      on projects       for select using (true);
create policy "developers_public_read"    on developers     for select using (true);
create policy "psf_public_read"           on psf_history    for select using (true);
create policy "plans_public_read"         on payment_plans  for select using (true);
create policy "snapshots_public_read"     on score_snapshots for select using (true);

-- User-scoped policies
create policy "own_profile"    on user_profiles    for all using (auth.uid() = id);
create policy "own_watchlist"  on watchlist         for all using (auth.uid() = user_id);
create policy "own_prefs"      on alert_preferences for all using (auth.uid() = user_id);
create policy "own_alerts"     on alerts_log        for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- FUNCTIONS & TRIGGERS
-- ─────────────────────────────────────────────
-- Auto-update updated_at
create or replace function touch_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_projects_updated   before update on projects   for each row execute function touch_updated_at();
create trigger trg_developers_updated before update on developers for each row execute function touch_updated_at();
create trigger trg_profiles_updated   before update on user_profiles for each row execute function touch_updated_at();

-- Auto-create alert_preferences row when user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_profiles (id, email) values (new.id, new.email);
  insert into alert_preferences (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
