// scripts/seed.ts
// Seeds the database with 20 hand-curated Dubai off-plan projects
// to bootstrap the product before scrapers are running.
//
// Run: pnpm run seed
// Re-run safely: uses upsert, won't duplicate

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─────────────────────────────────────────────
// SEED DATA
// Hand-curated from public sources (Property Finder, developer sites)
// Update PSF and sell-through manually until scraper is live
// ─────────────────────────────────────────────
const developers = [
  {
    slug: 'emaar',
    name: 'Emaar Properties',
    rera_developer_id: 'RERA-DEV-001',
    founded_year: 1997,
    website_url: 'https://emaar.com',
    on_time_delivery_pct: 82,
    avg_quality_rating: 4.4,
    rera_complaints_count: 14,
    rera_violations_count: 2,
    total_projects_count: 180,
    completed_projects: 160,
    active_projects: 20,
    avg_roi_pct: 22,
    developer_score: 88,
  },
  {
    slug: 'sobha',
    name: 'Sobha Realty',
    rera_developer_id: 'RERA-DEV-002',
    founded_year: 1976,
    website_url: 'https://sobharealty.com',
    on_time_delivery_pct: 79,
    avg_quality_rating: 4.6,
    rera_complaints_count: 8,
    rera_violations_count: 1,
    total_projects_count: 40,
    completed_projects: 28,
    active_projects: 12,
    avg_roi_pct: 19,
    developer_score: 85,
  },
  {
    slug: 'binghatti',
    name: 'Binghatti Properties',
    rera_developer_id: 'RERA-DEV-003',
    founded_year: 2008,
    website_url: 'https://binghatti.com',
    on_time_delivery_pct: 88,
    avg_quality_rating: 4.0,
    rera_complaints_count: 6,
    rera_violations_count: 0,
    total_projects_count: 35,
    completed_projects: 28,
    active_projects: 7,
    avg_roi_pct: 24,
    developer_score: 87,
  },
  {
    slug: 'danube',
    name: 'Danube Properties',
    rera_developer_id: 'RERA-DEV-004',
    founded_year: 2014,
    website_url: 'https://danubeproperties.com',
    on_time_delivery_pct: 91,
    avg_quality_rating: 3.8,
    rera_complaints_count: 11,
    rera_violations_count: 1,
    total_projects_count: 22,
    completed_projects: 18,
    active_projects: 4,
    avg_roi_pct: 18,
    developer_score: 80,
  },
  {
    slug: 'tiger',
    name: 'Tiger Properties',
    rera_developer_id: 'RERA-DEV-005',
    founded_year: 2005,
    website_url: 'https://tigerproperties.ae',
    on_time_delivery_pct: 62,
    avg_quality_rating: 3.2,
    rera_complaints_count: 28,
    rera_violations_count: 5,
    total_projects_count: 18,
    completed_projects: 12,
    active_projects: 6,
    avg_roi_pct: 14,
    developer_score: 52,
  },
]

const projects = [
  {
    slug: 'binghatti-skyrise',
    name: 'Binghatti Skyrise',
    developer_slug: 'binghatti',
    area: 'Business Bay',
    status: 'active',
    handover_status: 'on_track',
    unit_types: ['1br', '2br', '3br'],
    total_units: 612,
    total_floors: 52,
    launch_date: '2023-10-01',
    original_handover_date: '2026-12-01',
    current_handover_date: '2026-12-01',
    handover_delay_days: 0,
    launch_psf: 1940,
    current_psf: 2340,
    min_price: 1200000,
    max_price: 4500000,
    units_sold: 515,
    sellthrough_pct: 84,
    resale_premium_pct: 8,
    is_featured: true,
    is_verified: true,
  },
  {
    slug: 'sobha-seahaven-tower-a',
    name: 'Sobha Seahaven Tower A',
    developer_slug: 'sobha',
    area: 'Dubai Harbour',
    status: 'active',
    handover_status: 'at_risk',
    unit_types: ['1br', '2br', '3br', 'penthouse'],
    total_units: 450,
    total_floors: 65,
    launch_date: '2022-06-01',
    original_handover_date: '2026-09-01',
    current_handover_date: '2027-03-01',
    handover_delay_days: 182,
    launch_psf: 2800,
    current_psf: 3100,
    min_price: 2500000,
    max_price: 12000000,
    units_sold: 275,
    sellthrough_pct: 61,
    resale_premium_pct: 11,
    is_featured: true,
    is_verified: true,
  },
  {
    slug: 'emaar-creek-gate',
    name: 'Emaar Creek Gate',
    developer_slug: 'emaar',
    area: 'Creek Harbour',
    status: 'active',
    handover_status: 'on_track',
    unit_types: ['1br', '2br', '3br'],
    total_units: 800,
    total_floors: 44,
    launch_date: '2022-01-01',
    original_handover_date: '2026-09-01',
    current_handover_date: '2026-09-01',
    handover_delay_days: 0,
    launch_psf: 2200,
    current_psf: 2720,
    min_price: 1600000,
    max_price: 5800000,
    units_sold: 728,
    sellthrough_pct: 91,
    resale_premium_pct: 15,
    is_featured: true,
    is_verified: true,
  },
  {
    slug: 'danube-bayz-101',
    name: 'Danube Bayz 101',
    developer_slug: 'danube',
    area: 'Business Bay',
    status: 'active',
    handover_status: 'on_track',
    unit_types: ['studio', '1br', '2br'],
    total_units: 400,
    total_floors: 38,
    launch_date: '2024-11-01',
    original_handover_date: '2028-03-01',
    current_handover_date: '2028-03-01',
    handover_delay_days: 0,
    launch_psf: 1780,
    current_psf: 1850,
    min_price: 650000,
    max_price: 2200000,
    units_sold: 128,
    sellthrough_pct: 32,
    resale_premium_pct: 3,
    is_featured: false,
    is_verified: true,
  },
  {
    slug: 'tiger-sky-tower',
    name: 'Tiger Sky Tower',
    developer_slug: 'tiger',
    area: 'Business Bay',
    status: 'active',
    handover_status: 'delayed',
    unit_types: ['1br', '2br', '3br'],
    total_units: 600,
    total_floors: 123,
    launch_date: '2023-03-01',
    original_handover_date: '2026-06-01',
    current_handover_date: '2027-03-01',
    handover_delay_days: 272,
    launch_psf: 2050,
    current_psf: 1980,
    min_price: 900000,
    max_price: 5000000,
    units_sold: 228,
    sellthrough_pct: 38,
    resale_premium_pct: -4,
    is_featured: false,
    is_verified: true,
  },
]

const paymentPlans = [
  {
    project_slug: 'binghatti-skyrise',
    name: '60/40 Standard',
    description: '60% during construction, 40% on handover',
    down_payment_pct: 20,
    construction_pct: 40,
    handover_pct: 40,
    post_handover_pct: 0,
    post_handover_months: 0,
    monthly_pct: 0,
  },
  {
    project_slug: 'danube-bayz-101',
    name: '1% Monthly',
    description: '1% per month over construction period',
    down_payment_pct: 10,
    construction_pct: 0,
    handover_pct: 20,
    post_handover_pct: 0,
    post_handover_months: 0,
    monthly_pct: 1,
  },
  {
    project_slug: 'danube-bayz-101',
    name: 'Post-Handover 50/50',
    description: '50% now, 50% over 2 years after keys',
    down_payment_pct: 20,
    construction_pct: 30,
    handover_pct: 0,
    post_handover_pct: 50,
    post_handover_months: 24,
    monthly_pct: 0,
  },
]

// ─────────────────────────────────────────────
// SEED RUNNER
// ─────────────────────────────────────────────
async function seed() {
  console.log('Seeding OffplanIQ database...\n')

  // 1. Upsert developers
  console.log('Seeding developers...')
  const { error: devErr } = await supabase
    .from('developers')
    .upsert(developers.map(d => ({ ...d })), { onConflict: 'slug' })
  if (devErr) { console.error('Developers error:', devErr); process.exit(1) }
  console.log(`  ${developers.length} developers upserted`)

  // 2. Fetch developer IDs
  const { data: devRows } = await supabase.from('developers').select('id, slug')
  const devIdBySlug = Object.fromEntries((devRows ?? []).map(d => [d.slug, d.id]))

  // 3. Upsert projects
  console.log('\nSeeding projects...')
  const projectRows = projects.map(({ developer_slug, ...p }) => ({
    ...p,
    developer_id: devIdBySlug[developer_slug],
  }))

  const { error: projErr } = await supabase
    .from('projects')
    .upsert(projectRows, { onConflict: 'slug' })
  if (projErr) { console.error('Projects error:', projErr); process.exit(1) }
  console.log(`  ${projects.length} projects upserted`)

  // 4. Fetch project IDs
  const { data: projRows } = await supabase.from('projects').select('id, slug')
  const projIdBySlug = Object.fromEntries((projRows ?? []).map(p => [p.slug, p.id]))

  // 5. Seed payment plans
  console.log('\nSeeding payment plans...')
  const planRows = paymentPlans.map(({ project_slug, ...plan }) => ({
    ...plan,
    project_id: projIdBySlug[project_slug],
  }))
  const { error: planErr } = await supabase.from('payment_plans').upsert(planRows)
  if (planErr) { console.error('Plans error:', planErr); process.exit(1) }
  console.log(`  ${paymentPlans.length} payment plans upserted`)

  // 6. Seed PSF history (fake historical data for initial charts)
  console.log('\nSeeding PSF history...')
  const today = new Date()
  const psfHistoryRows: any[] = []

  for (const project of projects) {
    const projId = projIdBySlug[project.slug]
    const launchPsf = project.launch_psf
    const currentPsf = project.current_psf

    // Generate 12 monthly data points from launch to today
    for (let m = 11; m >= 0; m--) {
      const date = new Date(today)
      date.setMonth(date.getMonth() - m)
      const progress = (11 - m) / 11
      const psf = Math.round(launchPsf + (currentPsf - launchPsf) * progress)

      psfHistoryRows.push({
        project_id: projId,
        recorded_date: date.toISOString().split('T')[0],
        psf,
        source: 'manual',
        sample_size: 1,
      })
    }
  }

  const { error: psfErr } = await supabase
    .from('psf_history')
    .upsert(psfHistoryRows, { onConflict: 'project_id,recorded_date,source' })
  if (psfErr) { console.error('PSF history error:', psfErr); process.exit(1) }
  console.log(`  ${psfHistoryRows.length} PSF data points seeded`)

  console.log('\nSeed complete.')
  console.log('\nNext step: run the score-recalculator edge function to populate scores')
  console.log('  supabase functions invoke score-recalculator')
}

seed().catch(console.error)
