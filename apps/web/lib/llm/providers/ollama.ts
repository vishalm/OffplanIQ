// apps/web/lib/llm/providers/ollama.ts
//
// Local Ollama adapter. Targets /api/chat (with native tool support since
// Ollama 0.3) and /api/embeddings. We deliberately stay close to OpenAI's
// shape so the unified facade can switch providers without translating
// at every call site.

import 'server-only'
import { ollamaConfig } from '../config'
import type { LlmChatOptions, LlmChatResponse, LlmMessage, LlmToolCall } from '../types'

interface OllamaChatBody {
  model:    string
  messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }>
  stream:   false
  format?:  'json'
  tools?:   any[]
  options?: Record<string, any>
}

export async function ollamaChat(messages: LlmMessage[], opts: LlmChatOptions): Promise<LlmChatResponse> {
  const cfg = ollamaConfig()
  const body: OllamaChatBody = {
    model:    cfg.chatModel,
    messages: messages.map(m => ({
      role:           m.role,
      content:        m.content,
      tool_call_id:   m.tool_call_id,
      tool_calls:     m.tool_calls,
    })),
    stream:   false,
    options:  {
      temperature: opts.temperature ?? 0.2,
      num_predict: opts.max_tokens ?? 4000,
    },
  }
  if (opts.response_format === 'json_object') body.format = 'json'
  if (opts.tools && opts.tools.length > 0) body.tools = opts.tools

  const res = await fetch(`${cfg.baseUrl}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Ollama chat error ${res.status}: ${text.slice(0, 400)}`)
  let json: any
  try { json = JSON.parse(text) } catch { throw new Error(`Ollama chat returned non-JSON: ${text.slice(0, 200)}`) }

  const message = json?.message ?? {}
  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
  const tool_calls: LlmToolCall[] = rawCalls.map((c: any, i: number) => {
    const args = c?.function?.arguments
    return {
      id:   c?.id || `call_${Date.now()}_${i}`,
      type: 'function',
      function: {
        name:      c?.function?.name || '',
        // Ollama returns arguments as an object; OpenAI returns as a string.
        // Normalise to string so tool executors can JSON.parse uniformly.
        arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
      },
    }
  })

  return {
    content:       typeof message.content === 'string' ? message.content : null,
    tool_calls,
    finish_reason: json?.done_reason || (json?.done ? 'stop' : 'unknown'),
    provider:      'ollama',
    model:         json?.model || cfg.chatModel,
  }
}


export async function ollamaEmbed(input: string): Promise<number[]> {
  const cfg = ollamaConfig()
  if (!cfg.embeddingModel) {
    throw new Error('OLLAMA_EMBEDDING_MODEL is not set. Try `ollama pull nomic-embed-text` and set OLLAMA_EMBEDDING_MODEL=nomic-embed-text.')
  }
  // Ollama supports both /api/embed (newer, batched) and /api/embeddings (legacy single).
  // Try /api/embed first; fall back to /api/embeddings on 404.
  const tryEmbed = async (path: string, body: any) => {
    const r = await fetch(`${cfg.baseUrl}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    return { status: r.status, text: await r.text() }
  }

  let r = await tryEmbed('/api/embed', { model: cfg.embeddingModel, input })
  if (r.status === 404) {
    r = await tryEmbed('/api/embeddings', { model: cfg.embeddingModel, prompt: input })
  }
  if (r.status !== 200) {
    throw new Error(`Ollama embed error ${r.status}: ${r.text.slice(0, 300)}`)
  }
  let json: any
  try { json = JSON.parse(r.text) } catch { throw new Error(`Ollama embed returned non-JSON: ${r.text.slice(0, 200)}`) }

  // /api/embed response: { embeddings: [[...]] } ; /api/embeddings: { embedding: [...] }
  const vec: number[] | undefined = json?.embedding ?? (Array.isArray(json?.embeddings) ? json.embeddings[0] : undefined)
  if (!Array.isArray(vec)) throw new Error('Ollama embed returned no vector.')
  return vec
}
