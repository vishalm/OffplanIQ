// apps/web/lib/azure-openai.ts
// Server-only Azure OpenAI client. No SDK — just fetch against the deployment URL.
// Read by both Server Components (project narrative panel) and the /api/chat route.
//
// Required env (root .env):
//   AZURE_OPENAI_ENDPOINT     e.g. https://<resource>.openai.azure.com
//   AZURE_OPENAI_API_KEY      e.g. abc123...
//   AZURE_OPENAI_DEPLOYMENT   e.g. gpt-4o-mini
//   AZURE_OPENAI_API_VERSION  e.g. 2024-08-01-preview
//
// If any are missing, helpers throw a clear error rather than silently failing.

import 'server-only'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string                       // for role:'tool' replies
  tool_calls?: ToolCall[]                     // for role:'assistant' tool requests
  name?: string                               // optional, for tool messages
}

export type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }   // arguments is a JSON string
}

export function azureConfig() {
  const endpoint   = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey     = process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT
  const embedDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small'
  const version    = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview'
  return { endpoint, apiKey, deployment, embedDeployment, version }
}

export function azureConfigured(): boolean {
  const c = azureConfig()
  return Boolean(c.endpoint && c.apiKey && c.deployment)
}

export function azureEmbeddingsConfigured(): boolean {
  const c = azureConfig()
  return Boolean(c.endpoint && c.apiKey && c.embedDeployment)
}

export async function azureEmbed(input: string): Promise<number[]> {
  const { endpoint, apiKey, embedDeployment, version } = azureConfig()
  if (!endpoint || !apiKey || !embedDeployment) {
    throw new Error('Azure OpenAI embeddings not configured. Set AZURE_OPENAI_EMBEDDING_DEPLOYMENT.')
  }
  const url = `${endpoint.replace(/\/+$/, '')}/openai/deployments/${embedDeployment}/embeddings?api-version=${version}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Azure embeddings error ${res.status}: ${text.slice(0, 300)}`)
  const json = JSON.parse(text)
  const vec = json?.data?.[0]?.embedding
  if (!Array.isArray(vec)) throw new Error('Azure embeddings returned no vector')
  return vec
}

export type AzureChatOptions = {
  max_completion_tokens?: number
  response_format?: 'text' | 'json_object'
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}

export type AzureChatResponse = {
  content: string | null
  tool_calls: ToolCall[]
  finish_reason: string
}

async function azureChatRaw(messages: ChatMessage[], opts: AzureChatOptions): Promise<AzureChatResponse> {
  const { endpoint, apiKey, deployment, version } = azureConfig()
  if (!endpoint || !apiKey || !deployment) {
    throw new Error('Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT in root .env.')
  }
  const url = `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${version}`

  const body: Record<string, any> = {
    messages,
    max_completion_tokens: opts.max_completion_tokens ?? 4000,
  }
  if (opts.response_format === 'json_object') body.response_format = { type: 'json_object' }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools
    body.tool_choice = opts.tool_choice ?? 'auto'
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Azure OpenAI error ${res.status}: ${text.slice(0, 400)}`)
  let json: any
  try { json = JSON.parse(text) } catch { throw new Error(`Azure OpenAI returned non-JSON: ${text.slice(0, 200)}`) }
  const choice = json?.choices?.[0] ?? {}
  const message = choice.message ?? {}
  return {
    content: message.content ?? null,
    tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    finish_reason: choice.finish_reason ?? 'unknown',
  }
}


export async function azureChat(messages: ChatMessage[], opts: AzureChatOptions = {}): Promise<string> {
  // Backwards-compatible single-shot. Throws on length or empty when no tool call.
  const r = await azureChatRaw(messages, opts)
  if (!r.content) {
    if (r.finish_reason === 'length') {
      throw new Error('Azure OpenAI hit token budget before producing output. Bump max_completion_tokens.')
    }
    if (r.tool_calls.length === 0) {
      throw new Error(`Azure OpenAI returned no content (finish=${r.finish_reason}).`)
    }
  }
  return r.content ?? ''
}


export type ToolExecutor = (name: string, argsJson: string) => Promise<unknown>

/**
 * Multi-turn tool-call loop. Sends `messages` + `tools[]`; if the model
 * responds with tool_calls, executes each via `runTool`, appends the tool
 * results, and re-prompts. Stops on a content-only response or when
 * `max_iterations` is hit.
 */
export async function azureChatWithTools(
  messages: ChatMessage[],
  tools: NonNullable<AzureChatOptions['tools']>,
  runTool: ToolExecutor,
  opts: { max_iterations?: number; max_completion_tokens?: number } = {},
): Promise<{ content: string; iterations: number; tool_invocations: Array<{ name: string; args: string; result_preview: string }> }> {
  const maxIters = Math.max(1, Math.min(opts.max_iterations ?? 5, 8))
  const conversation: ChatMessage[] = [...messages]
  const invocations: Array<{ name: string; args: string; result_preview: string }> = []

  for (let i = 0; i < maxIters; i++) {
    const r = await azureChatRaw(conversation, {
      tools,
      max_completion_tokens: opts.max_completion_tokens ?? 4000,
      tool_choice: 'auto',
    })
    if (r.tool_calls.length === 0) {
      return { content: r.content ?? '', iterations: i + 1, tool_invocations: invocations }
    }
    // Append the assistant turn that contains the tool requests.
    conversation.push({
      role: 'assistant',
      content: r.content ?? '',
      tool_calls: r.tool_calls,
    })
    // Execute each requested tool sequentially. Even on failure, return an
    // error JSON so the model can reason about it.
    for (const call of r.tool_calls) {
      let resultPayload: unknown
      try {
        resultPayload = await runTool(call.function.name, call.function.arguments)
      } catch (err: any) {
        resultPayload = { ok: false, error: err?.message ?? String(err) }
      }
      const resultStr = JSON.stringify(resultPayload).slice(0, 16_000)
      invocations.push({
        name: call.function.name,
        args: call.function.arguments,
        result_preview: resultStr.slice(0, 200),
      })
      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: resultStr,
      })
    }
  }

  // Hit max iterations without final content — ask the model to summarise.
  conversation.push({
    role: 'user',
    content: 'Please give your final answer based on the tool results above.',
  })
  const final = await azureChatRaw(conversation, { max_completion_tokens: opts.max_completion_tokens ?? 4000 })
  return { content: final.content ?? '', iterations: maxIters, tool_invocations: invocations }
}
