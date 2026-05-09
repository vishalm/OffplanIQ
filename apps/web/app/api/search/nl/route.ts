// apps/web/app/api/search/nl/route.ts
//
// Natural-language → faceted-search URL params.
//
// POST { query } → { params: Record<string, string> }
//
// The LLM emits a strict JSON object matching the /search page's filter
// vocabulary (city, area, developer, status, unit_type, price, psf,
// minScore, q). We validate the output against the same shape the page
// already understands, then return a Record<string, string> the client can
// turn into URLSearchParams.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { azureChat, azureConfigured } from '@/lib/azure-openai'
import { LIMITS, clientIdentifier, consumeRateLimit, rateLimitResponse, validateBody } from '@/lib/api-guard'
import { startRequest, logFailure } from '@/lib/logger'

const Body = z.object({
  query: z.string().min(2).max(500),
})

const FilterShape = z.object({
  city:      z.string().optional(),
  area:      z.string().optional(),
  developer: z.string().optional(),
  status:    z.enum(['pre_launch','under_construction','near_handover','handed_over','delayed']).optional(),
  unit_type: z.enum(['studio','1br','2br','3br','4br','5br','penthouse','villa','townhouse','duplex']).optional(),
  price:     z.string().regex(/^\d+-\d+$/).optional(),
  psf:       z.string().regex(/^\d+-\d+$/).optional(),
  minScore:  z.enum(['0','55','70','85']).optional(),
  q:         z.string().optional(),
})
type Filters = z.infer<typeof FilterShape>

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM = `You map a UAE off-plan property search query to STRICT JSON filters.

ALLOWED KEYS (omit any field you don't need):
- city: emirate, exact case (Dubai | Abu Dhabi | Sharjah | Ajman | Ras Al Khaimah | Fujairah | Umm Al Quwain).
- area: sub-community substring (e.g. "Business Bay", "JVC", "Beachfront"). Match the user's wording.
- developer: developer name as commonly written ("Emaar Properties", "Damac", "Sobha Realty").
- status: handover lifecycle: pre_launch | under_construction | near_handover | handed_over | delayed.
- unit_type: studio | 1br | 2br | 3br | 4br | 5br | penthouse | villa | townhouse | duplex.
- price: AED price range as "<lo>-<hi>" integers, no separators (e.g. "1000000-2500000").
- psf:   AED-per-sqft range as "<lo>-<hi>" integers (e.g. "1500-3000").
- minScore: floor of OffplanIQ score band — "0" (under 55), "55", "70", "85" (only these literals).
- q: free-text fallback for things that don't fit the keys (developer brand, project name fragments).

RULES:
- Only emit keys whose value you can derive with confidence.
- "top developer" / "top-quartile" → minScore "70".
- "best" / "highest scored" → minScore "85".
- "under X" / "below X" → set price upper bound; use lo=0.
- "over X" → set lower bound; use a high hi like 999999999.
- "1 bedroom" / "one bedroom" / "1BR" → unit_type "1br".
- "Dubai" / "Abu Dhabi" → city.
- Be FORGIVING: if you can't infer anything structured, return { "q": "<original query>" }.

Return ONLY a JSON object. No prose.`

export async function POST(req: NextRequest) {
  const log = startRequest('api/search/nl', req)
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { log.end(401); return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const rl = consumeRateLimit(LIMITS.savedSearches, clientIdentifier(req, user.id))
  if (!rl.ok) { log.end(429, { user_id: user.id }); return rateLimitResponse({ limit: LIMITS.savedSearches.limit, remaining: rl.remaining, resetAt: rl.resetAt }) }

  if (!azureConfigured()) {
    log.end(503, { user_id: user.id })
    // Graceful fallback: send the raw query as q.
    const body = await req.json().catch(() => ({}))
    return NextResponse.json({ params: { q: String(body.query ?? '').slice(0, 200) } })
  }

  const v = await validateBody(req, Body)
  if (!v.ok) { log.end(400, { user_id: user.id }); return v.response }

  let raw = ''
  try {
    raw = await azureChat([
      { role: 'system', content: SYSTEM },
      { role: 'user',   content: v.data.query },
    ], { response_format: 'json_object', max_completion_tokens: 300 })
  } catch (err: any) {
    logFailure('search.nl_translate_failed', err, { user_id: user.id })
    log.end(200, { user_id: user.id, fallback: true })
    return NextResponse.json({ params: { q: v.data.query.slice(0, 200) } })
  }

  let parsed: Filters | null = null
  try {
    const json = JSON.parse(raw)
    const result = FilterShape.safeParse(json)
    if (result.success) parsed = result.data
  } catch { /* fall through */ }

  const params: Record<string, string> = {}
  if (parsed) {
    for (const [k, val] of Object.entries(parsed)) {
      if (val == null || val === '') continue
      params[k] = String(val)
    }
  }
  if (Object.keys(params).length === 0) {
    // Last-resort: stuff the original phrase into q so the user gets *something*.
    params.q = v.data.query.slice(0, 200)
  }
  log.end(200, { user_id: user.id, keys: Object.keys(params) })
  return NextResponse.json({ params })
}
