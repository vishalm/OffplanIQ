-- ─────────────────────────────────────────────
-- Real-time Intelligence (Phase 3)
-- ─────────────────────────────────────────────
-- Records every detected change to a project — price moves, handover slips,
-- new launches — so the dashboard can render a "What's changed" feed and the
-- launch-radar edge function can dispatch alerts on new projects.
--
-- Source-of-truth ownership:
--   * Each row is written by the developer-intelligence scraper when a project
--     upsert detects a meaningful field change.
--   * `change_type='launch'` rows are written exactly once per project lifecycle
--     (the first time the scraper inserts the project).
--
-- Read access is public; writes require service role.

create table project_updates (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  source_doc_id   uuid references documents(id) on delete set null,

  change_type     text not null check (change_type in (
                    'launch',           -- first time we saw the project
                    'price_change',
                    'handover_change',
                    'units_change',
                    'description_change',
                    'amenities_change',
                    'plan_change'
                  )),

  field           text,                 -- column name on projects (when applicable)
  before_value    jsonb,                -- jsonb keeps types (int / string / array)
  after_value     jsonb,
  delta_pct       numeric(6,2),         -- for numeric fields (price/PSF moves)

  detected_at     timestamptz default now() not null,
  notified_at     timestamptz           -- set when launch-radar dispatches an alert
);

create index idx_project_updates_project on project_updates(project_id);
create index idx_project_updates_type    on project_updates(change_type);
create index idx_project_updates_recent  on project_updates(detected_at desc);
create index idx_project_updates_unnotified
  on project_updates(detected_at desc)
  where notified_at is null;

-- ─── Row-level security ──────────────────────────────────────
alter table project_updates enable row level security;

create policy "project_updates_public_read" on project_updates for select using (true);

-- ─── Helper RPC: recent updates ──────────────────────────────
-- Used by the dashboard "What's changed" widget. Returns the N latest updates
-- with the project + developer denormalised so the UI doesn't N+1.
create or replace function recent_project_updates(
  limit_count integer default 20
)
returns table (
  id              uuid,
  project_id      uuid,
  project_name    text,
  project_slug    text,
  developer_name  text,
  change_type     text,
  field           text,
  before_value    jsonb,
  after_value     jsonb,
  delta_pct       numeric,
  detected_at     timestamptz
)
language sql stable
as $$
  select
    u.id,
    u.project_id,
    p.name             as project_name,
    p.slug             as project_slug,
    d.name             as developer_name,
    u.change_type,
    u.field,
    u.before_value,
    u.after_value,
    u.delta_pct,
    u.detected_at
  from project_updates u
  join projects p   on p.id = u.project_id
  left join developers d on d.id = p.developer_id
  order by u.detected_at desc
  limit limit_count
$$;
