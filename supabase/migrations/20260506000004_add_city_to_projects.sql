-- Migration: 006_add_city_to_projects
-- Add a canonical emirate/city column on projects so filters can be data-driven
-- (no hardcoded area→emirate lookup tables in the web app). Scraper writes the
-- city directly from the source's listing metadata. Existing rows: nullable;
-- backfill happens in code where applicable.

alter table projects add column if not exists city text;

create index if not exists projects_city_idx on projects (city);
