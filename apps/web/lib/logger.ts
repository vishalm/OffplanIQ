// apps/web/lib/logger.ts
//
// Structured request logging. Emits one JSON line per call so Vercel /
// Datadog / any log aggregator can ingest it without regex gymnastics.
//
//   logRequest('api/chat', req, { user_id, route: 'chat' })
//   logEvent('warn', 'azure_ratelimit', { retry_after_ms: 1500 })
//   timed(() => doWork(), 'rag_search')                    // returns whatever fn returns
//
// Format (one line):
//   {"ts":"2026-05-07T12:34:56.789Z","level":"info","event":"req",
//    "route":"api/chat","user_id":"...","duration_ms":123,"status":200}
//
// Why a tiny custom logger instead of pino/winston: zero deps, works in
// edge AND nodejs runtimes, doesn't need bundler config. ~80 lines. Swap
// in pino later if/when we need transports.

import 'server-only'

import { NextRequest } from 'next/server'

export type Level = 'debug' | 'info' | 'warn' | 'error'

const RUNTIME_NAME =
  typeof process !== 'undefined' && process.env?.NEXT_RUNTIME
    ? process.env.NEXT_RUNTIME
    : 'nodejs'

function safeJson(v: unknown): string {
  try { return JSON.stringify(v) } catch { return '[unstringifiable]' }
}

export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = {
    ts:      new Date().toISOString(),
    level,
    event,
    runtime: RUNTIME_NAME,
    ...fields,
  }
  // Always JSON-stringify so log aggregators get a single document per line.
  // We use console.{level} so cloud loggers map severity automatically.
  let fn: (...args: unknown[]) => void
  switch (level) {
    case 'debug': fn = console.debug; break
    case 'warn':  fn = console.warn;  break
    case 'error': fn = console.error; break
    default:      fn = console.log
  }
  fn(JSON.stringify(line))
}


export function startRequest(route: string, req: NextRequest, extra: Record<string, unknown> = {}): { end: (status: number, more?: Record<string, unknown>) => void } {
  const t0 = Date.now()
  return {
    end(status: number, more: Record<string, unknown> = {}) {
      logEvent(status >= 500 ? 'error' : 'info', 'req', {
        route,
        method:        req.method,
        status,
        duration_ms:   Date.now() - t0,
        path:          new URL(req.url).pathname,
        // user_id is callers' responsibility (auth-gated routes pass it in)
        ...extra,
        ...more,
      })
    },
  }
}


/**
 * Wrap an async function in timing + error logging. Re-raises so callers
 * keep their existing try/catch. Useful for gluing on top of expensive bits
 * (LLM calls, vector search, scrape fetches).
 */
export async function timed<T>(fn: () => Promise<T>, event: string, fields: Record<string, unknown> = {}): Promise<T> {
  const t0 = Date.now()
  try {
    const out = await fn()
    logEvent('info', event, { ...fields, duration_ms: Date.now() - t0, ok: true })
    return out
  } catch (err: any) {
    logEvent('error', event, {
      ...fields,
      duration_ms: Date.now() - t0,
      ok: false,
      message: err?.message ?? String(err),
    })
    throw err
  }
}


/**
 * Convenience: log + ship to Sentry (when configured) in one call. Most
 * routes use this on their failure paths; logEvent directly is fine for
 * info/warn breadcrumbs that aren't actionable errors.
 *
 * The error-capture import is dynamic so the logger remains usable from
 * server-only contexts that haven't loaded Sentry config yet (e.g. early
 * boot). Failure to send to Sentry never blocks the local log line.
 */
export function logFailure(event: string, err: unknown, fields: Record<string, unknown> = {}): void {
  const e = err as any
  // Avoid [object Object] when callers pass a plain object instead of an Error.
  const message = e?.message ?? (typeof err === 'string' ? err : safeJson(err))
  logEvent('error', event, {
    ...fields,
    message,
    stack: e?.stack?.split('\n').slice(0, 3).join(' | '),
  })
  // Fire-and-forget capture. We import dynamically so a transient circular
  // import or import-time error in error-capture.ts can never break the
  // logger itself.
  void import('./error-capture').then(m => m.captureException(err, {
    route: typeof fields.route === 'string' ? fields.route : event,
    user_id: typeof fields.user_id === 'string' ? fields.user_id : undefined,
    extra: fields,
    fingerprint: [event],
  })).catch(() => { /* swallowed — local log already emitted */ })
}
