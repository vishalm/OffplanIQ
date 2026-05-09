"""
Backwards-compatibility shim. The scraper used to import chat_json /
embed_batch / AzureOpenAIError directly from this module. Keep that surface
identical and route every call through the new provider-agnostic facade in
apps/scraper/lib/llm.py.

Setting LLM_PROVIDER=ollama (the default) instantly switches every caller
to local inference. LLM_PROVIDER=azure restores the prior behaviour.

See docs/llm-providers.md for the full configuration matrix.
"""

from __future__ import annotations

from .llm import (
    LlmError as AzureOpenAIError,
    chat_json,
    embed_batch,
    chat_provider_configured,
    embedding_provider_configured,
    provider_info,
)

__all__ = [
    "AzureOpenAIError",
    "chat_json",
    "embed_batch",
    "chat_provider_configured",
    "embedding_provider_configured",
    "provider_info",
]
