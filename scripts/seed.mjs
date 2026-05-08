// scripts/seed.mjs
// Pure-Node port of seed.ts that uses native fetch + Supabase REST API.
// Avoids tsx/esbuild and the @supabase/supabase-js dependency.
//
// Run: node scripts/seed.mjs
// Re-run safely: uses upsert (Prefer: resolution=merge-duplicates).

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

function loadEnv(file) {
  try {
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {}
}
loadEnv(resolve(repoRoot, '.env.local'))
loadEnv(resolve(repoRoot, '.env'))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

async function rest(method, path, { body, prefer, params } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

const upsert = (table, rows, onConflict) =>
  rest('POST', table, {
    body: rows,
    params: onConflict ? { on_conflict: onConflict } : undefined,
    prefer: 'resolution=merge-duplicates,return=representation',
  })

// ─────────────────────────────────────────────
// SEED DATA — kept identical to seed.ts
// ─────────────────────────────────────────────
const developers = [
  { slug: 'emaar',     name: 'Emaar Properties',     rera_developer_id: 'RERA-DEV-001', founded_year: 1997, website_url: 'https://emaar.com',           on_time_delivery_pct: 82, avg_quality_rating: 4.4, rera_complaints_count: 14, rera_violations_count: 2, total_projects_count: 180, completed_projects: 160, active_projects: 20, avg_roi_pct: 22, developer_score: 88 },
  { slug: 'sobha',     name: 'Sobha Realty',         rera_developer_id: 'RERA-DEV-002', founded_year: 1976, website_url: 'https://sobharealty.com',     on_time_delivery_pct: 79, avg_quality_rating: 4.6, rera_complaints_count: 8,  rera_violations_count: 1, total_projects_count: 40,  completed_projects: 28,  active_projects: 12, avg_roi_pct: 19, developer_score: 85 },
  { slug: 'binghatti', name: 'Binghatti Properties', rera_developer_id: 'RERA-DEV-003', founded_year: 2008, website_url: 'https://binghatti.com',       on_time_delivery_pct: 88, avg_quality_rating: 4.0, rera_complaints_count: 6,  rera_violations_count: 0, total_projects_count: 35,  completed_projects: 28,  active_projects: 7,  avg_roi_pct: 24, developer_score: 87 },
  { slug: 'danube',    name: 'Danube Properties',    rera_developer_id: 'RERA-DEV-004', founded_year: 2014, website_url: 'https://danubeproperties.com',on_time_delivery_pct: 91, avg_quality_rating: 3.8, rera_complaints_count: 11, rera_violations_count: 1, total_projects_count: 22,  completed_projects: 18,  active_projects: 4,  avg_roi_pct: 18, developer_score: 80 },
  { slug: 'tiger',     name: 'Tiger Properties',     rera_developer_id: 'RERA-DEV-005', founded_year: 2005, website_url: 'https://tigerproperties.ae',  on_time_delivery_pct: 62, avg_quality_rating: 3.2, rera_complaints_count: 28, rera_violations_count: 5, total_projects_count: 18,  completed_projects: 12,  active_projects: 6,  avg_roi_pct: 14, developer_score: 52 },
]

const projects = [
  { slug: 'binghatti-skyrise',     name: 'Binghatti Skyrise',     developer_slug: 'binghatti', area: 'Business Bay',   status: 'active', handover_status: 'on_track', unit_types: ['1br','2br','3br'],            total_units: 612, total_floors: 52,  launch_date: '2023-10-01', original_handover_date: '2026-12-01', current_handover_date: '2026-12-01', handover_delay_days: 0,   launch_psf: 1940, current_psf: 2340, min_price: 1200000, max_price:  4500000, units_sold: 515, sellthrough_pct: 84, resale_premium_pct:  8, is_featured: true,  is_verified: true },
  { slug: 'sobha-seahaven-tower-a',name: 'Sobha Seahaven Tower A',developer_slug: 'sobha',     area: 'Dubai Harbour',  status: 'active', handover_status: 'at_risk',  unit_types: ['1br','2br','3br','penthouse'],total_units: 450, total_floors: 65,  launch_date: '2022-06-01', original_handover_date: '2026-09-01', current_handover_date: '2027-03-01', handover_delay_days: 182, launch_psf: 2800, current_psf: 3100, min_price: 2500000, max_price: 12000000, units_sold: 275, sellthrough_pct: 61, resale_premium_pct: 11, is_featured: true,  is_verified: true },
  { slug: 'emaar-creek-gate',      name: 'Emaar Creek Gate',      developer_slug: 'emaar',     area: 'Creek Harbour',  status: 'active', handover_status: 'on_track', unit_types: ['1br','2br','3br'],            total_units: 800, total_floors: 44,  launch_date: '2022-01-01', original_handover_date: '2026-09-01', current_handover_date: '2026-09-01', handover_delay_days: 0,   launch_psf: 2200, current_psf: 2720, min_price: 1600000, max_price:  5800000, units_sold: 728, sellthrough_pct: 91, resale_premium_pct: 15, is_featured: true,  is_verified: true },
  { slug: 'danube-bayz-101',       name: 'Danube Bayz 101',       developer_slug: 'danube',    area: 'Business Bay',   status: 'active', handover_status: 'on_track', unit_types: ['studio','1br','2br'],         total_units: 400, total_floors: 38,  launch_date: '2024-11-01', original_handover_date: '2028-03-01', current_handover_date: '2028-03-01', handover_delay_days: 0,   launch_psf: 1780, current_psf: 1850, min_price:  650000, max_price:  2200000, units_sold: 128, sellthrough_pct: 32, resale_premium_pct:  3, is_featured: false, is_verified: true },
  { slug: 'tiger-sky-tower',       name: 'Tiger Sky Tower',       developer_slug: 'tiger',     area: 'Business Bay',   status: 'active', handover_status: 'delayed',  unit_types: ['1br','2br','3br'],            total_units: 600, total_floors: 123, launch_date: '2023-03-01', original_handover_date: '2026-06-01', current_handover_date: '2027-03-01', handover_delay_days: 272, launch_psf: 2050, current_psf: 1980, min_price:  900000, max_price:  5000000, units_sold: 228, sellthrough_pct: 38, resale_premium_pct: -4, is_featured: false, is_verified: true },
]

const paymentPlans = [
  { project_slug: 'binghatti-skyrise', name: '60/40 Standard',        description: '60% during construction, 40% on handover',     down_payment_pct: 20, construction_pct: 40, handover_pct: 40, post_handover_pct:  0, post_handover_months:  0, monthly_pct: 0 },
  { project_slug: 'danube-bayz-101',   name: '1% Monthly',            description: '1% per month over construction period',        down_payment_pct: 10, construction_pct:  0, handover_pct: 20, post_handover_pct:  0, post_handover_months:  0, monthly_pct: 1 },
  { project_slug: 'danube-bayz-101',   name: 'Post-Handover 50/50',   description: '50% now, 50% over 2 years after keys',         down_payment_pct: 20, construction_pct: 30, handover_pct:  0, post_handover_pct: 50, post_handover_months: 24, monthly_pct: 0 },
]

async function seed() {
  console.log('Seeding OffplanIQ database...\n')

  console.log('Seeding developers...')
  await upsert('developers', developers, 'slug')
  console.log(`  ${developers.length} developers upserted`)

  const devRows = await rest('GET', 'developers', { params: { select: 'id,slug' } })
  const devIdBySlug = Object.fromEntries(devRows.map(d => [d.slug, d.id]))

  console.log('\nSeeding projects...')
  const projectRows = projects.map(({ developer_slug, ...p }) => ({
    ...p,
    developer_id: devIdBySlug[developer_slug],
  }))
  await upsert('projects', projectRows, 'slug')
  console.log(`  ${projects.length} projects upserted`)

  const projRows = await rest('GET', 'projects', { params: { select: 'id,slug' } })
  const projIdBySlug = Object.fromEntries(projRows.map(p => [p.slug, p.id]))

  console.log('\nSeeding payment plans...')
  const planRows = paymentPlans.map(({ project_slug, ...plan }) => ({
    ...plan,
    project_id: projIdBySlug[project_slug],
  }))
  await upsert('payment_plans', planRows)
  console.log(`  ${paymentPlans.length} payment plans upserted`)

  console.log('\nSeeding PSF history...')
  const today = new Date()
  const psfHistoryRows = []
  for (const project of projects) {
    const projId = projIdBySlug[project.slug]
    for (let m = 11; m >= 0; m--) {
      const date = new Date(today)
      date.setMonth(date.getMonth() - m)
      const progress = (11 - m) / 11
      const psf = Math.round(project.launch_psf + (project.current_psf - project.launch_psf) * progress)
      psfHistoryRows.push({
        project_id: projId,
        recorded_date: date.toISOString().split('T')[0],
        psf,
        source: 'manual',
        sample_size: 1,
      })
    }
  }
  await upsert('psf_history', psfHistoryRows, 'project_id,recorded_date,source')
  console.log(`  ${psfHistoryRows.length} PSF data points seeded`)

  console.log('\nSeed complete.')
}

seed().catch(e => { console.error(e); process.exit(1) })
