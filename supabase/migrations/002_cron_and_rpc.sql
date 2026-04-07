-- Migration: 002_cron_and_rpc
-- Sets up pg_cron schedules and helper RPC functions
-- Run after 001_initial_schema.sql

-- ─────────────────────────────────────────────
-- MARKET SUMMARY RPC
-- Called by Dashboard page server component
-- Returns single-row market summary for the metric cards
-- ─────────────────────────────────────────────
create or replace function get_market_summary()
returns json as $$
declare
  result json;
  week_ago date := current_date - 7;
begin
  select json_build_object(
    'total_projects',      count(*) filter (where status in ('active','pre_launch')),
    'avg_psf',             round(avg(current_psf) filter (where current_psf > 0)),
    'avg_sellthrough_pct', round(avg(sellthrough_pct)),
    'launches_this_week',  count(*) filter (where created_at::date >= week_ago)
  )
  into result
  from projects;

  return result;
end;
$$ language plpgsql security definer;

-- ─────────────────────────────────────────────
-- CRON SCHEDULES
-- Requires pg_cron extension (enabled by default on Supabase)
-- Replace [project-ref] and [service-role-key] with actual values
-- Run manually in Supabase SQL editor after deployment
-- ─────────────────────────────────────────────

-- NOTE: These are template statements.
-- After deploying Edge Functions, replace placeholders and run in SQL editor.

-- Hourly: alert dispatcher
-- select cron.schedule(
--   'alert-dispatcher-hourly',
--   '0 * * * *',
--   $$select net.http_post(
--     url:='https://[project-ref].supabase.co/functions/v1/alert-dispatcher',
--     headers:='{"Authorization":"Bearer [service-role-key]","Content-Type":"application/json"}'::jsonb,
--     body:='{}'::jsonb
--   )$$
-- );

-- Sunday 5am UTC (9am UAE): digest sender
-- select cron.schedule(
--   'digest-sender-weekly',
--   '0 5 * * 0',
--   $$select net.http_post(
--     url:='https://[project-ref].supabase.co/functions/v1/digest-sender',
--     headers:='{"Authorization":"Bearer [service-role-key]","Content-Type":"application/json"}'::jsonb,
--     body:='{}'::jsonb
--   )$$
-- );

-- ─────────────────────────────────────────────
-- HELPFUL VIEWS
-- ─────────────────────────────────────────────

-- Top projects view (used by free-tier feed)
create or replace view top_projects_public as
  select
    p.id, p.name, p.slug, p.area, p.status, p.handover_status,
    p.total_units, p.units_sold, p.sellthrough_pct,
    p.launch_psf, p.current_psf, p.score, p.score_breakdown,
    p.current_handover_date, p.handover_delay_days,
    p.is_featured, p.is_verified,
    d.name  as developer_name,
    d.slug  as developer_slug,
    d.developer_score
  from projects p
  left join developers d on d.id = p.developer_id
  where p.status in ('active', 'pre_launch')
  order by p.score desc;

-- PSF momentum view (6-month delta for each project)
create or replace view project_psf_momentum as
  with
    latest as (
      select project_id, psf as current_psf, recorded_date
      from psf_history
      where recorded_date = (
        select max(recorded_date) from psf_history ph2 where ph2.project_id = psf_history.project_id
      )
    ),
    six_months_ago as (
      select project_id, psf as old_psf, recorded_date
      from psf_history
      where recorded_date <= current_date - 180
      and recorded_date = (
        select max(recorded_date)
        from psf_history ph3
        where ph3.project_id = psf_history.project_id
        and ph3.recorded_date <= current_date - 180
      )
    )
  select
    l.project_id,
    l.current_psf,
    s.old_psf,
    case when s.old_psf > 0
      then round(((l.current_psf - s.old_psf)::numeric / s.old_psf) * 100)
      else null
    end as delta_pct_6m
  from latest l
  left join six_months_ago s on s.project_id = l.project_id;
