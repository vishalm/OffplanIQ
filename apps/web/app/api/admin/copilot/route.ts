// apps/web/app/api/admin/copilot/route.ts
//
// AI-first ops console. The admin chats in plain English ("scrape Expo City
// then recompute scores"), the LLM plans a sequence of operations from the
// canonical registry, and the same `executeOperation` path that powers the
// one-click buttons runs each step. The reply summarises what happened.
//
// Every operation is exposed as a function-calling tool. The system prompt
// pins safety rules (confirm-before-destructive, never invent ops) and the
// model is told the platform stats so it can give useful answers.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin/guard'
import { LIMITS, clientIdentifier, consumeRateLimit, rateLimitResponse, validateBody } from '@/lib/api-guard'
import { startRequest, logFailure, timed } from '@/lib/logger'
import { chatWithTools, type LlmMessage, type LlmToolSchema } from '@/lib/llm'
import { OPERATIONS, operationViews } from '@/lib/admin/operations'
import { executeOperation } from '@/lib/admin/executor'

const Body = z.object({
  message: z.string().min(2).max(4000),
  history: z.array(z.object({
    role:    z.enum(['user','assistant']),
    content: z.string().min(1).max(4000),
  })).max(20).optional().default([]),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


function toolSchemas(): LlmToolSchema[] {
  // Every enabled operation becomes a function-calling tool. The Copilot
  // can choose any combination; we cap iterations to keep cost bounded.
  return OPERATIONS.filter(o => o.enabled).map(o => ({
    type: 'function' as const,
    function: {
      name:        `op_${o.id}`,
      description: `${o.danger ? '[DESTRUCTIVE] ' : ''}${o.description} (category: ${o.category}, kind: ${o.kind})`,
      parameters: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            description: o.danger
              ? 'Required for destructive operations. The user must have explicitly confirmed before you set this to true.'
              : 'Optional. Always omit unless the operation is destructive.',
          },
          args: {
            type: 'object',
            description: 'Optional structured arguments to pass to the operation.',
          },
        },
      },
    },
  }))
}


export async function POST(req: NextRequest) {
  const log = startRequest('api/admin/copilot', req)
  const admin = await requireAdmin()
  if (!admin) { log.end(403); return NextResponse.json({ error: 'forbidden' }, { status: 403 }) }

  const rl = consumeRateLimit(LIMITS.chat, clientIdentifier(req, admin.user_id))
  if (!rl.ok) { log.end(429); return rateLimitResponse({ limit: LIMITS.chat.limit, remaining: rl.remaining, resetAt: rl.resetAt }) }

  const v = await validateBody(req, Body)
  if (!v.ok) { log.end(400); return v.response }

  const opsManifest = operationViews()
    .filter(o => o.enabled)
    .map(o => `- ${o.id} [${o.category}, ${o.kind}${o.danger ? ', DESTRUCTIVE' : ''}] — ${o.label}: ${o.description}`)
    .join('\n')

  const system: LlmMessage = {
    role: 'system',
    content:
`You are the OffplanIQ Operations Copilot. The signed-in admin (${admin.email}) is running this portal.

You can call any operation below as a function-tool. Each tool name is "op_<id>" — e.g. op_recalc_scores, op_scrape_expo_city. Never invent operation ids; only use the ones listed.

OPERATIONS:
${opsManifest}

PLAYBOOK & SAFETY RULES:
1. Plan first. If the user asks something multi-step ("ingest Expo City and rerun scores"), explain the plan in one sentence, then call the tools in order.
2. Idempotency. Most ops are safe to re-run. State that briefly when relevant.
3. Destructive ops (alert-dispatcher, digest-sender) require an explicit user "yes" or "confirm" in their message before you call them. If the user hasn't confirmed, ASK before invoking — do not invoke.
4. Tool result interpretation. After each tool call, the result JSON contains 'status' ("success" or "failed"), 'duration_ms', and 'output'. Quote real numbers from 'output' (e.g. "updated: 160 projects") in your reply.
5. Sequence sensibly. Scraping should happen before recompute. Suggested order when both are requested:
   scrape_dld → refresh_psf → recalc_scores → launch_radar.
6. When the user asks a status / observability question (e.g. "how many projects", "what changed today"), call op_platform_stats — do not guess.
7. Concise replies. 2-5 short sentences. Bullet points for multi-op summaries. No markdown headers. No emoji.
8. If a tool fails, surface the error verbatim and propose the next step.`,
  }

  const messages: LlmMessage[] = [
    system,
    ...(v.data.history ?? []).map(m => ({ role: m.role, content: m.content } as LlmMessage)),
    { role: 'user', content: v.data.message },
  ]

  const tools = toolSchemas()

  try {
    const result = await timed(() => chatWithTools(
      messages,
      tools,
      async (toolName, argsJson) => {
        // Strip the "op_" prefix to get the canonical operation id.
        if (!toolName.startsWith('op_')) return { ok: false, error: `unknown tool: ${toolName}` }
        const opId = toolName.slice(3)
        let parsedArgs: Record<string, unknown> = {}
        try { parsedArgs = JSON.parse(argsJson || '{}') } catch { parsedArgs = {} }
        const job = await executeOperation(opId, `copilot:${admin.email}`, (parsedArgs.args as any) ?? {})
        // Hand the model the same JobRecord the UI sees, so it can quote
        // duration / status / counts back to the admin.
        return {
          op_id:       job.op_id,
          status:      job.status,
          duration_ms: job.duration_ms,
          started_at:  job.started_at,
          finished_at: job.finished_at,
          output:      job.output,
          error:       job.error,
        }
      },
      { max_iterations: 6, max_tokens: 1500, temperature: 0.1 },
    ), 'admin.copilot', { admin: admin.email })

    log.end(200, {
      admin:        admin.email,
      tool_count:   result.tool_invocations.length,
      iterations:   result.iterations,
      provider:     result.provider,
      model:        result.model,
    })
    return NextResponse.json({
      reply:            result.content || 'No reply.',
      iterations:       result.iterations,
      tool_invocations: result.tool_invocations,
      provider:         result.provider,
      model:            result.model,
    })
  } catch (err: any) {
    logFailure('admin.copilot.failed', err, { admin: admin.email })
    log.end(502, { admin: admin.email })
    return NextResponse.json({ error: 'copilot_failed', message: err?.message ?? String(err) }, { status: 502 })
  }
}
