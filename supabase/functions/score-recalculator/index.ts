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

function scoreSellthrough(pct: number): number {
  if (pct >= 90) return 40
  if (pct >= 75) return 36
  if (pct >= 60) return 30
  if (pct >= 45) return 24
  if (pct >= 30) return 16
  if (pct >= 15) return 10
  return Math.floor((pct / 15) * 10)
}

function scorePsfDelta(psfHistory: { recorded_date: string; psf: number }[]): number {
  if (psfHistory.length < 2) return 15

  const sorted = [...psfHistory].sort(
    (a, b) => new Date(a.recorded_date).getTime() - new Date(b.recorded_date).getTime()
  )

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const historical = sorted.filter(p => new Date(p.recorded_date) <= sixMonthsAgo)
  const basePsf = historical.length > 0
    ? historical[historical.length - 1].psf
    : sorted[0].psf

  const latestPsf = sorted[sorted.length - 1].psf
  const deltaPct = ((latestPsf - basePsf) / basePsf) * 100

  if (deltaPct >= 20) return 30
  if (deltaPct >= 15) return 27
  if (deltaPct >= 10) return 24
  if (deltaPct >= 7)  return 21
  if (deltaPct >= 5)  return 18
  if (deltaPct >= 3)  return 15
  if (deltaPct >= 0)  return 12
  if (deltaPct >= -3) return 8
  if (deltaPct >= -7) return 4
  return 0
}

function scoreDeveloper(developerScore: number | null): number {
  if (developerScore === null) return 10
  return Math.round((developerScore / 100) * 20)
}

function scoreHandover(status: string, delayDays: number): number {
  if (status === 'on_track' || status === 'completed') return 10
  if (status === 'at_risk') return 6
  if (status === 'delayed') {
    if (delayDays <= 90) return 4
    if (delayDays <= 180) return 2
    return 0
  }
  return 5
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  console.log("score-recalculator triggered", body)

  // 1. Fetch all active projects with developer
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id, sellthrough_pct, handover_status, handover_delay_days, developer:developer_id(developer_score)")
    .in("status", ["active", "pre_launch"])

  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), { status: 500 })
  }

  const today = new Date().toISOString().split("T")[0]
  let updated = 0

  for (const project of (projects ?? [])) {
    // 2. Fetch PSF history (last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const { data: psfHistory } = await supabase
      .from("psf_history")
      .select("recorded_date, psf")
      .eq("project_id", project.id)
      .gte("recorded_date", sixMonthsAgo.toISOString().split("T")[0])
      .order("recorded_date", { ascending: true })

    // 3. Calculate score
    const devScore = (project.developer as any)?.developer_score ?? null
    const st    = scoreSellthrough(project.sellthrough_pct ?? 0)
    const psf   = scorePsfDelta(psfHistory ?? [])
    const dev   = scoreDeveloper(devScore)
    const ho    = scoreHandover(project.handover_status, project.handover_delay_days ?? 0)
    const total = st + psf + dev + ho

    const breakdown = { sellthrough: st, psf_delta: psf, developer: dev, handover: ho, total }

    // 4. Update project score
    await supabase
      .from("projects")
      .update({ score: total, score_breakdown: breakdown, score_updated_at: new Date().toISOString() })
      .eq("id", project.id)

    // 5. Snapshot for trend chart
    await supabase
      .from("score_snapshots")
      .upsert({ project_id: project.id, score_date: today, score: total, breakdown })

    updated++
  }

  console.log(`Updated scores for ${updated} projects`)

  return new Response(JSON.stringify({ updated }), {
    headers: { "Content-Type": "application/json" },
  })
})
