// apps/web/app/api/insights/query/route.ts
//
// POST { question: string } → run text-to-SQL.
//
// Pipeline: auth → rate limit → LLM emits QueryPlan (JSON, validated against
// our schema) → executor runs it via Supabase query builder → in-memory
// group/aggregate → optional 1-line narrative pass.
//
// We never execute LLM-generated SQL strings. The "sql" field in the response
// is purely for human display; the data was fetched via the validated plan.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { azureChat, azureConfigured } from '@/lib/azure-openai'
import { LIMITS, clientIdentifier, consumeRateLimit, rateLimitResponse, validateBody } from '@/lib/api-guard'
import { startRequest, logFailure, timed } from '@/lib/logger'
import { planFromQuestion } from '@/lib/insights/planner'
import { executePlan } from '@/lib/insights/executor'
import { planToSql } from '@/lib/insights/plan'

const Body = z.object({
  question: z.string().min(2).max(2000),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const log = startRequest('api/insights/query', req)
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { log.end(401); return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const rl = consumeRateLimit(LIMITS.chat, clientIdentifier(req, user.id))
  if (!rl.ok) { log.end(429, { user_id: user.id }); return rateLimitResponse({ limit: LIMITS.chat.limit, remaining: rl.remaining, resetAt: rl.resetAt }) }

  if (!azureConfigured()) {
    log.end(503, { user_id: user.id })
    return NextResponse.json({ error: 'azure_not_configured', message: 'Azure OpenAI is not configured.' }, { status: 503 })
  }

  const v = await validateBody(req, Body)
  if (!v.ok) { log.end(400, { user_id: user.id }); return v.response }

  // 1) Plan
  const planning = await timed(() => planFromQuestion(v.data.question), 'insights.plan', { user_id: user.id })
  if (!planning.plan) {
    log.end(422, { user_id: user.id, planning_error: planning.error })
    return NextResponse.json({
      error: 'plan_invalid',
      message: planning.error || 'Could not build a query plan for that question.',
      raw: planning.raw,
    }, { status: 422 })
  }
  const plan = planning.plan

  // 2) Execute
  let execution
  try {
    execution = await timed(() => executePlan(plan), 'insights.execute', { user_id: user.id, table: plan.table })
  } catch (err: any) {
    logFailure('insights.execute_failed', err, { user_id: user.id, plan: plan.sql })
    log.end(500, { user_id: user.id })
    return NextResponse.json({ error: 'execute_failed', message: err?.message || 'Query failed.' }, { status: 500 })
  }

  // 3) Narrative summary — best-effort, non-blocking on failure.
  let summary = plan.narrative
  if (execution.rows.length > 0) {
    try {
      const sample = execution.rows.slice(0, 25)
      summary = await azureChat([
        { role: 'system', content: 'You write 1-2 sentence summaries of UAE off-plan property query results. Quote real numbers from the rows. Be concise. No markdown.' },
        { role: 'user',   content: `Question: ${v.data.question}\nColumns: ${execution.columns.join(', ')}\nFirst rows: ${JSON.stringify(sample)}\nTotal rows: ${execution.totals.rowCount}` },
      ], { max_completion_tokens: 220 })
    } catch (err) {
      // Keep the planner's narrative as fallback.
      logFailure('insights.summary_failed', err, { user_id: user.id })
    }
  }

  log.end(200, {
    user_id: user.id,
    table: plan.table,
    rows: execution.rows.length,
    truncated: execution.totals.truncated,
    chart_hint: plan.chart_hint,
  })

  return NextResponse.json({
    question:   v.data.question,
    sql:        plan.sql || planToSql(plan),
    plan,
    columns:    execution.columns,
    rows:       execution.rows,
    chart_hint: plan.chart_hint,
    summary,
    totals:     execution.totals,
  })
}
