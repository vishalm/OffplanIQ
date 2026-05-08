-- Migration: 005_fix_market_summary_avg_sellthrough
-- avg_sellthrough_pct was averaging across all rows including those with
-- sellthrough_pct=0 (incomplete scraper rows where the detail page didn't
-- yield demand numbers). That dragged the displayed average toward zero.
-- Match the same "ignore missing data" pattern already used by avg_psf.

create or replace function get_market_summary()
returns json as $$
declare
  result json;
  week_ago date := current_date - 7;
begin
  select json_build_object(
    'total_projects',      count(*) filter (where status in ('active','pre_launch')),
    'avg_psf',             round(avg(current_psf)      filter (where current_psf > 0)),
    'avg_sellthrough_pct', round(avg(sellthrough_pct)  filter (where sellthrough_pct > 0)),
    'launches_this_week',  count(*)                    filter (where launch_date >= week_ago)
  )
  into result
  from projects;

  return result;
end;
$$ language plpgsql security definer;
