// scripts/recalculate-scores.mjs
// Bulk-recompute project scores using the algorithm in
// apps/web/lib/scoring/algorithm.ts. Skips projects without enough
// signal (sets score=NULL so the UI can render '—' instead of '0').
//
// Run: node scripts/recalculate-scores.mjs
//
// Why this exists: the production path is the score-recalculator Edge
// Function, which isn't deployed to this project yet. Until it is, this
// script is the source of truth for keeping scores fresh after the
// scraper writes new project rows.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot  = resolve(__dirname, '..')

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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
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

// ─── Algorithm ports — keep aligned with apps/web/lib/scoring/algorithm.ts ───
function scoreSellthrough(pct) {
  if (pct >= 90) return 40
  if (pct >= 75) return 36
  if (pct >= 60) return 30
  if (pct >= 45) return 24
  if (pct >= 30) return 16
  if (pct >= 15) return 10
  return Math.floor((pct / 15) * 10)
}

function scorePsfDelta(history) {
  if (history.length < 2) return 15
  const sorted = [...history].sort(
    (a, b) => new Date(a.recorded_date) - new Date(b.recorded_date)
  )
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const historical = sorted.filter(p => new Date(p.recorded_date) <= sixMonthsAgo)
  const basePsf  = historical.length ? historical.at(-1).psf : sorted[0].psf
  const latestPsf = sorted.at(-1).psf
  const deltaPct = ((latestPsf - basePsf) / basePsf) * 100
  if (deltaPct >= 20)  return 30
  if (deltaPct >= 15)  return 27
  if (deltaPct >= 10)  return 24
  if (deltaPct >= 7)   return 21
  if (deltaPct >= 5)   return 18
  if (deltaPct >= 3)   return 15
  if (deltaPct >= 0)   return 12
  if (deltaPct >= -3)  return 8
  if (deltaPct >= -7)  return 4
  return 0
}

function scoreDeveloper(devScore) {
  if (devScore == null) return 10
  return Math.round((devScore / 100) * 20)
}

function scoreHandover(status, delayDays) {
  switch (status) {
    case 'on_track':  return 10
    case 'completed': return 10
    case 'at_risk':   return 6
    case 'delayed':
      if (delayDays <= 90)  return 4
      if (delayDays <= 180) return 2
      return 0
    default: return 5
  }
}

// A project gets a real score only when we have demand data (sellthrough_pct).
// Listing-only rows (PF without DLD enrichment) get score=NULL so the UI shows
// "—" instead of an artificially-low "Avoid" rating driven by missing sellthrough.
function hasEnoughSignal(p /* psfCount unused — see comment above */) {
  return p.sellthrough_pct != null && p.sellthrough_pct > 0
}

async function main() {
  console.log('Recomputing project scores...\n')

  const projects = await rest('GET', 'projects', {
    params: {
      select: 'id,slug,sellthrough_pct,handover_status,handover_delay_days,developer_id',
    },
  })

  const developers = await rest('GET', 'developers', {
    params: { select: 'id,developer_score' },
  })
  const devScoreById = Object.fromEntries(developers.map(d => [d.id, d.developer_score]))

  const psfHistory = await rest('GET', 'psf_history', {
    params: { select: 'project_id,recorded_date,psf' },
  })
  const psfByProject = {}
  for (const r of psfHistory) {
    (psfByProject[r.project_id] ??= []).push(r)
  }

  let scored = 0, blanked = 0
  const now = new Date().toISOString()

  for (const p of projects) {
    const history = psfByProject[p.id] ?? []

    if (!hasEnoughSignal(p)) {
      await rest('PATCH', 'projects', {
        params: { id: `eq.${p.id}` },
        body: { score: null, score_breakdown: null, score_updated_at: now },
        prefer: 'return=minimal',
      })
      blanked++
      continue
    }

    const sellthrough = scoreSellthrough(p.sellthrough_pct ?? 0)
    const psf_delta   = scorePsfDelta(history)
    const developer   = scoreDeveloper(devScoreById[p.developer_id] ?? null)
    const handover    = scoreHandover(p.handover_status, p.handover_delay_days ?? 0)
    const total       = sellthrough + psf_delta + developer + handover
    const breakdown   = { sellthrough, psf_delta, developer, handover, total }

    await rest('PATCH', 'projects', {
      params: { id: `eq.${p.id}` },
      body: { score: total, score_breakdown: breakdown, score_updated_at: now },
      prefer: 'return=minimal',
    })

    await rest('POST', 'score_snapshots', {
      body: [{
        project_id: p.id,
        score_date: now.slice(0, 10),
        score: total,
        breakdown,
      }],
      params: { on_conflict: 'project_id,score_date' },
      prefer: 'resolution=merge-duplicates,return=minimal',
    })

    scored++
    console.log(`  ${p.slug}: ${total} (s=${sellthrough}, psf=${psf_delta}, dev=${developer}, h=${handover})`)
  }

  console.log(`\nScored: ${scored}   Blanked (insufficient signal): ${blanked}`)
}

main().catch(e => { console.error(e); process.exit(1) })
