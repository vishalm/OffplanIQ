# LLM provider configuration

OffplanIQ ships a provider-agnostic LLM facade at [`apps/web/lib/llm/`](../apps/web/lib/llm/). Every chat, RAG, text-to-SQL, ingest, and natural-language search call routes through it. Switch providers with a single env flip — no code change.

## Quick reference

```env
# ─── Default — local Ollama (free, no key required) ───────────────
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:7b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# ─── Azure OpenAI (existing keys) ─────────────────────────────────
# LLM_PROVIDER=azure
# AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
# AZURE_OPENAI_API_KEY=<key>
# AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
# AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
# AZURE_OPENAI_API_VERSION=2024-08-01-preview

# ─── OpenAI direct ────────────────────────────────────────────────
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=https://api.openai.com/v1     # override for Together/Groq/Fireworks
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# ─── OpenRouter ───────────────────────────────────────────────────
# LLM_PROVIDER=openrouter
# OPENROUTER_API_KEY=sk-or-...
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_MODEL=qwen/qwen-2.5-coder-7b-instruct
# OPENROUTER_EMBEDDING_MODEL=                    # optional; many models route via OpenRouter
# OPENROUTER_REFERER=https://offplaniq.com
# OPENROUTER_APP_TITLE=OffplanIQ

# Optional: route embeddings through a different provider than chat.
# EMBEDDING_PROVIDER=ollama
```

## Picking a default model

The user's local Ollama install (`ollama list`) shows:

| Model                    | Size  | Notes                                                |
| ------------------------ | ----- | ---------------------------------------------------- |
| `qwen2.5-coder:7b`       | 4.7 G | **Recommended.** Strong JSON-mode + native tool use. |
| `qwen3:8b`               | 5.2 G | Latest qwen3 generalist; bump to this if needed.     |
| `deepseek-coder-v2:lite` | 8.9 G | 15.7B params; heavier but very strong code/SQL.      |
| `llama3:latest`          | 4.7 G | Solid general fallback.                              |
| `gemma4:latest`          | 9.6 G | Decent generalist.                                   |

For text-to-SQL on `/insights`, `qwen2.5-coder:7b` is the right default — it's Apache-2.0, fast, and emits clean JSON. If a question struggles, try `qwen3:8b`.

## Embeddings

No embedding model is installed by default. Pull one for RAG (brochure/document search):

```bash
ollama pull nomic-embed-text          # 274 MB, 768 dims — good general default
# or
ollama pull bge-m3                    # 1.2 GB, 1024 dims — multilingual, stronger
```

Then set `OLLAMA_EMBEDDING_MODEL` accordingly.

If embeddings aren't configured, RAG silently degrades — chat still works, it just doesn't cite brochure chunks.

## Tool / function calling

The facade's `chatWithTools` requires a model that can return OpenAI-shaped `tool_calls`. Confirmed working:

- Ollama: `qwen2.5-coder:7b`, `qwen3:8b`, `llama3:latest` (all support tools natively in Ollama 0.3+).
- Azure / OpenAI: any modern `gpt-4o*`, `gpt-4.1*`, `gpt-5*`.
- OpenRouter: any tool-supporting model (most OpenAI / Anthropic / Qwen routes).

If a model doesn't return tool calls, the loop simply emits text — degraded but still functional.

## Sanity-check the active provider

```ts
import { info } from '@/lib/llm'
info()
// → { name: 'ollama', chat_model: 'qwen2.5-coder:7b', embedding_model: 'nomic-embed-text', base_url: 'http://localhost:11434', api_key_present: true, embeddings_available: true }
```
