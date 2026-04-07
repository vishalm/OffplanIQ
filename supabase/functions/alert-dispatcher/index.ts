// supabase/functions/alert-dispatcher/index.ts
//
// Supabase Edge Function — Alert Dispatcher
// Schedule: every hour via pg_cron
// Deploy: supabase functions deploy alert-dispatcher
//
// What it does:
//   1. For each user with a watchlist, checks if any watched projects
//      have triggered alert conditions since last check
//   2. Creates alert log entries
//   3. Sends email alerts via Resend (if user has email_alerts = true)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!

type AlertType = 'score_drop' | 'score_rise' | 'handover_delay' | 'psf_spike' | 'psf_drop' | 'sellthrough_stall'

interface AlertCandidate {
  user_id: string
  project_id: string
  project_name: string
  alert_type: AlertType
  title: string
  body: string
  metadata: Record<string, unknown>
}

serve(async (_req) => {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

  // 1. Get all watchlists with user preferences
  const { data: watchlists } = await supabase
    .from("watchlist")
    .select(`
      user_id,
      project_id,
      project:project_id(id, name, score, current_psf, handover_status, handover_delay_days, sellthrough_pct, updated_at),
      user:user_id(
        alert_preferences(score_drop_threshold, score_rise_threshold, psf_change_threshold, notify_handover_delays, email_alerts)
      )
    `)

  if (!watchlists?.length) {
    return new Response(JSON.stringify({ alerts_fired: 0 }))
  }

  // 2. Get yesterday's score snapshots for comparison
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split("T")[0]

  const { data: snapshots } = await supabase
    .from("score_snapshots")
    .select("project_id, score")
    .eq("score_date", yesterdayStr)

  const prevScores = new Map(snapshots?.map(s => [s.project_id, s.score]) ?? [])

  const candidates: AlertCandidate[] = []

  for (const entry of watchlists) {
    const project = entry.project as any
    const prefs = (entry.user as any)?.alert_preferences?.[0]
    if (!project || !prefs) continue

    const prevScore = prevScores.get(project.id)
    const scoreDrop = prefs.score_drop_threshold ?? 5
    const scoreRise = prefs.score_rise_threshold ?? 5

    // Score drop alert
    if (prevScore !== undefined && prevScore - project.score >= scoreDrop) {
      candidates.push({
        user_id: entry.user_id,
        project_id: project.id,
        project_name: project.name,
        alert_type: 'score_drop',
        title: `${project.name} score dropped ${prevScore - project.score} points`,
        body: `Score moved from ${prevScore} → ${project.score}. Check sell-through and handover status.`,
        metadata: { old_score: prevScore, new_score: project.score },
      })
    }

    // Score rise alert
    if (prevScore !== undefined && project.score - prevScore >= scoreRise) {
      candidates.push({
        user_id: entry.user_id,
        project_id: project.id,
        project_name: project.name,
        alert_type: 'score_rise',
        title: `${project.name} score rose ${project.score - prevScore} points`,
        body: `Score improved from ${prevScore} → ${project.score}.`,
        metadata: { old_score: prevScore, new_score: project.score },
      })
    }

    // Handover delay alert
    if (prefs.notify_handover_delays && project.handover_status === 'delayed' && project.handover_delay_days > 0) {
      // Only alert once per delay milestone (every 30 days of delay)
      const milestone = Math.floor(project.handover_delay_days / 30) * 30
      if (milestone > 0) {
        const { data: existing } = await supabase
          .from("alerts_log")
          .select("id")
          .eq("user_id", entry.user_id)
          .eq("project_id", project.id)
          .eq("alert_type", 'handover_delay')
          .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1)

        if (!existing?.length) {
          candidates.push({
            user_id: entry.user_id,
            project_id: project.id,
            project_name: project.name,
            alert_type: 'handover_delay',
            title: `${project.name} is ${project.handover_delay_days} days delayed`,
            body: `RERA records show handover pushed back. Review your IRR assumptions.`,
            metadata: { delay_days: project.handover_delay_days },
          })
        }
      }
    }
  }

  if (!candidates.length) {
    return new Response(JSON.stringify({ alerts_fired: 0 }))
  }

  // 3. Insert alert log entries
  const { error: insertErr } = await supabase
    .from("alerts_log")
    .insert(candidates.map(c => ({
      user_id: c.user_id,
      project_id: c.project_id,
      alert_type: c.alert_type,
      title: c.title,
      body: c.body,
      metadata: c.metadata,
    })))

  if (insertErr) console.error("Alert insert error:", insertErr)

  // 4. Send email alerts (batched per user)
  const byUser = new Map<string, AlertCandidate[]>()
  for (const c of candidates) {
    if (!byUser.has(c.user_id)) byUser.set(c.user_id, [])
    byUser.get(c.user_id)!.push(c)
  }

  // Fetch emails for users who have email_alerts = true
  const userIds = [...byUser.keys()]
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, email")
    .in("id", userIds)

  const emailMap = new Map(profiles?.map(p => [p.id, p.email]) ?? [])

  let emailsSent = 0
  for (const [userId, alerts] of byUser) {
    const email = emailMap.get(userId)
    if (!email) continue

    // Check email_alerts pref
    const { data: prefs } = await supabase
      .from("alert_preferences")
      .select("email_alerts")
      .eq("user_id", userId)
      .single()

    if (!prefs?.email_alerts) continue

    const emailBody = alerts
      .map(a => `<p><strong>${a.title}</strong><br>${a.body}</p>`)
      .join("<hr>")

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "OffplanIQ Alerts <alerts@offplaniq.com>",
        to: email,
        subject: `${alerts.length} alert${alerts.length > 1 ? "s" : ""} from your watchlist`,
        html: `<div style="font-family:sans-serif;max-width:600px">${emailBody}<hr><p style="color:#888;font-size:12px">Manage alerts at offplaniq.com/settings</p></div>`,
      }),
    })
    emailsSent++
  }

  return new Response(
    JSON.stringify({ alerts_fired: candidates.length, emails_sent: emailsSent }),
    { headers: { "Content-Type": "application/json" } }
  )
})
