// apps/web/app/api/admin/ops/route.ts
//
// GET  → list of operations (catalogue) the UI / Copilot can render
// POST → run one operation by id, returns the completed JobRecord

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin/guard'
import { operationViews } from '@/lib/admin/operations'
import { executeOperation } from '@/lib/admin/executor'
import { startRequest } from '@/lib/logger'
import { LIMITS, clientIdentifier, consumeRateLimit, rateLimitResponse, validateBody } from '@/lib/api-guard'

const RunBody = z.object({
  op_id: z.string().min(1).max(80),
  args:  z.record(z.unknown()).optional(),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const log = startRequest('api/admin/ops:list', req)
  const admin = await requireAdmin()
  if (!admin) { log.end(403); return NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  log.end(200, { admin: admin.email })
  return NextResponse.json({ operations: operationViews() })
}


export async function POST(req: NextRequest) {
  const log = startRequest('api/admin/ops:run', req)
  const admin = await requireAdmin()
  if (!admin) { log.end(403); return NextResponse.json({ error: 'forbidden' }, { status: 403 }) }

  const rl = consumeRateLimit(LIMITS.chat, clientIdentifier(req, admin.user_id))
  if (!rl.ok) { log.end(429, { admin: admin.email }); return rateLimitResponse({ limit: LIMITS.chat.limit, remaining: rl.remaining, resetAt: rl.resetAt }) }

  const v = await validateBody(req, RunBody)
  if (!v.ok) { log.end(400); return v.response }

  const job = await executeOperation(v.data.op_id, `manual:${admin.email}`, v.data.args ?? {})
  log.end(200, { admin: admin.email, op_id: v.data.op_id, status: job.status, duration_ms: job.duration_ms })
  return NextResponse.json({ job })
}
