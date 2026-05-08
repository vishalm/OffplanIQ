-- Migration: 004_fix_market_summary_launches_filter
-- get_market_summary().launches_this_week was filtering on created_at::date,
-- which counts when a row was *ingested* (e.g. by the scraper) rather than
-- when the project was actually launched. Switch to launch_date so the
-- dashboard reflects real launch activity.

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
    'launches_this_week',  count(*) filter (where launch_date >= week_ago)
  )
  into result
  from projects;

  return result;
end;
$$ language plpgsql security definer;
