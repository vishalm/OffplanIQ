#!/usr/bin/env node
// scripts/ingest-from-apify.mjs
//
// Pulls scraped property listings from an Apify dataset and upserts them into
// `projects` (and `developers` when missing). Apify hosts community-built
// actors for Property Finder, Bayut, Dubizzle that output stable JSON — far
// less brittle than maintaining our own DOM scrapers, and licensed by Apify
// for commercial use.
//
// Why Apify (vs custom scraper):
//   * Pre-built actors stay current with site DOM changes
//   * JSON output is consistent across runs
//   * One paid account ≈ $50-200/mo gives continuous runs + SDK
//   * No CSP/anti-bot work on our side
//
// Setup (do once):
//   1. Create account at console.apify.com
//   2. Pick an actor (e.g. "epctex/propertyfinder-scraper" or "vivek-mehta/bayut-scraper")
//   3. Run it manually once to validate the output shape
//   4. Copy the API token (Settings → Integrations) and the dataset ID
//   5. Set env vars in .env:
//        APIFY_API_TOKEN=apify_api_xxx
//        APIFY_DATASET_ID=<dataset-id>          # specific run's dataset
//        APIFY_ACTOR_ID=<actor-id>              # alternative: latest run's dataset
//        APIFY_SOURCE=property_finder           # or 'bayut' (sets psf_history.source)
//
// Run:
//   node scripts/ingest-from-apify.mjs --dry-run       # preview, no DB writes
//   node scripts/ingest-from-apify.mjs                 # ingest
//   node scripts/ingest-from-apify.mjs --dataset <id>  # override dataset
//
// The ingester is field-tolerant — it tries common Apify-actor field names
// (price/listingPrice, area/community, beds/bedrooms, etc.) and skips rows
// that don't have at least a name + location.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

function loadEnv(file) {
  try {
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {}
}
loadEnv(resolve(repoRoot, '.env.local'))
loadEnv(resolve(repoRoot, '.env'))

const URL_BASE  = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY
const APIFY_TOKEN   = process.env.APIFY_API_TOKEN
const APIFY_DATASET = (() => {
  const idx = process.argv.indexOf('--dataset')
  if (idx > -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return process.env.APIFY_DATASET_ID
})()
const APIFY_ACTOR  = process.env.APIFY_ACTOR_ID
const APIFY_SOURCE = process.env.APIFY_SOURCE || 'property_finder'  // 'bayut' also valid
const DRY_RUN = process.argv.includes('--dry-run')

if (!URL_BASE || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!APIFY_TOKEN && !DRY_RUN) {
  console.error(`
Missing APIFY_API_TOKEN. To set up:
  1. Sign up at https://console.apify.com (free tier OK to test).
  2. Pick an actor — e.g. https://apify.com/epctex/propertyfinder-scraper
  3. Run it once with input { "search": "off-plan dubai", "maxItems": 200 }.
  4. Copy the Run dataset ID + your API token from Settings → Integrations.
  5. Add to .env:
       APIFY_API_TOKEN=apify_api_...
       APIFY_DATASET_ID=<dataset-id>
       APIFY_SOURCE=property_finder
  6. Re-run this script.
`)
  process.exit(2)
}

const SB_HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
}


// ─── Apify dataset fetch ─────────────────────────────────────
async function fetchApifyItems() {
  if (DRY_RUN && !APIFY_TOKEN) return _fakeFixture()

  let url
  if (APIFY_DATASET) {
    url = `https://api.apify.com/v2/datasets/${APIFY_DATASET}/items?clean=true&format=json&token=${APIFY_TOKEN}`
  } else if (APIFY_ACTOR) {
    // Latest successful run of this actor — lets the cron fire blind.
    url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs/last/dataset/items?status=SUCCEEDED&clean=true&format=json&token=${APIFY_TOKEN}`
  } else {
    console.error('Set APIFY_DATASET_ID or APIFY_ACTOR_ID')
    process.exit(2)
  }

  const r = await fetch(url)
  if (!r.ok) {
    console.error(`Apify ${r.status}: ${(await r.text()).slice(0, 300)}`)
    process.exit(1)
  }
  const data = await r.json()
  if (!Array.isArray(data)) {
    console.error('Apify returned non-array dataset')
    process.exit(1)
  }
  return data
}


// ─── Field-tolerant normaliser ───────────────────────────────
// Apify actors don't share a schema. We accept a few common shapes for each
// field and pick whichever the actor emitted. Unknown fields are kept in
// `_raw` for downstream debugging (jsonb column on projects when migration adds it).
const PICK = (item, ...keys) => {
  for (const k of keys) {
    if (item[k] != null && item[k] !== '') return item[k]
  }
  return null
}

function normaliseItem(item) {
  const name = PICK(item, 'projectName', 'project_name', 'name', 'title', 'developmentName')
  const developerName = PICK(item, 'developerName', 'developer', 'builder', 'developmentBy')
  const area = PICK(item, 'area', 'community', 'subCommunity', 'location', 'neighborhood')
  const city = PICK(item, 'city', 'emirate', 'cityName')

  if (!name) return null

  const minPrice = parsePrice(PICK(item, 'minPrice', 'startingPrice', 'price', 'priceFrom', 'listingPrice'))
  const maxPrice = parsePrice(PICK(item, 'maxPrice', 'priceTo'))
  const psf      = parseInt(PICK(item, 'pricePerSqft', 'psf', 'pricePerSqFt'), 10) || null
  const handover = PICK(item, 'handoverDate', 'completionDate', 'completion', 'completionQuarter')
  const bedrooms = (PICK(item, 'bedrooms', 'beds', 'bedroomTypes') || '').toString()

  return {
    name: String(name).trim().slice(0, 200),
    developer_name: developerName ? String(developerName).trim() : null,
    area: area ? String(area).trim() : 'Unknown',
    city: city ? String(city).trim() : null,
    min_price: minPrice,
    max_price: maxPrice,
    current_psf: psf,
    handover_hint: handover ? String(handover) : null,
    unit_types: parseUnitTypes(bedrooms),
    source_url: PICK(item, 'url', 'listingUrl', 'pageUrl'),
    _raw: item,
  }
}


function parsePrice(value) {
  if (value == null) return null
  if (typeof value === 'number') return Math.round(value)
  const s = String(value).toUpperCase().replaceAll(',', '').replaceAll('AED', '').trim()
  const m = /([\d.]+)\s*(M|K)?/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  if (m[2] === 'M') return Math.round(n * 1_000_000)
  if (m[2] === 'K') return Math.round(n * 1_000)
  return Math.round(n)
}


function parseUnitTypes(beds) {
  const types = []
  const s = beds.toLowerCase()
  if (/studio/.test(s)) types.push('studio')
  for (const n of [1, 2, 3, 4, 5]) {
    if (new RegExp(`(^|\\D)${n}\\s*(br|bed|bedroom)`).test(s)) types.push(`${n}br`)
  }
  for (const k of ['penthouse', 'villa', 'townhouse', 'duplex']) {
    if (s.includes(k)) types.push(k)
  }
  return types.length ? types : null
}


// ─── Slug + developer matching (reuses seeder's normaliser) ──
const NAME_STRIP_TOKENS = [
  'pjsc', 'llc', 'properties', 'property', 'real estate', 'real-estate',
  'developments', 'development', 'developers', 'developer',
  'holding', 'group', 'limited', 'ltd', 'inc',
]

function slugify(name) {
  return String(name).toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '').slice(0, 80)
}

function nameKey(name) {
  let s = ' ' + String(name).toLowerCase().replaceAll(/[^a-z0-9]+/g, ' ') + ' '
  for (const tok of NAME_STRIP_TOKENS) s = s.replaceAll(` ${tok} `, ' ')
  s = s.replaceAll(/\sby\s\S+(\s|$)/g, ' ')
  return s.replaceAll(/\s+/g, ' ').trim()
}


async function fetchDeveloperMap() {
  const r = await fetch(
    `${URL_BASE}/rest/v1/developers?select=id,name`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  )
  const rows = r.ok ? await r.json() : []
  const byKey = new Map()
  for (const row of rows) {
    const k = nameKey(row.name)
    if (k && !byKey.has(k)) byKey.set(k, row.id)
  }
  return byKey
}


// ─── Upsert ──────────────────────────────────────────────────
async function upsertProject(item, devMap) {
  // 1. Resolve / create developer.
  let developerId = null
  if (item.developer_name) {
    developerId = devMap.get(nameKey(item.developer_name)) ?? null
    if (!developerId) {
      // Insert minimal developer row.
      const r = await fetch(
        `${URL_BASE}/rest/v1/developers?on_conflict=slug`,
        {
          method: 'POST', headers: SB_HEADERS,
          body: JSON.stringify([{
            name: item.developer_name,
            slug: slugify(item.developer_name),
            developer_score: 50,
            hq_location: item.city,
          }]),
        },
      )
      if (r.ok) {
        const rows = await r.json()
        developerId = rows?.[0]?.id ?? null
        if (developerId) devMap.set(nameKey(item.developer_name), developerId)
      }
    }
  }
  if (!developerId) return { ok: false, error: 'no developer' }

  // 2. Upsert project. Same DLD-protected fields rule as elsewhere: never
  //    overwrite current_psf / units_sold / sellthrough_pct.
  const slug = slugify(item.name)
  const row = {
    developer_id: developerId,
    name: item.name,
    slug,
    area: item.area,
    city: item.city || 'Dubai',
    status: 'active',
    handover_status: 'on_track',
    total_units: 0,
    min_price: item.min_price,
    max_price: item.max_price,
    unit_types: item.unit_types,
  }
  // Strip nulls so absent keys don't null-overwrite existing values.
  for (const k of Object.keys(row)) if (row[k] == null) delete row[k]

  const r = await fetch(
    `${URL_BASE}/rest/v1/projects?on_conflict=slug`,
    { method: 'POST', headers: SB_HEADERS, body: JSON.stringify([row]) },
  )
  if (!r.ok) return { ok: false, error: (await r.text()).slice(0, 200) }
  const rows = await r.json()
  const projectId = rows?.[0]?.id
  if (!projectId) return { ok: false, error: 'no id back' }

  // 3. PSF history (if provided).
  if (item.current_psf) {
    await fetch(
      `${URL_BASE}/rest/v1/psf_history?on_conflict=project_id,recorded_date,source`,
      {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify([{
          project_id: projectId,
          recorded_date: new Date().toISOString().slice(0, 10),
          psf: item.current_psf,
          source: APIFY_SOURCE,
          sample_size: 1,
        }]),
      },
    )
  }
  return { ok: true, project_id: projectId }
}


// ─── Fixture for offline preview ─────────────────────────────
function _fakeFixture() {
  return [
    {
      projectName: 'Sample Tower',
      developer: 'Sample Developer',
      area: 'Dubai Marina',
      city: 'Dubai',
      minPrice: '1,200,000 AED',
      bedrooms: '1, 2, 3 BR',
    },
  ]
}


// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`Apify source=${APIFY_SOURCE} dataset=${APIFY_DATASET ?? '(via actor)'} actor=${APIFY_ACTOR ?? '—'}`)

  const items = await fetchApifyItems()
  console.log(`Apify items fetched: ${items.length}`)

  const normalised = items.map(normaliseItem).filter(Boolean)
  console.log(`Items with usable name+location: ${normalised.length}`)

  if (DRY_RUN) {
    console.log('\nFirst 5 normalised:')
    for (const n of normalised.slice(0, 5)) {
      console.log(`  ${n.name.padEnd(30)} dev=${(n.developer_name ?? '—').padEnd(20)} ${n.area.padEnd(20)} from ${n.min_price ?? '—'}`)
    }
    return
  }

  const devMap = await fetchDeveloperMap()
  console.log(`Existing developers loaded: ${devMap.size}`)

  let inserted = 0
  let failed = 0
  for (const item of normalised) {
    const r = await upsertProject(item, devMap)
    if (r.ok) inserted++
    else { failed++; console.error(`✗ ${item.name}: ${r.error}`) }
  }
  console.log(`\nDONE. inserted=${inserted} failed=${failed}`)
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
