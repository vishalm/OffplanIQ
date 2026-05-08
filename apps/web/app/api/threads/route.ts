// apps/web/app/api/threads/route.ts
//
// POST /api/threads     — create a new thread + first user message.
//                          Body: { prompt: string }
//                          Returns: { thread_id }
// GET  /api/threads     — list current user's threads (newest first).
//
// Auth-gated. Anon callers get 401 (the landing page redirects to login).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { LIMITS, clientIdentifier, consumeRateLimit, rateLimitResponse, validateBody } from '@/lib/api-guard'
import { startRequest, logFailure } from '@/lib/logger'
import { looseSupabase } from '@/lib/supabase/loose'

const CreateThreadSchema = z.object({
  prompt: z.string().min(1).max(8000),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


function deriveTitle(prompt: string): string {
  // First line, capped, no trailing punctuation.
  const firstLine = prompt.split('\n')[0].trim()
  const trimmed = firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine
  return trimmed.replace(/[.?!,;:]+$/, '') || 'New conversation'
}


export async function POST(req: NextRequest) {
  const log = startRequest('api/threads', req)
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { log.end(401); return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const rl = consumeRateLimit(LIMITS.threadsCreate, clientIdentifier(req, user.id))
  if (!rl.ok) { log.end(429, { user_id: user.id }); return rateLimitResponse({ limit: LIMITS.threadsCreate.limit, remaining: rl.remaining, resetAt: rl.resetAt }) }

  const validated = await validateBody(req, CreateThreadSchema)
  if (!validated.ok) { log.end(400, { user_id: user.id }); return validated.response }
  const prompt = validated.data.prompt.trim()
  if (!prompt) { log.end(400, { user_id: user.id }); return NextResponse.json({ error: 'prompt required' }, { status: 400 }) }

  const sb = looseSupabase(supabase)
  const { data: thread, error: tErr } = await sb
    .from('chat_threads')
    .insert({ user_id: user.id, title: deriveTitle(prompt) })
    .select('id')
    .single()
  if (tErr || !thread) {
    logFailure('threads.create_failed', tErr ?? new Error('no thread row'), { user_id: user.id })
    log.end(500, { user_id: user.id })
    return NextResponse.json({ error: tErr?.message || 'thread_create_failed' }, { status: 500 })
  }

  // Persist the first user message. The conversation route will run the
  // assistant turn when it loads.
  const { error: mErr } = await sb
    .from('chat_messages')
    .insert({ thread_id: thread.id, role: 'user', content: prompt })
  if (mErr) {
    logFailure('threads.first_message_failed', mErr, { user_id: user.id, thread_id: thread.id })
    log.end(500, { user_id: user.id, thread_id: thread.id })
    return NextResponse.json({ error: mErr.message }, { status: 500 })
  }

  log.end(201, { user_id: user.id, thread_id: thread.id })
  return NextResponse.json({ thread_id: thread.id }, { status: 201 })
}


export async function GET(req: NextRequest) {
  const log = startRequest('api/threads', req)
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { log.end(401); return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const rl = consumeRateLimit(LIMITS.threadsRead, clientIdentifier(req, user.id))
  if (!rl.ok) { log.end(429, { user_id: user.id }); return rateLimitResponse({ limit: LIMITS.threadsRead.limit, remaining: rl.remaining, resetAt: rl.resetAt }) }

  const sb = looseSupabase(supabase)
  const { data, error } = await sb
    .from('chat_threads')
    .select('id, title, is_pinned, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) {
    logFailure('threads.list_failed', error, { user_id: user.id })
    log.end(500, { user_id: user.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  log.end(200, { user_id: user.id, count: data?.length ?? 0 })
  return NextResponse.json({ threads: data ?? [] })
}
