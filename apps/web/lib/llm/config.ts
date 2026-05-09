// apps/web/lib/llm/config.ts
//
// Single source of truth for LLM provider selection. Env-driven, defaults
// to Ollama (local) so the app can run end-to-end without any cloud key.
//
// Provider switch:
//   LLM_PROVIDER=ollama        # default
//   LLM_PROVIDER=azure         # Azure OpenAI
//   LLM_PROVIDER=openai        # OpenAI direct
//   LLM_PROVIDER=openrouter    # OpenRouter
//
// Embedding provider (optional, falls back to LLM_PROVIDER):
//   EMBEDDING_PROVIDER=ollama|azure|openai|openrouter
//
// See .env.example for all keys.

import type { ProviderName, ProviderInfo } from './types'

const VALID: ProviderName[] = ['ollama','azure','openai','openrouter']

function pickProvider(envKey: string, fallback: ProviderName): ProviderName {
  const v = (process.env[envKey] || '').trim().toLowerCase()
  return (VALID as string[]).includes(v) ? (v as ProviderName) : fallback
}

export function chatProvider(): ProviderName {
  return pickProvider('LLM_PROVIDER', 'ollama')
}

export function embeddingProvider(): ProviderName {
  // Default: same as chat provider unless explicitly overridden.
  return pickProvider('EMBEDDING_PROVIDER', chatProvider())
}

// ─── Ollama ─────────────────────────────────────────────────
export function ollamaConfig() {
  return {
    baseUrl:        (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, ''),
    chatModel:      process.env.OLLAMA_MODEL            || 'qwen2.5-coder:7b',
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL  || 'nomic-embed-text',
  }
}

// ─── Azure ──────────────────────────────────────────────────
export function azureConfig() {
  return {
    endpoint:       process.env.AZURE_OPENAI_ENDPOINT,
    apiKey:         process.env.AZURE_OPENAI_API_KEY,
    chatModel:      process.env.AZURE_OPENAI_DEPLOYMENT,
    embeddingModel: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small',
    apiVersion:     process.env.AZURE_OPENAI_API_VERSION          || '2024-08-01-preview',
  }
}

// ─── OpenAI direct ──────────────────────────────────────────
export function openaiConfig() {
  return {
    apiKey:         process.env.OPENAI_API_KEY,
    baseUrl:        (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    chatModel:      process.env.OPENAI_MODEL           || 'gpt-4o-mini',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  }
}

// ─── OpenRouter ─────────────────────────────────────────────
export function openrouterConfig() {
  return {
    apiKey:         process.env.OPENROUTER_API_KEY,
    baseUrl:        (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    chatModel:      process.env.OPENROUTER_MODEL           || 'qwen/qwen-2.5-coder-7b-instruct',
    // OpenRouter exposes embedding models via the same /embeddings endpoint.
    embeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL || '',
    // Optional analytics — only used if both are set.
    referer:        process.env.OPENROUTER_REFERER || 'https://offplaniq.com',
    appTitle:       process.env.OPENROUTER_APP_TITLE || 'OffplanIQ',
  }
}


export function isChatProviderConfigured(p: ProviderName = chatProvider()): boolean {
  switch (p) {
    case 'ollama':     return Boolean(ollamaConfig().baseUrl)
    case 'azure':      { const c = azureConfig();      return Boolean(c.endpoint && c.apiKey && c.chatModel) }
    case 'openai':     { const c = openaiConfig();     return Boolean(c.apiKey) }
    case 'openrouter': { const c = openrouterConfig(); return Boolean(c.apiKey) }
  }
}

export function isEmbeddingProviderConfigured(p: ProviderName = embeddingProvider()): boolean {
  switch (p) {
    case 'ollama':     return Boolean(ollamaConfig().baseUrl && ollamaConfig().embeddingModel)
    case 'azure':      { const c = azureConfig();      return Boolean(c.endpoint && c.apiKey && c.embeddingModel) }
    case 'openai':     { const c = openaiConfig();     return Boolean(c.apiKey && c.embeddingModel) }
    case 'openrouter': { const c = openrouterConfig(); return Boolean(c.apiKey && c.embeddingModel) }
  }
}

export function providerInfo(): ProviderInfo {
  const p = chatProvider()
  switch (p) {
    case 'ollama': {
      const c = ollamaConfig()
      return { name: p, chat_model: c.chatModel, embedding_model: c.embeddingModel, base_url: c.baseUrl, api_key_present: true, embeddings_available: isEmbeddingProviderConfigured() }
    }
    case 'azure': {
      const c = azureConfig()
      return { name: p, chat_model: c.chatModel || '', embedding_model: c.embeddingModel, base_url: c.endpoint || '', api_key_present: Boolean(c.apiKey), embeddings_available: isEmbeddingProviderConfigured() }
    }
    case 'openai': {
      const c = openaiConfig()
      return { name: p, chat_model: c.chatModel, embedding_model: c.embeddingModel, base_url: c.baseUrl, api_key_present: Boolean(c.apiKey), embeddings_available: isEmbeddingProviderConfigured() }
    }
    case 'openrouter': {
      const c = openrouterConfig()
      return { name: p, chat_model: c.chatModel, embedding_model: c.embeddingModel || null, base_url: c.baseUrl, api_key_present: Boolean(c.apiKey), embeddings_available: isEmbeddingProviderConfigured() }
    }
  }
}
