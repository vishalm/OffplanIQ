// apps/web/lib/llm/providers/openai.ts
// OpenAI direct adapter — also handles any OpenAI-compatible endpoint
// (e.g. Together, Groq, Fireworks) when OPENAI_BASE_URL is overridden.

import 'server-only'
import { openaiConfig } from '../config'
import type { LlmChatOptions, LlmChatResponse, LlmMessage } from '../types'

export async function openaiChat(messages: LlmMessage[], opts: LlmChatOptions): Promise<LlmChatResponse> {
  const c = openaiConfig()
  if (!c.apiKey) throw new Error('OpenAI is not configured. Set OPENAI_API_KEY.')
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

  const res = await fetch(`${c.baseUrl}/chat/completions`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 400)}`)
  const json = JSON.parse(text)
  const choice = json?.choices?.[0] ?? {}
  const message = choice.message ?? {}
  return {
    content:       message.content ?? null,
    tool_calls:    Array.isArray(message.tool_calls) ? message.tool_calls : [],
    finish_reason: choice.finish_reason ?? 'unknown',
    provider:      'openai',
    model:         json?.model || c.chatModel,
  }
}

export async function openaiEmbed(input: string): Promise<number[]> {
  const c = openaiConfig()
  if (!c.apiKey || !c.embeddingModel) throw new Error('OpenAI embeddings not configured.')
  const res = await fetch(`${c.baseUrl}/embeddings`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: c.embeddingModel, input }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`OpenAI embed error ${res.status}: ${text.slice(0, 300)}`)
  const json = JSON.parse(text)
  const vec = json?.data?.[0]?.embedding
  if (!Array.isArray(vec)) throw new Error('OpenAI embed returned no vector')
  return vec
}
