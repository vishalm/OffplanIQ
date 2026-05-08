#!/usr/bin/env node
// scripts/seed-developers-from-excel.mjs
//
// Reads UAE_Property_Developers_Complete_v1.xlsx (curated master DB) and
// upserts each developer into the `developers` table with real-world data:
//
//   * tier label  (Tier 1 / 2 / 3 + rank 1-4)
//   * official_url (real, public, used by the LLM intelligence scraper)
//   * founded_year, hq_location (emirate), hq_address, key_person
//   * phone_direct, phone_hotline, email
//   * ownership_type, segments, employees, est_revenue, geographic_presence
//   * stock_listing, social_media, key_projects
//   * developer_score derived from tier rank (Tier 1 → 92, 2 → 78, 3 → 65, 4 → 50)
//
// Re-runnable: upserts on slug. The seeder is column-tolerant — if the
// 20260507000001 migration hasn't been applied yet, columns that don't exist
// are silently dropped and we still write `name/slug/official_url/founded_year/
// hq_location/developer_score` (all of which exist in the base schema).
//
// Run:   node scripts/seed-developers-from-excel.mjs
//        node scripts/seed-developers-from-excel.mjs --dry-run

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

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

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const XLSX_PATH = resolve(repoRoot, 'UAE_Property_Developers_Complete_v1.xlsx')

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
}


// Tier-label → (rank, score). Rank is the simpler integer the rest of the
// system filters on; score feeds the project-score formula.
const TIER_MAP = [
  { match: /tier\s*1/i,         rank: 1, score: 92, label: 'Tier 1 – Master Developer' },
  { match: /tier\s*2/i,         rank: 2, score: 78, label: 'Tier 2 – Mid/Fast-Growing'  },
  { match: /tier\s*3/i,         rank: 3, score: 65, label: 'Tier 3 – Active Boutique'   },
  { match: /tier\s*4|other/i,   rank: 4, score: 50, label: 'Tier 4 – Long-tail'         },
]

function tierFor(label) {
  if (!label) return TIER_MAP[3]
  return TIER_MAP.find(t => t.match.test(label)) || TIER_MAP[3]
}

function slugify(name) {
  return String(name).toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '').slice(0, 80)
}

function parseFoundedYear(value) {
  if (value == null) return null
  const m = /(19|20)\d{2}/.exec(String(value))
  return m ? Number(m[0]) : null
}

function normaliseUrl(value) {
  if (!value) return null
  const v = String(value).trim()
  if (!v) return null
  if (v.startsWith('http://') || v.startsWith('https://')) return v
  return `https://${v.replace(/^www\./i, 'www.')}`
}

function strOrNull(value) {
  if (value == null) return null
  const s = String(value).trim()
  return s || null
}


// Parse the Excel via Python (we already have openpyxl installed). We write
// a small helper script to a temp file rather than passing python via -c —
// the latter trips up on the curly braces in the JSON.stringify pass.
function readWorkbookRows() {
  const helper = resolve(repoRoot, 'scripts/_xlsx-to-json.py')
  const buf = execSync(`python3 ${helper} ${JSON.stringify(XLSX_PATH)}`, {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  })
  return JSON.parse(buf)
}


function buildPayload(row) {
  const tier = tierFor(row['Tier / Category'])
  const name = strOrNull(row['Developer Name'])
  if (!name) return null

  // The base schema (migration 1) ships `website_url`; migration 6 adds
  // `official_url` (used by the LLM intelligence scraper). We populate BOTH
  // and let pruneToSchema() drop whichever isn't there yet.
  const url = normaliseUrl(row['Website'])
  return {
    name,
    slug:                slugify(name),
    website_url:         url,
    official_url:        url,
    founded_year:        parseFoundedYear(row['Founded']),
    hq_location:         strOrNull(row['Emirate']),
    developer_score:     tier.score,
    // ── Optional new columns (silently dropped if migration not applied) ──
    tier:                tier.label,
    tier_rank:           tier.rank,
    ownership_type:      strOrNull(row['Ownership Type']),
    key_person:          strOrNull(row['Key Person']),
    hq_address:          strOrNull(row['HQ Address']),
    phone_direct:        strOrNull(row['Phone (Direct)']),
    phone_hotline:       strOrNull(row['Phone (Hotline/800)']),
    email:               strOrNull(row['Email']),
    segments:            strOrNull(row['Segments']),
    employees:           strOrNull(row['Employees']),
    est_revenue:         strOrNull(row['Est. Revenue / Portfolio']),
    geographic_presence: strOrNull(row['Geographic Presence']),
    stock_listing:       strOrNull(row['Stock / Listed']),
    social_media:        strOrNull(row['Social Media']),
    key_projects:        strOrNull(row['Key Projects']),
  }
}


// Strip keys that the DB rejects with PGRST204 ("column does not exist").
async function discoverColumns() {
  const r = await fetch(`${URL_BASE}/rest/v1/developers?select=*&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!r.ok) return null
  const rows = await r.json()
  if (rows && rows.length > 0) return new Set(Object.keys(rows[0]))
  // Empty table: probe with a HEAD-style request via the OpenAPI metadata.
  return null
}

function pruneToSchema(payload, columnSet) {
  if (!columnSet) return payload
  const out = {}
  for (const [k, v] of Object.entries(payload)) {
    if (columnSet.has(k)) out[k] = v
  }
  return out
}


// Normalise a developer name so "Aldar Properties PJSC" and "Aldar Properties"
// hash to the same key. Strips legal suffixes, sub-brand markers, and noise.
const NAME_STRIP_TOKENS = [
  'pjsc', 'llc', 'properties', 'property', 'real estate', 'real-estate',
  'developments', 'development', 'developers', 'developer',
  'holding', 'group', 'limited', 'ltd', 'inc',
]

function nameKey(name) {
  let s = ' ' + String(name).toLowerCase().replaceAll(/[^a-z0-9]+/g, ' ') + ' '
  for (const tok of NAME_STRIP_TOKENS) {
    s = s.replaceAll(` ${tok} `, ' ')
  }
  // Collapse trailing "by <Vendor>" sub-brand markers (e.g. "by Emaar").
  s = s.replaceAll(/\sby\s\S+(\s|$)/g, ' ')
  return s.replaceAll(/\s+/g, ' ').trim()
}


async function fetchExistingByKey() {
  const r = await fetch(`${URL_BASE}/rest/v1/developers?select=id,slug,name`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!r.ok) return new Map()
  const rows = await r.json()
  const byKey = new Map()
  for (const row of rows) {
    const key = nameKey(row.name)
    if (!key) continue
    // First-write-wins so we deterministically pick the same target on re-runs.
    if (!byKey.has(key)) byKey.set(key, row)
  }
  return byKey
}


async function upsertOne(payload, existingByKey) {
  // Try to match an existing row by normalised name first — avoids creating
  // duplicates like "Aldar Properties" vs "Aldar Properties PJSC".
  const key = nameKey(payload.name)
  const existing = existingByKey.get(key)

  if (existing) {
    // PATCH existing row. Don't overwrite slug or name (downstream FKs
    // reference the row via developer_id; slug + name are the stable
    // identity already known to users).
    const patch = { ...payload }
    delete patch.slug
    delete patch.name
    const r = await fetch(`${URL_BASE}/rest/v1/developers?id=eq.${existing.id}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify(patch),
    })
    if (!r.ok) {
      const text = await r.text()
      return { ok: false, mode: 'patch', error: text.slice(0, 200) }
    }
    return { ok: true, mode: 'patch', existing_name: existing.name }
  }

  // No fuzzy match → insert as new (upsert on slug to be idempotent).
  const r = await fetch(`${URL_BASE}/rest/v1/developers?on_conflict=slug`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify([payload]),
  })
  if (!r.ok) {
    const text = await r.text()
    return { ok: false, mode: 'insert', error: text.slice(0, 200) }
  }
  return { ok: true, mode: 'insert' }
}


// Per-record handler. Builds payload, prunes to schema, and either records
// a dry-run sample or upserts via fuzzy-match. Mutates `stats` and `samples`.
async function processRecord(rec, ctx) {
  const fullPayload = buildPayload(rec)
  if (!fullPayload) { ctx.stats.failed++; return }
  const payload = pruneToSchema(fullPayload, ctx.colSet)
  const existing = ctx.existingByKey.get(nameKey(payload.name))
  if (DRY_RUN) {
    ctx.samples.push({
      name: payload.name,
      tier: fullPayload.tier,
      url: payload.official_url ?? payload.website_url ?? '—',
      mode: existing ? `patch → ${existing.name}` : 'insert',
    })
    return
  }
  const r = await upsertOne(payload, ctx.existingByKey)
  if (!r.ok) {
    ctx.stats.failed++
    console.error(`✗ ${payload.name}: ${r.error}`)
    return
  }
  if (r.mode === 'patch') ctx.stats.patched++
  else                    ctx.stats.inserted++
}


async function main() {
  console.log(`Reading ${XLSX_PATH}`)
  const records = readWorkbookRows()
  console.log(`Parsed ${records.length} developer rows`)

  const colSet = await discoverColumns()
  if (colSet) {
    const newCols = ['tier', 'tier_rank', 'ownership_type', 'key_person', 'hq_address',
                     'phone_direct', 'phone_hotline', 'email', 'segments', 'employees',
                     'est_revenue', 'geographic_presence', 'stock_listing', 'social_media',
                     'key_projects']
    const present = newCols.filter(c => colSet.has(c))
    const missing = newCols.filter(c => !colSet.has(c))
    console.log(`Columns present in DB: ${present.join(', ') || '(none of the new ones)'}`)
    if (missing.length) {
      console.log(`⚠ Columns missing — apply migration 20260507000001 to gain: ${missing.join(', ')}`)
    }
  }

  const existingByKey = await fetchExistingByKey()
  console.log(`Existing developers in DB: ${existingByKey.size}`)

  const stats = { patched: 0, inserted: 0, failed: 0 }
  const samples = []
  for (const rec of records) {
    await processRecord(rec, { colSet, existingByKey, stats, samples })
  }

  if (DRY_RUN) {
    const wouldPatch = samples.filter(s => s.mode.startsWith('patch')).length
    const wouldInsert = samples.length - wouldPatch
    console.log(`\nDRY RUN. would_patch=${wouldPatch} would_insert=${wouldInsert} total=${records.length}`)
    console.log('\nFirst 12 mappings:')
    for (const s of samples.slice(0, 12)) {
      console.log(`  ${s.tier.padEnd(35)} ${s.name.padEnd(28)} [${s.mode}]`)
    }
    return
  }
  console.log(`\nDONE. patched=${stats.patched} inserted=${stats.inserted} failed=${stats.failed} total=${records.length}`)
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
