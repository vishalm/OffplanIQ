// apps/web/lib/azure-openai.ts
//
// Backwards-compatibility shim. Existing routes import { azureChat,
// azureChatWithTools, azureConfigured, azureEmbed, azureEmbeddingsConfigured,
// ChatMessage } from here. We keep that surface identical and route every
// call through the new provider-agnostic facade in @/lib/llm.
//
// Result: setting LLM_PROVIDER=ollama (the default) instantly switches every
// existing chat/RAG callsite to local inference, no per-route refactor
// required. Setting LLM_PROVIDER=azure restores the prior behaviour.

import 'server-only'
import {
  chat, chatWithTools as facadeChatWithTools, chatRaw,
  embed, info,
  isChatProviderConfigured, isEmbeddingProviderConfigured,
  type LlmMessage, type LlmToolSchema, type ToolExecutor,
} from './llm'

// ─── Re-exported types (legacy aliases) ─────────────────────
export type ChatMessage = LlmMessage

export type ToolCall = {
  id:   string
  type: 'function'
  function: { name: string; arguments: string }
}

export type AzureChatOptions = {
  max_completion_tokens?: number
  response_format?: 'text' | 'json_object'
  tools?: LlmToolSchema[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}


// ─── Configuration probes ───────────────────────────────────
export function azureConfig() {
  // Kept only for callers that introspect the chosen model. Returns a shape
  // compatible with the legacy field names but populated from whatever
  // provider is active.
  const i = info()
  return {
    endpoint:        i.base_url,
    apiKey:          i.api_key_present ? '***' : undefined,
    deployment:      i.chat_model,
    embedDeployment: i.embedding_model || '',
    version:         '',
  }
}

export function azureConfigured(): boolean {
  return isChatProviderConfigured()
}

export function azureEmbeddingsConfigured(): boolean {
  return isEmbeddingProviderConfigured()
}


// ─── Embeddings ─────────────────────────────────────────────
export async function azureEmbed(input: string): Promise<number[]> {
  return embed(input)
}


// ─── Chat ───────────────────────────────────────────────────
export async function azureChat(messages: ChatMessage[], opts: AzureChatOptions = {}): Promise<string> {
  return chat(messages, {
    max_tokens:      opts.max_completion_tokens,
    response_format: opts.response_format,
    tools:           opts.tools,
    tool_choice:     typeof opts.tool_choice === 'string' ? opts.tool_choice : undefined,
  })
}


// ─── Chat with tools ────────────────────────────────────────
export async function azureChatWithTools(
  messages: ChatMessage[],
  tools: NonNullable<AzureChatOptions['tools']>,
  runTool: ToolExecutor,
  opts: { max_iterations?: number; max_completion_tokens?: number } = {},
): Promise<{
  content: string
  iterations: number
  tool_invocations: Array<{ name: string; args: string; result_preview: string }>
}> {
  const r = await facadeChatWithTools(messages, tools, runTool, {
    max_iterations: opts.max_iterations,
    max_tokens:     opts.max_completion_tokens,
  })
  return { content: r.content, iterations: r.iterations, tool_invocations: r.tool_invocations }
}


// Internal helper retained for a couple of older callers — exposes raw provider response.
export async function azureChatRaw(messages: ChatMessage[], opts: AzureChatOptions = {}) {
  return chatRaw(messages, {
    max_tokens:      opts.max_completion_tokens,
    response_format: opts.response_format,
    tools:           opts.tools,
    tool_choice:     typeof opts.tool_choice === 'string' ? opts.tool_choice : undefined,
  })
}
