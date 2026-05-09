// apps/web/lib/llm/index.ts
//
// Provider-agnostic LLM facade. Routes call `chat()`, `chatWithTools()`,
// `embed()` and never know which provider answered. Switch providers via
// env (LLM_PROVIDER) — default is local Ollama, no cloud key required.
//
// This file is the only thing the rest of the app should import. The
// per-provider adapters live under ./providers and are picked here.

import 'server-only'
import {
  chatProvider, embeddingProvider,
  isChatProviderConfigured, isEmbeddingProviderConfigured, providerInfo,
} from './config'
import type {
  LlmChatOptions, LlmChatResponse, LlmMessage, LlmToolSchema, ToolExecutor,
} from './types'

import { ollamaChat,     ollamaEmbed     } from './providers/ollama'
import { azureChat       as azureChatRaw, azureEmbed       as azureEmbedRaw       } from './providers/azure'
import { openaiChat,     openaiEmbed     } from './providers/openai'
import { openrouterChat, openrouterEmbed } from './providers/openrouter'

export type { LlmChatOptions, LlmChatResponse, LlmMessage, LlmToolSchema, ToolExecutor } from './types'
export { providerInfo, chatProvider, embeddingProvider, isChatProviderConfigured, isEmbeddingProviderConfigured } from './config'

/** Single-shot chat. Returns text or throws on failure. */
export async function chat(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<string> {
  const r = await chatRaw(messages, opts)
  if (!r.content && r.tool_calls.length === 0) {
    if (r.finish_reason === 'length') {
      throw new Error(`${r.provider} hit token budget before producing output. Bump max_tokens.`)
    }
    throw new Error(`${r.provider} returned no content (finish=${r.finish_reason}).`)
  }
  return r.content ?? ''
}

/** Lower-level: returns full response shape (content + tool_calls). */
export async function chatRaw(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<LlmChatResponse> {
  const p = chatProvider()
  switch (p) {
    case 'ollama':     return ollamaChat(messages, opts)
    case 'azure':      return azureChatRaw(messages, opts)
    case 'openai':     return openaiChat(messages, opts)
    case 'openrouter': return openrouterChat(messages, opts)
  }
}

/** Embedding — uses EMBEDDING_PROVIDER if set, otherwise the chat provider. */
export async function embed(input: string): Promise<number[]> {
  const p = embeddingProvider()
  switch (p) {
    case 'ollama':     return ollamaEmbed(input)
    case 'azure':      return azureEmbedRaw(input)
    case 'openai':     return openaiEmbed(input)
    case 'openrouter': return openrouterEmbed(input)
  }
}

/**
 * Multi-turn tool-call loop, provider-agnostic. Sends `messages` + `tools[]`;
 * if the model emits tool_calls, executes each via `runTool`, appends the
 * results, and re-prompts. Stops on a content-only response or when
 * `max_iterations` is hit.
 *
 * Works on any provider that returns tool_calls in OpenAI-compatible shape.
 * Ollama 0.3+, Azure, OpenAI, and OpenRouter all qualify when the underlying
 * model supports tools (qwen2.5-coder, llama3.1+, gpt-4o-mini, etc.).
 */
export async function chatWithTools(
  messages: LlmMessage[],
  tools: LlmToolSchema[],
  runTool: ToolExecutor,
  opts: { max_iterations?: number; max_tokens?: number; temperature?: number } = {},
): Promise<{
  content: string
  iterations: number
  tool_invocations: Array<{ name: string; args: string; result_preview: string }>
  provider: string
  model: string
}> {
  const maxIters = Math.max(1, Math.min(opts.max_iterations ?? 5, 8))
  const conversation: LlmMessage[] = [...messages]
  const invocations: Array<{ name: string; args: string; result_preview: string }> = []
  let lastProvider = ''
  let lastModel    = ''

  for (let i = 0; i < maxIters; i++) {
    const r = await chatRaw(conversation, {
      tools,
      tool_choice: 'auto',
      max_tokens:  opts.max_tokens ?? 4000,
      temperature: opts.temperature,
    })
    lastProvider = r.provider
    lastModel    = r.model

    if (r.tool_calls.length === 0) {
      return {
        content:    r.content ?? '',
        iterations: i + 1,
        tool_invocations: invocations,
        provider:   r.provider,
        model:      r.model,
      }
    }

    conversation.push({
      role:       'assistant',
      content:    r.content ?? '',
      tool_calls: r.tool_calls,
    })
    for (const call of r.tool_calls) {
      let resultPayload: unknown
      try {
        resultPayload = await runTool(call.function.name, call.function.arguments)
      } catch (err: any) {
        resultPayload = { ok: false, error: err?.message ?? String(err) }
      }
      const resultStr = JSON.stringify(resultPayload).slice(0, 16_000)
      invocations.push({
        name:           call.function.name,
        args:           call.function.arguments,
        result_preview: resultStr.slice(0, 200),
      })
      conversation.push({
        role:         'tool',
        tool_call_id: call.id,
        name:         call.function.name,
        content:      resultStr,
      })
    }
  }

  // Used up the iteration budget without a content response — ask for a final answer.
  conversation.push({ role: 'user', content: 'Please give your final answer based on the tool results above.' })
  const final = await chatRaw(conversation, { max_tokens: opts.max_tokens ?? 4000, temperature: opts.temperature })
  return {
    content:          final.content ?? '',
    iterations:       maxIters,
    tool_invocations: invocations,
    provider:         lastProvider || final.provider,
    model:            lastModel    || final.model,
  }
}

/** Convenience: is the current chat provider configured to actually answer? */
export function chatConfigured(): boolean       { return isChatProviderConfigured() }
export function embeddingsConfigured(): boolean { return isEmbeddingProviderConfigured() }
export function info() { return providerInfo() }
