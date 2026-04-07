// supabase/functions/digest-sender/index.ts
//
// Supabase Edge Function — Sunday Digest Sender
// Schedule: every Sunday at 05:00 UTC (09:00 UAE / GST)
// Deploy: supabase functions deploy digest-sender
//
// pg_cron setup (run once in SQL editor):
//   select cron.schedule(
//     'weekly-digest',
//     '0 5 * * 0',
//     $$select net.http_post(
//       url:='https://[project-ref].supabase.co/functions/v1/digest-sender',
//       headers:='{"Authorization":"Bearer [service-role-key]"}'::jsonb
//     )$$
//   );

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!

serve(async (_req) => {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStr = weekAgo.toISOString().split("T")[0]

  const today = new Date()
  const weekOf = today.toLocaleDateString("en-AE", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai"
  })

  // 1. Get all users with weekly_digest = true + paid tier
  const { data: users } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, subscription_tier")
    .in("subscription_tier", ["investor", "agency"])

  if (!users?.length) {
    return new Response(JSON.stringify({ sent: 0 }))
  }

  // 2. Market summary — overall Dubai PSF this week
  const { data: marketRows } = await supabase
    .from("psf_history")
    .select("psf")
    .gte("recorded_date", weekAgoStr)

  const marketAvgPsf = marketRows?.length
    ? Math.round(marketRows.reduce((s, r) => s + r.psf, 0) / marketRows.length)
    : 2180

  // 3. New launches this week
  const { data: newProjects } = await supabase
    .from("projects")
    .select("id, name, slug, area, score, current_psf")
    .gte("created_at", weekAgo.toISOString())
    .order("score", { ascending: false })
    .limit(3)

  // 4. Send per user
  let sent = 0

  for (const user of users) {
    const { data: prefRow } = await supabase
      .from("alert_preferences")
      .select("weekly_digest")
      .eq("user_id", user.id)
      .single()

    if (!prefRow?.weekly_digest) continue

    // User's watchlist moves this week
    const { data: watchlist } = await supabase
      .from("watchlist")
      .select("project:project_id(id, name, slug, area, score, current_psf, sellthrough_pct)")
      .eq("user_id", user.id)

    // User's alerts this week
    const { data: alerts } = await supabase
      .from("alerts_log")
      .select("title, body, alert_type")
      .eq("user_id", user.id)
      .gte("sent_at", weekAgo.toISOString())
      .order("sent_at", { ascending: false })
      .limit(5)

    const watchlistSection = (watchlist ?? [])
      .map(w => {
        const p = w.project as any
        return `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;">${p.name}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">${p.area}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:500;color:${p.score >= 75 ? '#16a34a' : p.score >= 55 ? '#d97706' : '#dc2626'};">${p.score}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">${p.sellthrough_pct}% sold</td>
        </tr>`
      }).join("")

    const alertsSection = (alerts ?? [])
      .map(a => `<p style="margin:0 0 10px;font-size:13px;color:#374151;"><strong>${a.title}</strong><br>${a.body ?? ""}</p>`)
      .join("")

    const newLaunchSection = (newProjects ?? [])
      .map(p => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;">${p.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">${p.area}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:500;color:#111827;">AED ${(p.current_psf ?? 0).toLocaleString()}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#16a34a;">Score ${p.score}</td>
      </tr>`
      ).join("")

    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 16px;">
  <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;text-transform:uppercase;letter-spacing:.06em;">OffplanIQ · Week of ${weekOf}</p>
  <h1 style="font-size:22px;font-weight:500;color:#111827;margin:0 0 8px;">Your weekly property pulse</h1>
  <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">Hi ${user.full_name?.split(" ")[0] || "there"} — here's what moved this week.</p>

  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
    <p style="font-size:11px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px;">Dubai market</p>
    <p style="font-size:20px;font-weight:500;color:#111827;margin:0 0 2px;">AED ${marketAvgPsf.toLocaleString()} avg PSF</p>
  </div>

  ${alerts?.length ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
    <p style="font-size:11px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px;">Your alerts this week</p>
    ${alertsSection}
  </div>` : ""}

  ${watchlist?.length ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
    <p style="font-size:11px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px;">Your watchlist</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left;font-size:11px;color:#9ca3af;font-weight:500;padding-bottom:8px;">Project</th>
        <th style="text-align:left;font-size:11px;color:#9ca3af;font-weight:500;padding-bottom:8px;">Area</th>
        <th style="text-align:left;font-size:11px;color:#9ca3af;font-weight:500;padding-bottom:8px;">Score</th>
        <th style="text-align:left;font-size:11px;color:#9ca3af;font-weight:500;padding-bottom:8px;">Sales</th>
      </tr></thead>
      <tbody>${watchlistSection}</tbody>
    </table>
    <a href="https://offplaniq.com/alerts" style="display:inline-block;margin-top:12px;font-size:13px;color:#111827;font-weight:500;">View full watchlist →</a>
  </div>` : ""}

  ${newProjects?.length ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
    <p style="font-size:11px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px;">New launches this week</p>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>${newLaunchSection}</tbody>
    </table>
  </div>` : ""}

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
    OffplanIQ · Dubai, UAE ·
    <a href="https://offplaniq.com/settings/billing" style="color:#9ca3af;">Manage subscription</a>
  </p>
</div>
</body></html>`

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    "OffplanIQ <digest@offplaniq.com>",
        to:      user.email,
        subject: `Dubai off-plan pulse · ${weekOf}`,
        html,
      }),
    })

    if (res.ok) sent++
    else console.error(`Email failed for ${user.email}:`, await res.text())
  }

  console.log(`Digest sent to ${sent}/${users.length} users`)
  return new Response(JSON.stringify({ sent, total: users.length }), {
    headers: { "Content-Type": "application/json" },
  })
})
