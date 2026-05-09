// apps/web/lib/llm/providers/openrouter.ts
// OpenRouter adapter — OpenAI-compatible JSON shape with two extra optional
// headers (HTTP-Referer + X-Title) that gate analytics + free-tier limits.

import 'server-only'
import { openrouterConfig } from '../config'
import type { LlmChatOptions, LlmChatResponse, LlmMessage } from '../types'

export async function openrouterChat(messages: LlmMessage[], opts: LlmChatOptions): Promise<LlmChatResponse> {
  const c = openrouterConfig()
  if (!c.apiKey) throw new Error('OpenRouter is not configured. Set OPENROUTER_API_KEY.')
  const body: Record<string, any> = {
    model:    c.chatModel,
    messages,
    max_tokens: opts.max_tokens ?? 4000,
  }
  if (opts.temperature != null)              body.temperature = opts.temperature
  if (opts.response_format === 'json_object') body.response_format = { type: 'json_object' }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools
    body.tool_choice = opts.tool_choice ?? 'auto'
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${c.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (c.referer)  headers['HTTP-Referer'] = c.referer
  if (c.appTitle) headers['X-Title']      = c.appTitle

  const res = await fetch(`${c.baseUrl}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 400)}`)
  const json = JSON.parse(text)
  const choice = json?.choices?.[0] ?? {}
  const message = choice.message ?? {}
  return {
    content:       message.content ?? null,
    tool_calls:    Array.isArray(message.tool_calls) ? message.tool_calls : [],
    finish_reason: choice.finish_reason ?? 'unknown',
    provider:      'openrouter',
    model:         json?.model || c.chatModel,
  }
}

export async function openrouterEmbed(input: string): Promise<number[]> {
  const c = openrouterConfig()
  if (!c.apiKey || !c.embeddingModel) {
    throw new Error('OpenRouter embeddings not configured. Set OPENROUTER_EMBEDDING_MODEL.')
  }
  const res = await fetch(`${c.baseUrl}/embeddings`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: c.embeddingModel, input }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`OpenRouter embed error ${res.status}: ${text.slice(0, 300)}`)
  const json = JSON.parse(text)
  const vec = json?.data?.[0]?.embedding
  if (!Array.isArray(vec)) throw new Error('OpenRouter embed returned no vector')
  return vec
}
