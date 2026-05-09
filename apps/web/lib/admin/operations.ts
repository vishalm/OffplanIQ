// apps/web/lib/admin/operations.ts
//
// Single source of truth for every operation the admin console + AI copilot
// can fire. Each entry declares:
//
//   - id          — stable identifier the API + Copilot reference
//   - label       — what the human sees on the button / chip
//   - category    — "Recompute" | "Scrape" | "Notify" | "Maintenance"
//   - kind        — "edge" (Supabase Edge Function), "scraper" (queued for
//                   the Python worker on Railway / local), "sql" (direct DB
//                   call), or "llm" (server-side AI op).
//   - danger      — true when the op writes broadly or notifies users; the
//                   UI shows a confirm modal and the Copilot is told to
//                   double-check before invoking.
//   - description — one-line prose for the LLM and human alike.
//   - run         — async executor. Returns a small JSON-serialisable result.
//
// The Copilot exposes every op with `enabled: true` as a function-call tool.
// The admin grid renders them grouped by category. Add a new op here once;
// it lights up everywhere.

import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'
import { looseSupabase } from '@/lib/supabase/loose'

export type OperationCategory = 'Recompute' | 'Scrape' | 'Notify' | 'Maintenance'
export type OperationKind     = 'edge' | 'scraper' | 'sql' | 'llm'

export interface OperationDefinition {
  id:          string
  label:       string
  category:    OperationCategory
  kind:        OperationKind
  description: string
  danger?:     boolean
  enabled:     boolean
  run:         (args: Record<string, unknown>) => Promise<unknown>
}


// ─── Helper: fire a Supabase Edge Function ──────────────────
async function invokeEdge(name: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env not configured.')
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Edge fn ${name} failed (${res.status}): ${text.slice(0, 300)}`)
  try { return JSON.parse(text) } catch { return { raw: text.slice(0, 500) } }
}


// ─── Helper: queue a scraper job for the Python worker ─────
async function queueScrape(scraper: string, args: Record<string, unknown> = {}): Promise<unknown> {
  // We write to a `scrape_jobs` table; the Railway worker (or local
  // `python -m apps.scraper.main --poll`) drains it.
  // If the table doesn't exist yet (migration pending), we degrade gracefully
  // and return a clear message so the admin sees how to enable async ops.
  const sb = looseSupabase(createServiceClient())
  try {
    const { data, error } = await sb
      .from('scrape_jobs')
      .insert([{ scraper, args, status: 'pending' }])
      .select('id, scraper, status, created_at')
      .single()
    if (error) throw error
    return { queued: true, job: data, message: `${scraper} queued — the scraper worker will pick it up on its next poll.` }
  } catch (err: any) {
    return {
      queued:   false,
      message:  `scrape_jobs table not available yet (${err?.message ?? 'unknown'}). Apply migration 20260509000001_scrape_jobs.sql, then retry — until then, run "python -m apps.scraper.scrapers.${scraper}" manually.`,
    }
  }
}


// ─── Helper: snapshot platform stats ────────────────────────
async function platformStats(): Promise<unknown> {
  const sb = looseSupabase(createServiceClient())
  const [projects, devs, updates, sales, users] = await Promise.all([
    sb.from('projects').select('id', { count: 'exact', head: true }),
    sb.from('developers').select('id', { count: 'exact', head: true }),
    sb.from('project_updates').select('id', { count: 'exact', head: true }),
    sb.from('dld_transactions').select('id', { count: 'exact', head: true }),
    sb.from('user_profiles').select('id', { count: 'exact', head: true }),
  ])
  const lastUpdate = await sb
    .from('project_updates')
    .select('detected_at, change_type')
    .order('detected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return {
    projects:  projects.count ?? 0,
    developers: devs.count ?? 0,
    project_updates: updates.count ?? 0,
    dld_transactions: sales.count ?? 0,
    users:     users.count ?? 0,
    last_update_at:    lastUpdate.data?.detected_at ?? null,
    last_update_type:  lastUpdate.data?.change_type ?? null,
  }
}


// ─── Operation registry ─────────────────────────────────────
export const OPERATIONS: OperationDefinition[] = [
  // ── Recompute ──────────────────────────────────────────
  {
    id:          'recalc_scores',
    label:       'Recalculate project scores',
    category:    'Recompute',
    kind:        'edge',
    description: 'Re-run the OffplanIQ scoring algorithm across every active project. Updates score + score_snapshots. Safe to run anytime; pg_cron does this every 6h automatically.',
    enabled:     true,
    run:         () => invokeEdge('score-recalculator'),
  },
  {
    id:          'refresh_psf',
    label:       'Refresh PSF series',
    category:    'Recompute',
    kind:        'edge',
    description: 'Recompute current_psf for each project from the latest psf_history rows (DLD-derived + brochure-derived). Run after a fresh DLD ingest.',
    enabled:     true,
    run:         () => invokeEdge('psf-updater'),
  },
  {
    id:          'launch_radar',
    label:       'Detect new launches',
    category:    'Recompute',
    kind:        'edge',
    description: 'Scan recently-inserted projects and emit "launch" rows in project_updates. Powers the "What just moved" strip on the landing page.',
    enabled:     true,
    run:         () => invokeEdge('launch-radar'),
  },
  {
    id:          'saved_search_diffs',
    label:       'Compute saved-search deltas',
    category:    'Recompute',
    kind:        'edge',
    description: 'For each user-saved search, diff the current matching set against the last snapshot. Feeds the alerts feed.',
    enabled:     true,
    run:         () => invokeEdge('saved-search-diffs'),
  },

  // ── Scrape ─────────────────────────────────────────────
  {
    id:          'scrape_expo_city',
    label:       'Scrape Expo City Dubai',
    category:    'Scrape',
    kind:        'scraper',
    description: 'Pull the 8 projects in expocitydubai.com/expo-living and upsert them. Idempotent — safe to re-run.',
    enabled:     true,
    run:         () => queueScrape('expo_city'),
  },
  {
    id:          'scrape_dld',
    label:       'Pull DLD transactions (last 7 days)',
    category:    'Scrape',
    kind:        'scraper',
    description: 'Hit the DLD open-data gateway for the last week of transactions and upsert into dld_transactions. Run before "Refresh PSF" to update prices.',
    enabled:     true,
    run:         () => queueScrape('dld', { days: 7 }),
  },
  {
    id:          'scrape_property_finder',
    label:       'Refresh Property Finder listings',
    category:    'Scrape',
    kind:        'scraper',
    description: 'Drive Property Finder /new-projects/lp/<city> via Playwright and upsert listings. Skips when PerimeterX captcha is present.',
    enabled:     true,
    run:         () => queueScrape('pf_scraper'),
  },
  {
    id:          'recrawl_developers',
    label:       'Recrawl pending developers',
    category:    'Scrape',
    kind:        'edge',
    description: "Trigger the developer-recrawl pipeline for any developer flagged crawl_status='pending'. Refreshes brochures + embeddings.",
    enabled:     true,
    run:         () => invokeEdge('developer-recrawl-trigger'),
  },

  // ── Notify ─────────────────────────────────────────────
  {
    id:          'send_alerts',
    label:       'Dispatch pending alerts',
    category:    'Notify',
    kind:        'edge',
    danger:      true,
    description: 'DESTRUCTIVE — this sends emails to users. Fires the alert-dispatcher edge function which mails any unread alerts_log rows. Confirm before running.',
    enabled:     true,
    run:         () => invokeEdge('alert-dispatcher'),
  },
  {
    id:          'send_digest',
    label:       'Send weekly digest',
    category:    'Notify',
    kind:        'edge',
    danger:      true,
    description: 'DESTRUCTIVE — emails all subscribed users the weekly market digest. Normally runs Monday 09:00 UAE; only run manually for a re-send.',
    enabled:     true,
    run:         () => invokeEdge('digest-sender'),
  },

  // ── Maintenance ────────────────────────────────────────
  {
    id:          'platform_stats',
    label:       'Snapshot platform stats',
    category:    'Maintenance',
    kind:        'sql',
    description: 'Report row counts for projects, developers, updates, DLD transactions, and users plus the timestamp of the most recent project_update. Read-only.',
    enabled:     true,
    run:         () => platformStats(),
  },
]


export function operationById(id: string): OperationDefinition | undefined {
  return OPERATIONS.find(o => o.id === id)
}

/** A pruned view safe to send to the browser / Copilot. Drops the `run`
 *  function, keeps everything the UI needs to render. */
export interface OperationView {
  id:          string
  label:       string
  category:    OperationCategory
  kind:        OperationKind
  description: string
  danger:      boolean
  enabled:     boolean
}

export function operationViews(): OperationView[] {
  return OPERATIONS.map(o => ({
    id:          o.id,
    label:       o.label,
    category:    o.category,
    kind:        o.kind,
    description: o.description,
    danger:      Boolean(o.danger),
    enabled:     o.enabled,
  }))
}
