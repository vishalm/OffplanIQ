// supabase/functions/launch-radar/index.ts
//
// Daily-cron edge fn. Walks `project_updates` for fresh `change_type='launch'`
// rows that we haven't notified yet, then writes one row into `alerts_log`
// per (user × project) where the user has opted into new-launch alerts.
//
// alert_dispatcher (existing) handles email delivery.
//
// Notification policy:
//   * Users on `alert_preferences.notify_new_launches = true` receive a
//     'new_launch' alert for every launch in the last 24h.
//   * If the project lands in any user's `watchlist` we always notify them,
//     regardless of pref (watchlist is a hard signal of intent).
//   * Each (user_id, project_id, change_type='launch') is dedup'd via existing
//     alerts_log rows.
//
// Deploy: supabase functions deploy launch-radar
// Body (POST, optional):
//   { "max_age_hours": 24 }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

type Body = { max_age_hours?: number }

type Update = {
  id: string
  project_id: string
  detected_at: string
  notified_at: string | null
}

type Project = {
  id: string
  name: string
  slug: string
  area: string | null
  city: string | null
  developer: { name: string | null } | null
}

serve(async (req) => {
  const body: Body = await req.json().catch(() => ({}))
  const maxAgeHours = Math.max(1, Math.min(body.max_age_hours ?? 24, 168))
  const cutoff = new Date(Date.now() - maxAgeHours * 3600 * 1000).toISOString()

  // 1. Fresh, unnotified launch rows.
  const { data: updates, error: uErr } = await supabase
    .from("project_updates")
    .select("id, project_id, detected_at, notified_at")
    .eq("change_type", "launch")
    .gte("detected_at", cutoff)
    .is("notified_at", null)
    .order("detected_at", { ascending: false })
    .limit(200)

  if (uErr) {
    return new Response(JSON.stringify({ error: uErr.message }), { status: 500 })
  }
  if (!updates || updates.length === 0) {
    return new Response(JSON.stringify({ launches: 0, alerts: 0 }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  const launches = updates as Update[]
  const projectIds = [...new Set(launches.map((u) => u.project_id))]

  // 2. Project + developer denormalised so the alert message is human-readable.
  const { data: projectsRaw } = await supabase
    .from("projects")
    .select("id, name, slug, area, city, developer:developer_id(name)")
    .in("id", projectIds)

  const projectById = new Map<string, Project>(
    (projectsRaw ?? []).map((p) => [p.id, p as unknown as Project]),
  )

  // 3. Recipients: union of (a) opted-in users and (b) watchers of the project.
  const { data: optedIn } = await supabase
    .from("alert_preferences")
    .select("user_id")
    .eq("notify_new_launches", true)

  const { data: watchers } = await supabase
    .from("watchlist")
    .select("user_id, project_id")
    .in("project_id", projectIds)

  const optedInIds = new Set((optedIn ?? []).map((r: { user_id: string }) => r.user_id))
  const watcherByProject = new Map<string, Set<string>>()
  for (const w of (watchers ?? []) as Array<{ user_id: string; project_id: string }>) {
    if (!watcherByProject.has(w.project_id)) watcherByProject.set(w.project_id, new Set())
    watcherByProject.get(w.project_id)!.add(w.user_id)
  }

  // 4. Compose alert payloads.
  const alertRows: Array<{
    user_id: string
    project_id: string
    alert_type: "new_launch"
    title: string
    body: string
    metadata: Record<string, unknown>
  }> = []

  for (const u of launches) {
    const proj = projectById.get(u.project_id)
    if (!proj) continue
    const recipients = new Set<string>([
      ...optedInIds,
      ...(watcherByProject.get(proj.id) ?? []),
    ])
    if (recipients.size === 0) continue

    const developerName = proj.developer?.name ?? "Unknown"
    const where = [proj.area, proj.city].filter(Boolean).join(", ")
    const title = `New launch — ${proj.name}`
    const bodyText = `${developerName} just launched ${proj.name}${where ? ` in ${where}` : ""}.`

    for (const uid of recipients) {
      alertRows.push({
        user_id: uid,
        project_id: proj.id,
        alert_type: "new_launch",
        title,
        body: bodyText,
        metadata: { update_id: u.id, slug: proj.slug, detected_at: u.detected_at },
      })
    }
  }

  // 5. Insert alerts (dedup is handled by alert_dispatcher's per-project per-user
  //    cooldown). Stamp `notified_at` on the source update rows so we don't
  //    re-fire on the next cron tick.
  let alertsInserted = 0
  if (alertRows.length > 0) {
    const { error: aErr, data: ins } = await supabase
      .from("alerts_log")
      .insert(alertRows)
      .select("id")
    if (aErr) {
      return new Response(JSON.stringify({ error: aErr.message }), { status: 500 })
    }
    alertsInserted = ins?.length ?? 0
  }

  await supabase
    .from("project_updates")
    .update({ notified_at: new Date().toISOString() })
    .in("id", launches.map((u) => u.id))

  console.log(`launch-radar: ${launches.length} launches → ${alertsInserted} alerts`)

  return new Response(
    JSON.stringify({
      launches: launches.length,
      alerts: alertsInserted,
      window_hours: maxAgeHours,
    }),
    { headers: { "Content-Type": "application/json" } },
  )
})
