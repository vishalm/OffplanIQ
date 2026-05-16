// apps/web/lib/llm/providers/azure.ts
//
// Azure OpenAI adapter. Same wire format as OpenAI direct but the URL shape
// is per-deployment and uses an api-key header. Extracted from the
// pre-existing apps/web/lib/azure-openai.ts so the unified facade owns it
// going forward.

import 'server-only'
import { azureConfig } from '../config'
import type { LlmChatOptions, LlmChatResponse, LlmMessage } from '../types'

export async function azureChat(messages: LlmMessage[], opts: LlmChatOptions): Promise<LlmChatResponse> {
  const c = azureConfig()
  if (!c.endpoint || !c.apiKey || !c.chatModel) {
    throw new Error('Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT.')
  }
  const url = `${c.endpoint.replace(/\/+$/, '')}/openai/deployments/${c.chatModel}/chat/completions?api-version=${c.apiVersion}`
  const body: Record<string, any> = {
    messages,
    max_completion_tokens: opts.max_tokens ?? 4000,
  }
  // Reasoning models (o1/o3/o4/gpt-5*) only accept the default temperature.
  // Silently drop the caller's value so cross-provider callsites stay uniform.
  const isReasoningModel = /^(o[134]|gpt-5)/i.test(c.chatModel)
  if (opts.temperature != null && !isReasoningModel) body.temperature = opts.temperature
  if (opts.response_format === 'json_object') body.response_format = { type: 'json_object' }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools
    body.tool_choice = opts.tool_choice ?? 'auto'
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'api-key': c.apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Azure OpenAI error ${res.status}: ${text.slice(0, 400)}`)
  let json: any
  try { json = JSON.parse(text) } catch { throw new Error(`Azure OpenAI returned non-JSON: ${text.slice(0, 200)}`) }

  const choice = json?.choices?.[0] ?? {}
  const message = choice.message ?? {}
  return {
    content:       message.content ?? null,
    tool_calls:    Array.isArray(message.tool_calls) ? message.tool_calls : [],
    finish_reason: choice.finish_reason ?? 'unknown',
    provider:      'azure',
    model:         c.chatModel,
  }
}


export async function azureEmbed(input: string): Promise<number[]> {
  const c = azureConfig()
  if (!c.endpoint || !c.apiKey || !c.embeddingModel) {
    throw new Error('Azure embeddings not configured. Set AZURE_OPENAI_EMBEDDING_DEPLOYMENT.')
  }
  const url = `${c.endpoint.replace(/\/+$/, '')}/openai/deployments/${c.embeddingModel}/embeddings?api-version=${c.apiVersion}`
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'api-key': c.apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ input }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Azure embed error ${res.status}: ${text.slice(0, 300)}`)
  const json = JSON.parse(text)
  const vec = json?.data?.[0]?.embedding
  if (!Array.isArray(vec)) throw new Error('Azure embed returned no vector')
  return vec
}
