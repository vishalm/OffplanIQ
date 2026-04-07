-- supabase/seed/seed.sql
--
-- SQL seed file — alternative to the TypeScript seed script.
-- Use this if you prefer to seed via `supabase db seed` rather than `pnpm run seed`.
--
-- Usage:
--   supabase db seed   (reads supabase/seed/seed.sql automatically)
--
-- NOTE: The TypeScript seed script (scripts/seed.ts) is more complete
-- and also seeds psf_history with synthetic data. Prefer that for a
-- full local dev setup. Use this SQL seed only for CI/preview environments
-- that need a minimal dataset fast.

-- ─────────────────────────────────────────────
-- DEVELOPERS
-- ─────────────────────────────────────────────
insert into developers (slug, name, founded_year, on_time_delivery_pct, rera_complaints_count, rera_violations_count, total_projects_count, completed_projects, active_projects, avg_roi_pct, developer_score)
values
  ('emaar',     'Emaar Properties',    1997, 82, 14, 2, 180, 160, 20, 22, 88),
  ('sobha',     'Sobha Realty',        1976, 79,  8, 1,  40,  28, 12, 19, 85),
  ('binghatti', 'Binghatti Properties',2008, 88,  6, 0,  35,  28,  7, 24, 87),
  ('danube',    'Danube Properties',   2014, 91, 11, 1,  22,  18,  4, 18, 80),
  ('tiger',     'Tiger Properties',    2005, 62, 28, 5,  18,  12,  6, 14, 52)
on conflict (slug) do update set
  on_time_delivery_pct  = excluded.on_time_delivery_pct,
  developer_score       = excluded.developer_score,
  updated_at            = now();

-- ─────────────────────────────────────────────
-- PROJECTS (5 hand-curated seed projects)
-- ─────────────────────────────────────────────
insert into projects (
  developer_id, name, slug, area, status, handover_status,
  unit_types, total_units, total_floors,
  launch_date, original_handover_date, current_handover_date,
  handover_delay_days, launch_psf, current_psf,
  min_price, max_price, units_sold, sellthrough_pct,
  resale_premium_pct, is_featured, is_verified
)
select
  d.id,
  p.name, p.slug, p.area, p.status::project_status,
  p.handover_status::handover_status,
  p.unit_types::unit_type[], p.total_units, p.total_floors,
  p.launch_date::date, p.original_handover_date::date, p.current_handover_date::date,
  p.handover_delay_days, p.launch_psf, p.current_psf,
  p.min_price, p.max_price, p.units_sold, p.sellthrough_pct,
  p.resale_premium_pct, p.is_featured, p.is_verified
from (values
  ('binghatti','Binghatti Skyrise','binghatti-skyrise','Business Bay','active','on_track',
   '{1br,2br,3br}',612,52,'2023-10-01','2026-12-01','2026-12-01',0,1940,2340,1200000,4500000,515,84,8,true,true),
  ('sobha','Sobha Seahaven Tower A','sobha-seahaven-tower-a','Dubai Harbour','active','at_risk',
   '{1br,2br,3br,penthouse}',450,65,'2022-06-01','2026-09-01','2027-03-01',182,2800,3100,2500000,12000000,275,61,11,true,true),
  ('emaar','Emaar Creek Gate','emaar-creek-gate','Creek Harbour','active','on_track',
   '{1br,2br,3br}',800,44,'2022-01-01','2026-09-01','2026-09-01',0,2200,2720,1600000,5800000,728,91,15,true,true),
  ('danube','Danube Bayz 101','danube-bayz-101','Business Bay','active','on_track',
   '{studio,1br,2br}',400,38,'2024-11-01','2028-03-01','2028-03-01',0,1780,1850,650000,2200000,128,32,3,false,true),
  ('tiger','Tiger Sky Tower','tiger-sky-tower','Business Bay','active','delayed',
   '{1br,2br,3br}',600,123,'2023-03-01','2026-06-01','2027-03-01',272,2050,1980,900000,5000000,228,38,-4,false,true)
) as p(developer_slug, name, slug, area, status, handover_status,
       unit_types, total_units, total_floors,
       launch_date, original_handover_date, current_handover_date,
       handover_delay_days, launch_psf, current_psf,
       min_price, max_price, units_sold, sellthrough_pct,
       resale_premium_pct, is_featured, is_verified)
join developers d on d.slug = p.developer_slug
on conflict (slug) do update set
  current_psf      = excluded.current_psf,
  units_sold       = excluded.units_sold,
  sellthrough_pct  = excluded.sellthrough_pct,
  updated_at       = now();

-- ─────────────────────────────────────────────
-- PAYMENT PLANS
-- ─────────────────────────────────────────────
insert into payment_plans (project_id, name, description, down_payment_pct, construction_pct, handover_pct, post_handover_pct, post_handover_months, monthly_pct)
select p.id, pl.name, pl.description, pl.down_payment_pct, pl.construction_pct, pl.handover_pct, pl.post_handover_pct, pl.post_handover_months, pl.monthly_pct
from (values
  ('binghatti-skyrise','60/40 Standard','60% during construction, 40% on handover',20,40,40,0,0,0),
  ('binghatti-skyrise','Post-Handover 30/70','30% now, 70% over 3 years post-handover',10,20,0,70,36,0),
  ('danube-bayz-101','1% Monthly','1% per month over construction period',10,0,20,0,0,1),
  ('danube-bayz-101','Post-Handover 50/50','50% now, 50% over 2 years after keys',20,30,0,50,24,0),
  ('emaar-creek-gate','80/20 Emaar Standard','80% during construction, 20% on handover',20,60,20,0,0,0),
  ('sobha-seahaven-tower-a','60/40 Sobha','Standard Sobha payment plan',20,40,40,0,0,0)
) as pl(project_slug, name, description, down_payment_pct, construction_pct, handover_pct, post_handover_pct, post_handover_months, monthly_pct)
join projects p on p.slug = pl.project_slug
on conflict do nothing;
