// apps/web/lib/error-capture.ts
//
// Production error capture. Forwards exceptions to Sentry via its public
// envelope endpoint (no SDK install — keeps the dep tree lean and works in
// every runtime including edge). When `SENTRY_DSN` is not configured we fall
// back to the structured logger.
//
// Why no @sentry/nextjs:
//   * The SDK pulls ~60 transitive deps, requires webpack plugin config,
//     source-map upload pipeline, and instrumentation hooks across runtimes.
//     For our scale it's overkill.
//   * Sentry's HTTP envelope is a stable, documented API — every SDK is just
//     a wrapper around it. Posting events directly is durable and minimal.
//   * Easy to swap to the full SDK later: replace this file's body with
//     `import * as Sentry from '@sentry/nextjs'` and `Sentry.captureException`.
//
// SENTRY_DSN format: https://<key>@o<orgId>.ingest.sentry.io/<projectId>

import 'server-only'

import { logEvent } from './logger'

type CaptureContext = {
  user_id?: string
  route?: string
  fingerprint?: string[]
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  level?: 'error' | 'warning' | 'info'
}

const RELEASE  = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'dev'
const ENV_NAME = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'


function parseDsn(dsn: string): { host: string; projectId: string; publicKey: string } | null {
  // dsn shape: https://<publicKey>@<host>/<projectId>
  const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(dsn.trim())
  if (!m) return null
  return { publicKey: m[1], host: m[2], projectId: m[3] }
}


export async function captureException(err: unknown, ctx: CaptureContext = {}): Promise<void> {
  const dsn = process.env.SENTRY_DSN
  // Always emit to the structured logger first — guarantees visibility even
  // when Sentry isn't configured or its endpoint is down.
  const e = err as any
  logEvent(ctx.level === 'warning' ? 'warn' : 'error', 'capture', {
    route:   ctx.route,
    user_id: ctx.user_id,
    message: e?.message ?? String(err),
    stack:   e?.stack?.split('\n').slice(0, 6).join(' | '),
    tags:    ctx.tags,
    extra:   ctx.extra,
  })

  if (!dsn) return
  const parsed = parseDsn(dsn)
  if (!parsed) {
    logEvent('warn', 'sentry.dsn_invalid', { dsn_prefix: dsn.slice(0, 12) })
    return
  }

  // Build a minimal Sentry envelope. Spec:
  //   https://develop.sentry.dev/sdk/envelopes/
  // Sentry expects 3 NDJSON lines: envelope header, item header, item body.
  const event = {
    event_id: cryptoRandomEventId(),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: ctx.level ?? 'error',
    server_name: process.env.VERCEL_URL || 'localhost',
    release: RELEASE,
    environment: ENV_NAME,
    fingerprint: ctx.fingerprint,
    user: ctx.user_id ? { id: ctx.user_id } : undefined,
    tags: { route: ctx.route ?? 'unknown', ...ctx.tags },
    extra: ctx.extra,
    exception: {
      values: [{
        type: e?.name || 'Error',
        value: e?.message || String(err),
        stacktrace: parseStack(e?.stack),
      }],
    },
  }

  const envelopeHeader = JSON.stringify({
    event_id: event.event_id,
    sent_at: event.timestamp,
    dsn,
    sdk: { name: 'offplaniq.minimal', version: '1.0.0' },
  })
  const itemHeader = JSON.stringify({ type: 'event' })
  const itemBody   = JSON.stringify(event)
  const payload    = `${envelopeHeader}\n${itemHeader}\n${itemBody}`

  const url = `https://${parsed.host}/api/${parsed.projectId}/envelope/`
  try {
    // Fire-and-forget. We don't await success — if Sentry is down we'd rather
    // serve the user than block them on observability.
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': sentryAuthHeader(parsed.publicKey),
      },
      body: payload,
      // 3-second timeout so a slow Sentry doesn't pin a serverless invocation.
      signal: AbortSignal.timeout(3_000),
    })
  } catch (err2) {
    logEvent('warn', 'sentry.send_failed', { reason: (err2 as any)?.message ?? String(err2) })
  }
}


function cryptoRandomEventId(): string {
  // 32 hex chars per Sentry's event_id requirement.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replaceAll('-', '')
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}


function sentryAuthHeader(publicKey: string): string {
  // https://develop.sentry.dev/sdk/overview/#authentication
  return [
    'Sentry sentry_version=7',
    `sentry_client=offplaniq.minimal/1.0.0`,
    `sentry_key=${publicKey}`,
  ].join(', ')
}


type SentryFrame = {
  filename?: string
  function?: string
  lineno?: number
  colno?: number
}

function parseStack(stack: string | undefined): { frames: SentryFrame[] } | undefined {
  if (!stack) return undefined
  const frames: SentryFrame[] = []
  for (const line of stack.split('\n').slice(1, 21)) {
    // Match patterns like "    at funcName (path:1:2)" or "    at path:1:2"
    const m = /^\s*at\s+(?:(.+?)\s+\()?([^)]+):(\d+):(\d+)\)?$/.exec(line)
    if (!m) continue
    frames.push({
      function: m[1] || '<anonymous>',
      filename: m[2],
      lineno:   Number(m[3]),
      colno:    Number(m[4]),
    })
  }
  // Sentry expects oldest-frame-first; JS stack is newest-first.
  return frames.length ? { frames: frames.reverse() } : undefined
}
