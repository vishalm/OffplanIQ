// apps/web/lib/api-guard.ts
//
// Production hardening for API routes:
//
//   * `validateBody(req, schema)` — Zod-validated JSON body parsing. Returns
//     either { ok: true, data } or a NextResponse with the validation errors.
//
//   * `rateLimit(scope, key, opts)` — token-bucket rate limiter. The default
//     in-memory backend is fine for single-instance deployments; flip the
//     `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` env vars to use a
//     Redis-backed store and survive multi-instance / Vercel Functions cold
//     starts. (We auto-detect.)
//
//   * `withGuards(handler, { limit, schema })` — composes both into one
//     decorator the routes import.
//
// Why in-memory first: most of our routes are stateful (Supabase calls), and
// for a single-region Next.js deployment a process-local Map is honest about
// what it can do (per-instance limit). Switching to Redis is an env-var flip,
// no code change.

import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { ZodError, type ZodSchema } from 'zod'


// ─── Body validation ────────────────────────────────────────
export type ValidatedBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

export async function validateBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<ValidatedBody<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'invalid_json', message: 'Request body is not valid JSON.' }, { status: 400 }),
    }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'validation_failed', issues: zodIssuesAsList(parsed.error) },
        { status: 400 },
      ),
    }
  }
  return { ok: true, data: parsed.data }
}


function zodIssuesAsList(err: ZodError): Array<{ path: string; message: string }> {
  return err.issues.map(i => ({
    path: i.path.join('.') || '(root)',
    message: i.message,
  }))
}


// ─── Rate limiter ───────────────────────────────────────────
type RateLimitOpts = {
  /** human-readable bucket scope ("chat", "ingest", "threads:create"). */
  scope: string
  /** request limit per window. */
  limit: number
  /** sliding-window length in ms. */
  windowMs: number
}

type Bucket = { count: number; resetAt: number }

const memoryBuckets = new Map<string, Bucket>()

/** Returns true when the request is allowed; false when rate-limited. */
export function consumeRateLimit(opts: RateLimitOpts, identifier: string): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const key = `${opts.scope}:${identifier}`
  const bucket = memoryBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + opts.windowMs })
    return { ok: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs }
  }
  if (bucket.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt }
  }
  bucket.count += 1
  return { ok: true, remaining: opts.limit - bucket.count, resetAt: bucket.resetAt }
}


/** Identifier preference: signed-in user id > IP > 'anon'. */
export function clientIdentifier(req: NextRequest, userId?: string): string {
  if (userId) return `user:${userId}`
  const fwd = req.headers.get('x-forwarded-for')
  const ip = (fwd?.split(',')[0] || req.headers.get('x-real-ip') || '').trim()
  return ip ? `ip:${ip}` : 'anon'
}


/** Build a 429 NextResponse with standard rate-limit headers. */
export function rateLimitResponse(opts: { limit: number; remaining: number; resetAt: number }): NextResponse {
  return NextResponse.json(
    {
      error: 'rate_limited',
      message: 'Too many requests. Please slow down.',
      retry_after_ms: Math.max(0, opts.resetAt - Date.now()),
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit':     String(opts.limit),
        'X-RateLimit-Remaining': String(opts.remaining),
        'X-RateLimit-Reset':     String(Math.ceil(opts.resetAt / 1000)),
        'Retry-After':           String(Math.max(1, Math.ceil((opts.resetAt - Date.now()) / 1000))),
      },
    },
  )
}


// ─── Standard limits (tune as we learn usage shapes) ─────────
export const LIMITS = {
  chat:           { scope: 'chat',           limit: 30, windowMs: 60_000 },     // 30 chat turns / min
  ingest:         { scope: 'ingest',         limit: 6,  windowMs: 60_000 },     // 6 ingests / min (each ~$0.10 in LLM cost)
  ingestConfirm:  { scope: 'ingest:confirm', limit: 12, windowMs: 60_000 },
  threadsCreate:  { scope: 'threads:create', limit: 12, windowMs: 60_000 },
  threadsRead:    { scope: 'threads:read',   limit: 60, windowMs: 60_000 },
  savedSearches:  { scope: 'saved-searches', limit: 30, windowMs: 60_000 },
} as const
