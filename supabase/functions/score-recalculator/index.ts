// supabase/functions/score-recalculator/index.ts
//
// Supabase Edge Function — Project Score Recalculator
// Triggered: after each scraper run, or on a schedule (every 6h)
// Deploy: supabase functions deploy score-recalculator
//
// What it does:
//   1. Fetches all active projects
//   2. For each project, fetches PSF history (last 6 months)
//   3. Calculates score using the algorithm in lib/scoring/algorithm.ts
//   4. Updates projects.score and score_snapshots

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

// ⚠️  DUPLICATED SCORING LOGIC — must stay in sync with apps/web/lib/scoring/algorithm.ts
// Edge Functions (Deno) can't import from the monorepo packages.
// Any change to scoring thresholds MUST be applied in BOTH files.
// The test suite in apps/web/__tests__/scoring.test.ts validates the canonical version.
// TODO: Extract to a shared Deno-compatible module when Supabase supports import maps.

// ─── Component weights & buckets ────────────────────────────
// Total 100 = sellthrough (35) + psf_delta (20) + developer (30) + handover (15).
// Reweighted from the original 40/30/20/10 to give MORE weight to signals we
// reliably have (developer tier, handover proximity) and less to ones we often
// don't (long PSF history). Default fallbacks shrink so flat-data projects
// don't bunch near the average.

const SELLTHROUGH_PCT_BUCKETS: Array<[number, number]> = [
  [90, 35], [75, 32], [60, 27], [45, 22], [30, 15], [15, 10],
]
const SELLTHROUGH_UNITS_BUCKETS: Array<[number, number]> = [
  [50, 26], [20, 22], [10, 18], [5, 14], [2, 10], [1, 6],
]
const PSF_DELTA_BUCKETS: Array<[number, number]> = [
  [20, 20], [15, 18], [10, 16], [7, 14], [5, 12], [3, 10], [0, 8], [-3, 5], [-7, 2],
]
// Ascending months-until-handover thresholds; smaller months = full credit.
const HANDOVER_PROXIMITY_BUCKETS: Array<[number, number]> = [
  [12, 15], [24, 13], [36, 11], [48, 9],
]

// Walks high→low: returns score when `value >= threshold`.
function bucketScore(buckets: Array<[number, number]>, value: number, fallback: number): number {
  for (const [threshold, score] of buckets) {
    if (value >= threshold) return score
  }
  return fallback
}

// Walks low→high: returns score when `value <= threshold`.
function bucketScoreLte(buckets: Array<[number, number]>, value: number, fallback: number): number {
  for (const [threshold, score] of buckets) {
    if (value <= threshold) return score
  }
  return fallback
}


// Sellthrough: prefer the explicit pct (units_sold / total_units * 100) when
// total_units > 0; otherwise fall back to a log-bucketed units_sold signal so
// projects with real DLD-matched sales differentiate from those with none.
function scoreSellthrough(pct: number, unitsSold: number, totalUnits: number): number {
  if (totalUnits > 0 && pct > 0) {
    return bucketScore(SELLTHROUGH_PCT_BUCKETS, pct, Math.floor((pct / 15) * 10))
  }
  return bucketScore(SELLTHROUGH_UNITS_BUCKETS, unitsSold, 0)
}


// PSF momentum: prefer 6-month history delta, fall back to launch_psf vs
// current_psf, fall back to neutral 12 (was 15 — slightly down so flat-data
// projects don't dominate).
function computePsfDeltaPct(
  psfHistory: { recorded_date: string; psf: number }[],
  launchPsf: number | null,
  currentPsf: number | null,
): number | null {
  if (psfHistory.length >= 2) {
    const sorted = [...psfHistory].sort(
      (a, b) => new Date(a.recorded_date).getTime() - new Date(b.recorded_date).getTime()
    )
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const historical = sorted.filter(p => new Date(p.recorded_date) <= sixMonthsAgo)
    const basePsf = (historical.length > 0 ? historical.at(-1)?.psf : sorted[0].psf) ?? 0
    const latestPsf = sorted.at(-1)?.psf ?? 0
    if (basePsf > 0) return ((latestPsf - basePsf) / basePsf) * 100
    return null
  }
  if (launchPsf && currentPsf && launchPsf > 0) {
    return ((currentPsf - launchPsf) / launchPsf) * 100
  }
  return null
}

function scorePsfDelta(
  psfHistory: { recorded_date: string; psf: number }[],
  launchPsf: number | null,
  currentPsf: number | null,
  unitsSold: number,
): number {
  const deltaPct = computePsfDeltaPct(psfHistory, launchPsf, currentPsf)
  if (deltaPct != null) return bucketScore(PSF_DELTA_BUCKETS, deltaPct, 0)

  // No PSF delta computable. Default depends on what surrounding signals say
  // about the project being market-active:
  //   * units_sold ≥ 5  → strong market validation                 → 16/20
  //   * units_sold ≥ 1  → some traction                            → 12/20
  //   * current_psf set → at least observable in the market        → 10/20
  //   * nothing         → genuine no-signal                        →  6/20
  if (unitsSold >= 5) return 16
  if (unitsSold >= 1) return 12
  if (currentPsf)     return 10
  return 6
}


// Developer (max 30). Curated tier system writes 50-99 to developers.developer_score
// (see scripts/rank-developers.mjs). Top tier (Emaar/Sobha=98) → 30 pts.
function scoreDeveloper(developerScore: number | null): number {
  if (developerScore === null) return 12
  return Math.round((developerScore / 100) * 30)
}


function scoreDelayed(delayDays: number): number {
  if (delayDays <= 90)  return 6
  if (delayDays <= 180) return 3
  return 0
}

function monthsUntil(date: string): number {
  return (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
}

// Handover (max 15). Penalises lateness; rewards proximity.
function scoreHandover(status: string, delayDays: number, handoverDate: string | null): number {
  if (status === 'delayed')   return scoreDelayed(delayDays)
  if (status === 'at_risk')   return 9
  if (status === 'completed') return 15
  if (!handoverDate)          return 11
  return bucketScoreLte(HANDOVER_PROXIMITY_BUCKETS, monthsUntil(handoverDate), 7)
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  console.log("score-recalculator triggered", body)

  // 1. Fetch all active projects with developer
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id, sellthrough_pct, units_sold, total_units, launch_psf, current_psf, handover_status, handover_delay_days, current_handover_date, developer:developer_id(developer_score)")
    .in("status", ["active", "pre_launch"])

  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), { status: 500 })
  }

  const today = new Date().toISOString().split("T")[0]
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0]

  const projectIds = (projects ?? []).map(p => p.id)

  // 2. Batch-fetch all PSF history in one query instead of N+1
  const { data: allPsfHistory } = await supabase
    .from("psf_history")
    .select("project_id, recorded_date, psf")
    .in("project_id", projectIds)
    .gte("recorded_date", sixMonthsAgoStr)
    .order("recorded_date", { ascending: true })

  const psfByProject = new Map<string, { recorded_date: string; psf: number }[]>()
  for (const row of (allPsfHistory ?? [])) {
    const list = psfByProject.get(row.project_id) ?? []
    list.push({ recorded_date: row.recorded_date, psf: row.psf })
    psfByProject.set(row.project_id, list)
  }

  let updated = 0
  let failed = 0

  for (const project of (projects ?? [])) {
    try {
      const psfHistory = psfByProject.get(project.id) ?? []

      // 3. Calculate score
      const devScore = (project.developer as any)?.developer_score ?? null
      const st    = scoreSellthrough(
        project.sellthrough_pct ?? 0,
        project.units_sold ?? 0,
        project.total_units ?? 0,
      )
      const psf   = scorePsfDelta(psfHistory, project.launch_psf ?? null, project.current_psf ?? null, project.units_sold ?? 0)
      const dev   = scoreDeveloper(devScore)
      const ho    = scoreHandover(project.handover_status, project.handover_delay_days ?? 0, project.current_handover_date ?? null)
      const total = st + psf + dev + ho

      const breakdown = { sellthrough: st, psf_delta: psf, developer: dev, handover: ho, total }

      // 4. Update project score + snapshot in parallel
      const [updateRes, snapshotRes] = await Promise.all([
        supabase
          .from("projects")
          .update({ score: total, score_breakdown: breakdown, score_updated_at: new Date().toISOString() })
          .eq("id", project.id),
        supabase
          .from("score_snapshots")
          .upsert(
            { project_id: project.id, score_date: today, score: total, breakdown },
            { onConflict: 'project_id,score_date' },
          ),
      ])

      if (updateRes.error) throw updateRes.error
      if (snapshotRes.error) throw snapshotRes.error

      updated++
    } catch (err) {
      failed++
      console.error(`Failed to score project ${project.id}:`, err)
    }
  }

  console.log(`Updated scores for ${updated} projects${failed ? `, ${failed} failed` : ""}`)

  return new Response(JSON.stringify({ updated }), {
    headers: { "Content-Type": "application/json" },
  })
})
