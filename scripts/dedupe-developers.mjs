#!/usr/bin/env node
// scripts/dedupe-developers.mjs
//
// Deletes "duplicate" developer rows that resulted from running the Excel
// seed BEFORE fuzzy-matching was added. Pairs are detected via the same
// nameKey() normaliser the seeder uses ("Aldar Properties" and "Aldar
// Properties PJSC" share a key). When two rows share a key, we keep the
// one with more projects (real usage); if tied, we keep the older row
// (created_at) to preserve any FKs that depend on identity.

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

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN  = process.argv.includes('--dry-run')

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const NAME_STRIP_TOKENS = [
  'pjsc', 'llc', 'properties', 'property', 'real estate', 'real-estate',
  'developments', 'development', 'developers', 'developer',
  'holding', 'group', 'limited', 'ltd', 'inc',
]

function nameKey(name) {
  let s = ' ' + String(name).toLowerCase().replaceAll(/[^a-z0-9]+/g, ' ') + ' '
  for (const tok of NAME_STRIP_TOKENS) s = s.replaceAll(` ${tok} `, ' ')
  s = s.replaceAll(/\sby\s\S+(\s|$)/g, ' ')
  return s.replaceAll(/\s+/g, ' ').trim()
}


// Tie-breaker: keep the row with more projects, then the older row.
function pickKeeper(a, b) {
  const aProj = a.total_projects_count || 0
  const bProj = b.total_projects_count || 0
  if (aProj !== bProj) return aProj > bProj ? a : b
  return a.created_at < b.created_at ? a : b
}


// Score how "clean" a name is — fewer suffix/legal tokens wins.
const NAME_NOISE_TOKENS = ['pjsc', 'llc', 'limited', 'ltd', 'inc', 'holding', 'group',
                            'developments', 'developers', 'real estate', 'realty', 'real-estate']

function nameCleanliness(name) {
  let score = 0
  const lc = ' ' + String(name).toLowerCase() + ' '
  for (const tok of NAME_NOISE_TOKENS) {
    if (lc.includes(` ${tok} `) || lc.includes(`(${tok})`)) score--
  }
  if (lc.includes(' by ')) score -= 2          // "Beyond by Beyond" → noisy
  if (/\d/.test(name)) score--
  return score - name.length / 80              // shorter wins on ties
}


async function deleteIfNoProjects(row) {
  const proj = await fetch(
    `${URL_BASE}/rest/v1/projects?select=id&developer_id=eq.${row.id}&limit=1`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  )
  const projRows = proj.ok ? await proj.json() : []
  if (projRows.length > 0) {
    return { ok: false, reason: `still has ${projRows.length}+ projects` }
  }
  const del = await fetch(
    `${URL_BASE}/rest/v1/developers?id=eq.${row.id}`,
    { method: 'DELETE', headers: H },
  )
  return del.ok ? { ok: true } : { ok: false, reason: (await del.text()).slice(0, 200) }
}


async function maybeRenameKeeper(keeper, group) {
  const cleanest = group.reduce((a, b) =>
    nameCleanliness(b.name) > nameCleanliness(a.name) ? b : a)
  if (cleanest.id === keeper.id) return false
  const r = await fetch(
    `${URL_BASE}/rest/v1/developers?id=eq.${keeper.id}`,
    { method: 'PATCH', headers: H, body: JSON.stringify({ name: cleanest.name }) },
  )
  if (!r.ok) {
    console.error(`  ✗ rename ${keeper.id}: ${(await r.text()).slice(0, 200)}`)
    return false
  }
  console.log(`  ↻ rename "${keeper.name}" → "${cleanest.name}"`)
  return true
}


async function processCollisions(collisions) {
  let deleted = 0
  let renamed = 0
  for (const [, group] of collisions) {
    const keeper = group.reduce(pickKeeper)
    if (await maybeRenameKeeper(keeper, group)) renamed++
    for (const row of group.filter(g => g.id !== keeper.id)) {
      const r = await deleteIfNoProjects(row)
      if (r.ok) {
        deleted++
        console.log(`  − deleted "${row.name}"`)
      } else {
        console.log(`  ✗ skip "${row.name}" (${r.reason})`)
      }
    }
  }
  return { deleted, renamed }
}


async function main() {
  const r = await fetch(
    `${URL_BASE}/rest/v1/developers?select=id,name,slug,total_projects_count,active_projects,created_at,founded_year,website_url`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  )
  const rows = r.ok ? await r.json() : []
  console.log(`Total developers: ${rows.length}`)

  const byKey = new Map()
  for (const row of rows) {
    const k = nameKey(row.name)
    if (!k) continue
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(row)
  }

  const collisions = [...byKey.entries()].filter(([, rs]) => rs.length > 1)
  console.log(`Collision groups (≥2 rows): ${collisions.length}`)

  const toDelete = []
  for (const [key, group] of collisions) {
    const keeper = group.reduce(pickKeeper)
    const losers = group.filter(g => g.id !== keeper.id)
    console.log(`  [${key}] keep "${keeper.name}" (proj=${keeper.total_projects_count || 0}); drop ${losers.map(l => `"${l.name}"`).join(', ')}`)
    toDelete.push(...losers)
  }

  if (toDelete.length === 0) {
    console.log('Nothing to delete.')
    return
  }
  console.log(`\n${DRY_RUN ? 'DRY RUN' : 'DELETE'}: ${toDelete.length} duplicate rows`)

  if (DRY_RUN) return

  const { deleted, renamed } = await processCollisions(collisions)
  console.log(`\nDONE. deleted=${deleted}/${toDelete.length}, renamed_keepers=${renamed}`)
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
