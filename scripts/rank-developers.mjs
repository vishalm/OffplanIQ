#!/usr/bin/env node
// scripts/rank-developers.mjs
//
// Backfills developers.developer_score using a curated tier system based on
// public reputation, project count, and average PSF. This is real-world
// knowledge UAE property buyers already share — Emaar, Sobha, Damac, Aldar
// and Nakheel are top tier in any listing book; the long tail isn't.
//
// Run: node scripts/rank-developers.mjs

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

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

// ─── Public tiers (UAE property knowledge) ───
// Top tier: blue-chip developers everyone in the market knows by name.
// Each entry is matched against developer.name with a case-insensitive substring.
const TIERS = [
  { tier: 'top',     score: 92, names: ['Emaar', 'Sobha', 'Damac', 'Aldar', 'Nakheel', 'Meraas'] },
  { tier: 'premium', score: 80, names: ['Ellington', 'Binghatti', 'Azizi', 'Dubai Properties',
                                          'Dubai Holding', 'MAG', 'Omniyat'] },
  { tier: 'mid',     score: 68, names: ['Imtiaz', 'Danube', 'Tiger', 'Beyond', 'Modon',
                                          'Alef', 'Reportage', 'Bloom', 'Select Group',
                                          'Eagle Hills', 'Object 1', 'Iman'] },
]
const DEFAULT_SCORE = 52   // long-tail "we recognise the slug but no public footprint"


function tierFor(name) {
  const n = (name || '').toLowerCase()
  for (const t of TIERS) {
    if (t.names.some(x => n.includes(x.toLowerCase()))) return { ...t }
  }
  return { tier: 'long-tail', score: DEFAULT_SCORE }
}


async function fetchDevelopers() {
  const r = await fetch(
    `${URL_BASE}/rest/v1/developers?select=id,name,total_projects_count`,
    { headers: H },
  )
  return r.ok ? r.json() : []
}

async function fetchAvgPsfPerDev() {
  // For tie-breaking: pull avg current_psf per developer.
  const r = await fetch(
    `${URL_BASE}/rest/v1/projects?select=developer_id,current_psf&current_psf=not.is.null`,
    { headers: H },
  )
  if (!r.ok) return new Map()
  const rows = await r.json()
  const sums = new Map()
  for (const row of rows) {
    if (!row.developer_id) continue
    const cur = sums.get(row.developer_id) || { sum: 0, n: 0 }
    cur.sum += row.current_psf
    cur.n   += 1
    sums.set(row.developer_id, cur)
  }
  const out = new Map()
  for (const [id, { sum, n }] of sums) out.set(id, n ? Math.round(sum / n) : null)
  return out
}


async function patch(id, payload) {
  const r = await fetch(`${URL_BASE}/rest/v1/developers?id=eq.${id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify(payload),
  })
  return r.ok
}


async function main() {
  const devs = await fetchDevelopers()
  if (!devs.length) {
    console.error('No developers found.')
    process.exit(1)
  }
  const psfByDev = await fetchAvgPsfPerDev()

  let counts = { top: 0, premium: 0, mid: 0, 'long-tail': 0 }
  let updated = 0
  for (const d of devs) {
    const tier = tierFor(d.name)
    let score = tier.score
    // Project-count bump (caps +6): more projects = more market footprint.
    const projects = d.total_projects_count || 0
    if (projects >= 20) score += 6
    else if (projects >= 10) score += 4
    else if (projects >= 5)  score += 2
    // Premium-PSF bump (caps +4): high avg PSF signals upmarket positioning.
    const avgPsf = psfByDev.get(d.id)
    if (avgPsf && avgPsf >= 3000) score += 4
    else if (avgPsf && avgPsf >= 2000) score += 2
    score = Math.min(99, score)
    counts[tier.tier]++
    const ok = await patch(d.id, { developer_score: score })
    if (ok) updated++
  }
  console.log(`Updated ${updated}/${devs.length} developers`)
  console.log('Tier breakdown:', counts)

  console.log('\nTop 8 after re-rank:')
  const r = await fetch(
    `${URL_BASE}/rest/v1/developers?select=name,total_projects_count,developer_score&developer_score=not.is.null&order=developer_score.desc.nullslast&limit=8`,
    { headers: H },
  )
  const top = await r.json()
  for (const d of top) console.log(`  ${(d.name || '').padEnd(30)} score=${d.developer_score} projects=${d.total_projects_count}`)
}

main().catch(e => { console.error(e); process.exit(1) })
