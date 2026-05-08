// supabase/functions/developer-recrawl-trigger/index.ts
//
// Picks the N stalest developers (by `developers.last_crawled_at`) and marks
// them as "pending" so the next scraper run picks them up. The actual crawl
// runs in `apps/scraper/scrapers/developer_intelligence.py` — Edge Functions
// can't drive Playwright. This function is a *signal* + *bookkeeper*, not the
// crawler itself.
//
// Wire-up (recommended):
//   1. Cron this function daily (Supabase scheduled functions or external cron).
//   2. Have the Railway-hosted scraper poll `developers` filtered by
//      `crawl_status = 'pending'` and crawl those each cycle.
//
// Deploy: supabase functions deploy developer-recrawl-trigger
//
// Body (POST, all optional):
//   { "max_age_days": 30, "batch_size": 5, "force": false }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

type Body = {
  max_age_days?: number   // re-crawl developers whose last_crawled_at is older than this
  batch_size?:   number   // how many to mark "pending" per call
  force?:        boolean  // ignore last_crawled_at; just take the oldest N
}

serve(async (req) => {
  const body: Body = await req.json().catch(() => ({}))
  const maxAgeDays = body.max_age_days ?? 30
  const batchSize  = Math.min(Math.max(body.batch_size ?? 5, 1), 50)
  const force      = body.force === true

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - maxAgeDays)

  // Pick stale or never-crawled developers, ordered oldest-first.
  let query = supabase
    .from("developers")
    .select("id, name, slug, last_crawled_at")
    .neq("crawl_status", "crawling")          // don't double-queue an in-flight one
    .order("last_crawled_at", { ascending: true, nullsFirst: true })
    .limit(batchSize)

  if (!force) {
    query = query.or(`last_crawled_at.is.null,last_crawled_at.lt.${cutoff.toISOString()}`)
  }

  const { data: candidates, error } = await query
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!candidates || candidates.length === 0) {
    return new Response(JSON.stringify({ queued: 0, message: "No stale developers" }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  const ids = candidates.map((c) => c.id)
  const { error: updErr } = await supabase
    .from("developers")
    .update({ crawl_status: "pending", crawl_error: null })
    .in("id", ids)

  if (updErr) {
    return new Response(JSON.stringify({ error: updErr.message }), { status: 500 })
  }

  console.log(`developer-recrawl-trigger: queued ${ids.length} developers`)

  return new Response(
    JSON.stringify({
      queued: ids.length,
      developers: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        last_crawled_at: c.last_crawled_at,
      })),
    }),
    { headers: { "Content-Type": "application/json" } },
  )
})
