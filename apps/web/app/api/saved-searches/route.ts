// apps/web/app/api/saved-searches/route.ts
//
// CRUD for the current user's saved searches. RLS in Postgres enforces
// ownership; we also auth-gate the route so anon users get 401 fast.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { LIMITS, clientIdentifier, consumeRateLimit, rateLimitResponse, validateBody } from '@/lib/api-guard'
import { startRequest, logFailure } from '@/lib/logger'
import { looseSupabase } from '@/lib/supabase/loose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Zod replaces the old hand-rolled `sanitizeFilters` — same shape, with the
// max-length / range bounds enforced declaratively.
const FiltersSchema = z.object({
  city:            z.string().max(60).optional(),
  area:            z.string().max(80).optional(),
  min_price_aed:   z.number().int().nonnegative().optional(),
  max_price_aed:   z.number().int().nonnegative().optional(),
  unit_types:      z.array(z.string().max(20)).max(10).optional(),
  handover_before: z.string().max(10).optional(),
  handover_after:  z.string().max(10).optional(),
  min_score:       z.number().int().min(0).max(100).optional(),
  developer_slug:  z.string().max(80).optional(),
}).strict()

const CreateSavedSearchSchema = z.object({
  name:           z.string().min(1).max(80),
  filters:        FiltersSchema,
  notify_on_diff: z.boolean().optional(),
})


export async function GET(req: NextRequest) {
  const log = startRequest('api/saved-searches', req)
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { log.end(401); return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const rl = consumeRateLimit(LIMITS.savedSearches, clientIdentifier(req, user.id))
  if (!rl.ok) { log.end(429, { user_id: user.id }); return rateLimitResponse({ limit: LIMITS.savedSearches.limit, remaining: rl.remaining, resetAt: rl.resetAt }) }

  const { data, error } = await looseSupabase(supabase)
    .from('saved_searches')
    .select('id, name, filters, notify_on_diff, last_run_at, last_run_match_count, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) {
    logFailure('saved_searches.list_failed', error, { user_id: user.id })
    log.end(500, { user_id: user.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  log.end(200, { user_id: user.id, count: data?.length ?? 0 })
  return NextResponse.json({ searches: data ?? [] })
}


export async function POST(req: NextRequest) {
  const log = startRequest('api/saved-searches', req)
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { log.end(401); return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const rl = consumeRateLimit(LIMITS.savedSearches, clientIdentifier(req, user.id))
  if (!rl.ok) { log.end(429, { user_id: user.id }); return rateLimitResponse({ limit: LIMITS.savedSearches.limit, remaining: rl.remaining, resetAt: rl.resetAt }) }

  const validated = await validateBody(req, CreateSavedSearchSchema)
  if (!validated.ok) { log.end(400, { user_id: user.id }); return validated.response }
  const { name, filters } = validated.data
  const notifyOnDiff = validated.data.notify_on_diff !== false

  const { data, error } = await looseSupabase(supabase)
    .from('saved_searches')
    .insert({ user_id: user.id, name: name.trim(), filters, notify_on_diff: notifyOnDiff })
    .select('id, name, filters, notify_on_diff, created_at')
    .single()
  if (error) {
    logFailure('saved_searches.create_failed', error, { user_id: user.id })
    log.end(500, { user_id: user.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  log.end(201, { user_id: user.id, search_id: data.id })
  return NextResponse.json({ search: data }, { status: 201 })
}


export async function DELETE(req: NextRequest) {
  const log = startRequest('api/saved-searches', req)
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { log.end(401); return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const rl = consumeRateLimit(LIMITS.savedSearches, clientIdentifier(req, user.id))
  if (!rl.ok) { log.end(429, { user_id: user.id }); return rateLimitResponse({ limit: LIMITS.savedSearches.limit, remaining: rl.remaining, resetAt: rl.resetAt }) }

  const id = new URL(req.url).searchParams.get('id')
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    log.end(400, { user_id: user.id })
    return NextResponse.json({ error: 'id required (uuid)' }, { status: 400 })
  }

  const { error } = await looseSupabase(supabase)
    .from('saved_searches')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) {
    logFailure('saved_searches.delete_failed', error, { user_id: user.id, search_id: id })
    log.end(500, { user_id: user.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  log.end(200, { user_id: user.id, search_id: id })
  return NextResponse.json({ ok: true })
}
