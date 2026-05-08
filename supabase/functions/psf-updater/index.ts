// supabase/functions/psf-updater/index.ts
//
// Supabase Edge Function — PSF Updater
// Triggered by scraper after inserting DLD transactions.
// What it does:
//   1. Finds projects with new DLD transactions in the last 2 days
//   2. Computes a rolling 30-day avg PSF from DLD data
//   3. Updates projects.current_psf
//   4. Appends a row to psf_history (source: 'dld')
//
// Deploy: supabase functions deploy psf-updater

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

serve(async (_req) => {
  const today     = new Date()
  const todayStr  = today.toISOString().split("T")[0]
  const day2Ago   = new Date(today); day2Ago.setDate(day2Ago.getDate() - 2)
  const day180Ago = new Date(today); day180Ago.setDate(day180Ago.getDate() - 180)

  // 1. Find projects whose DLD transactions were *scraped* in the last 2 days.
  //    DLD records carry the actual transaction-execution date (which can lag
  //    registration by weeks/months), so filtering by transaction_date misses
  //    fresh data. scraped_at is the right freshness signal.
  const { data: recentTxns } = await supabase
    .from("dld_transactions")
    .select("project_id")
    .not("project_id", "is", null)
    .gte("scraped_at", day2Ago.toISOString())
    .order("scraped_at", { ascending: false })

  const projectIds = [...new Set((recentTxns ?? []).map(t => t.project_id as string))]

  if (!projectIds.length) {
    return new Response(JSON.stringify({ updated: 0, message: "No recent transactions" }))
  }

  let updated = 0

  for (const projectId of projectIds) {
    // 2. Compute rolling avg PSF from DLD transactions (180-day window —
    //    accommodates DLD's registration lag).
    const { data: txns } = await supabase
      .from("dld_transactions")
      .select("psf, actual_area_sqft, transaction_value")
      .eq("project_id", projectId)
      .not("psf", "is", null)
      .gte("transaction_date", day180Ago.toISOString().split("T")[0])

    if (!txns?.length) continue

    // Weighted average PSF (by unit area) — more accurate than simple average
    const totalArea  = txns.reduce((sum, t) => sum + (t.actual_area_sqft ?? 0), 0)
    const totalValue = txns.reduce((sum, t) => sum + t.transaction_value, 0)

    const avgPsf = totalArea > 0
      ? Math.round(totalValue / totalArea)
      : Math.round(txns.reduce((sum, t) => sum + (t.psf ?? 0), 0) / txns.length)

    // 3. Update project current_psf
    await supabase
      .from("projects")
      .update({ current_psf: avgPsf, updated_at: new Date().toISOString() })
      .eq("id", projectId)

    // 4. Upsert psf_history row for today
    await supabase
      .from("psf_history")
      .upsert({
        project_id:    projectId,
        recorded_date: todayStr,
        psf:           avgPsf,
        source:        "dld",
        sample_size:   txns.length,
      }, { onConflict: "project_id,recorded_date,source" })

    updated++
  }

  console.log(`PSF updated for ${updated} projects`)

  return new Response(JSON.stringify({ updated }), {
    headers: { "Content-Type": "application/json" },
  })
})
