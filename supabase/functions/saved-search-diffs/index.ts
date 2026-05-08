// supabase/functions/saved-search-diffs/index.ts
//
// Daily-cron edge fn. For each saved search with `notify_on_diff = true`:
//   1. Re-run the filters against `projects` using the same shape as the
//      `search_projects` chat tool.
//   2. Diff vs `last_run_match_ids` to find newly-matching and lost projects.
//   3. If anything changed, write a 'saved_search_diff' alert to alerts_log
//      and update the snapshot.
//
// Deploy: supabase functions deploy saved-search-diffs

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

type Filters = {
  city?: string
  area?: string
  min_price_aed?: number
  max_price_aed?: number
  unit_types?: string[]
  handover_before?: string
  handover_after?: string
  min_score?: number
  developer_slug?: string
}

type SavedSearch = {
  id: string
  user_id: string
  name: string
  filters: Filters
  last_run_match_ids: string[] | null
}


async function runFilters(filters: Filters): Promise<string[]> {
  let q = supabase
    .from("projects")
    .select("id")
    .in("status", ["active", "pre_launch"])
  if (filters.city)            q = q.ilike("city", `${filters.city}%`)
  if (filters.area)            q = q.ilike("area", `%${filters.area}%`)
  if (filters.min_price_aed != null) q = q.gte("min_price", Math.floor(filters.min_price_aed))
  if (filters.max_price_aed != null) q = q.lte("min_price", Math.floor(filters.max_price_aed))
  if (filters.unit_types && filters.unit_types.length > 0) q = q.overlaps("unit_types", filters.unit_types)
  if (filters.handover_before) q = q.lte("current_handover_date", filters.handover_before)
  if (filters.handover_after)  q = q.gte("current_handover_date", filters.handover_after)
  if (filters.min_score != null) q = q.gte("score", Math.floor(filters.min_score))
  if (filters.developer_slug)  q = q.eq("developer.slug", filters.developer_slug)

  const { data, error } = await q.limit(500)
  if (error) {
    console.error("runFilters error:", error.message)
    return []
  }
  return (data ?? []).map((r: { id: string }) => r.id)
}


function diffSets(prev: string[], next: string[]): { added: string[]; removed: string[] } {
  const prevSet = new Set(prev)
  const nextSet = new Set(next)
  const added = next.filter((id) => !prevSet.has(id))
  const removed = prev.filter((id) => !nextSet.has(id))
  return { added, removed }
}


async function projectNamesByIds(ids: string[]): Promise<Map<string, { name: string; slug: string }>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .from("projects")
    .select("id, name, slug")
    .in("id", ids)
  return new Map((data ?? []).map((p: { id: string; name: string; slug: string }) => [p.id, { name: p.name, slug: p.slug }]))
}


serve(async () => {
  const { data: searches, error } = await supabase
    .from("saved_searches")
    .select("id, user_id, name, filters, last_run_match_ids")
    .eq("notify_on_diff", true)
    .limit(500)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!searches || searches.length === 0) {
    return new Response(JSON.stringify({ checked: 0, alerts: 0 }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  let totalAlerts = 0
  for (const s of searches as SavedSearch[]) {
    const matches = await runFilters(s.filters)
    const prev = s.last_run_match_ids ?? []
    const { added, removed } = diffSets(prev, matches)

    // Always write the snapshot so future runs are accurate, regardless of
    // whether anything changed.
    await supabase
      .from("saved_searches")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_match_count: matches.length,
        last_run_match_ids: matches,
      })
      .eq("id", s.id)

    if (added.length === 0 && removed.length === 0) continue

    // Compose the alert body.
    const lookupIds = [...added, ...removed].slice(0, 20)
    const names = await projectNamesByIds(lookupIds)
    const addedNames = added.slice(0, 5).map((id) => names.get(id)?.name).filter(Boolean)
    const removedNames = removed.slice(0, 5).map((id) => names.get(id)?.name).filter(Boolean)

    const parts: string[] = []
    if (added.length > 0)   parts.push(`${added.length} new (${addedNames.join(", ") || "—"}${added.length > addedNames.length ? "…" : ""})`)
    if (removed.length > 0) parts.push(`${removed.length} dropped off (${removedNames.join(", ") || "—"}${removed.length > removedNames.length ? "…" : ""})`)

    const { error: alertErr } = await supabase
      .from("alerts_log")
      .insert({
        user_id: s.user_id,
        alert_type: "saved_search_diff",
        title: `Updates for "${s.name}"`,
        body: parts.join(" · "),
        metadata: {
          search_id: s.id,
          added_ids: added,
          removed_ids: removed,
          total_matches: matches.length,
        },
      })
    if (alertErr) {
      console.error(`alerts_log insert for ${s.id}:`, alertErr.message)
      continue
    }
    totalAlerts++
  }

  console.log(`saved-search-diffs: checked=${searches.length} alerts=${totalAlerts}`)
  return new Response(
    JSON.stringify({ checked: searches.length, alerts: totalAlerts }),
    { headers: { "Content-Type": "application/json" } },
  )
})
