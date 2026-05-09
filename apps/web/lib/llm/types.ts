// apps/web/lib/llm/types.ts
// Shared types for the provider-agnostic LLM facade.

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool'

export interface LlmMessage {
  role:          LlmRole
  content:       string
  tool_call_id?: string
  tool_calls?:   LlmToolCall[]
  name?:         string
}

export interface LlmToolCall {
  id:   string
  type: 'function'
  function: { name: string; arguments: string }   // arguments is a JSON string
}

export interface LlmToolSchema {
  type: 'function'
  function: {
    name:        string
    description: string
    parameters:  Record<string, unknown>
  }
}

export interface LlmChatOptions {
  max_tokens?:     number
  temperature?:    number
  /** When 'json_object' is passed, the provider is asked to return strictly valid JSON. */
  response_format?: 'text' | 'json_object'
  /** Optional tool list. Provider must support tools to use them; otherwise the call falls through. */
  tools?:          LlmToolSchema[]
  tool_choice?:    'auto' | 'none'
}

export interface LlmChatResponse {
  content:       string | null
  tool_calls:    LlmToolCall[]
  finish_reason: string
  /** Provider name + model used — useful for telemetry and debug. */
  provider:      string
  model:         string
}

export type ToolExecutor = (name: string, argsJson: string) => Promise<unknown>

export type ProviderName = 'ollama' | 'azure' | 'openai' | 'openrouter'

export interface ProviderInfo {
  name:                 ProviderName
  chat_model:           string
  embedding_model:      string | null
  base_url:             string
  api_key_present:      boolean
  embeddings_available: boolean
}
