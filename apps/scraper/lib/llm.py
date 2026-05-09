"""
Provider-agnostic LLM client for the scraper.

Mirrors apps/web/lib/llm/ on the TS side. Default provider is local Ollama
so the scraper can run end-to-end without any cloud key. Switch via:

    LLM_PROVIDER=ollama        # default
    LLM_PROVIDER=azure
    LLM_PROVIDER=openai
    LLM_PROVIDER=openrouter

See docs/llm-providers.md for the full env reference.

Public surface:
    chat_json(system, user, *, max_tokens=4000, temperature=None) -> dict
    embed_batch(texts) -> list[list[float]]
    provider_info() -> dict
    chat_provider_configured() -> bool
    embedding_provider_configured() -> bool

The two callsites that matter — llm_extract.py and embeddings.py — only need
chat_json and embed_batch, which work identically across providers.
"""
from __future__ import annotations

import json
import os
import time
from typing import Optional

import requests


VALID_PROVIDERS = {"ollama", "azure", "openai", "openrouter"}


class LlmError(RuntimeError):
    """Raised on provider HTTP / parsing errors."""


# ─── Provider selection ─────────────────────────────────────

def chat_provider() -> str:
    v = (os.environ.get("LLM_PROVIDER") or "").strip().lower()
    return v if v in VALID_PROVIDERS else "ollama"


def embedding_provider() -> str:
    v = (os.environ.get("EMBEDDING_PROVIDER") or "").strip().lower()
    return v if v in VALID_PROVIDERS else chat_provider()


# ─── Per-provider configs ───────────────────────────────────

def _ollama_cfg() -> dict:
    return {
        "base_url":        (os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/"),
        "chat_model":       os.environ.get("OLLAMA_MODEL")            or "qwen2.5-coder:7b",
        "embedding_model":  os.environ.get("OLLAMA_EMBEDDING_MODEL")  or "nomic-embed-text",
    }


def _azure_cfg() -> dict:
    return {
        "endpoint":        (os.environ.get("AZURE_OPENAI_ENDPOINT") or "").rstrip("/"),
        "api_key":          os.environ.get("AZURE_OPENAI_API_KEY", ""),
        "chat_model":       os.environ.get("AZURE_OPENAI_DEPLOYMENT", ""),
        "embedding_model":  os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small"),
        "version":          os.environ.get("AZURE_OPENAI_API_VERSION", "2025-04-01-preview"),
    }


def _openai_cfg() -> dict:
    return {
        "api_key":          os.environ.get("OPENAI_API_KEY", ""),
        "base_url":        (os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/"),
        "chat_model":       os.environ.get("OPENAI_MODEL")           or "gpt-4o-mini",
        "embedding_model":  os.environ.get("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small",
    }


def _openrouter_cfg() -> dict:
    return {
        "api_key":          os.environ.get("OPENROUTER_API_KEY", ""),
        "base_url":        (os.environ.get("OPENROUTER_BASE_URL") or "https://openrouter.ai/api/v1").rstrip("/"),
        "chat_model":       os.environ.get("OPENROUTER_MODEL")           or "qwen/qwen-2.5-coder-7b-instruct",
        "embedding_model":  os.environ.get("OPENROUTER_EMBEDDING_MODEL") or "",
        "referer":          os.environ.get("OPENROUTER_REFERER")    or "https://offplaniq.com",
        "app_title":        os.environ.get("OPENROUTER_APP_TITLE")  or "OffplanIQ",
    }


def chat_provider_configured() -> bool:
    p = chat_provider()
    if p == "ollama":     return bool(_ollama_cfg()["base_url"])
    if p == "azure":      c = _azure_cfg();      return bool(c["endpoint"] and c["api_key"] and c["chat_model"])
    if p == "openai":     return bool(_openai_cfg()["api_key"])
    if p == "openrouter": return bool(_openrouter_cfg()["api_key"])
    return False


def embedding_provider_configured() -> bool:
    p = embedding_provider()
    if p == "ollama":     c = _ollama_cfg();     return bool(c["base_url"] and c["embedding_model"])
    if p == "azure":      c = _azure_cfg();      return bool(c["endpoint"] and c["api_key"] and c["embedding_model"])
    if p == "openai":     c = _openai_cfg();     return bool(c["api_key"] and c["embedding_model"])
    if p == "openrouter": c = _openrouter_cfg(); return bool(c["api_key"] and c["embedding_model"])
    return False


def provider_info() -> dict:
    p = chat_provider()
    cfg = {"ollama": _ollama_cfg, "azure": _azure_cfg, "openai": _openai_cfg, "openrouter": _openrouter_cfg}[p]()
    return {
        "name":           p,
        "chat_model":     cfg.get("chat_model", ""),
        "embedding_model": cfg.get("embedding_model") or None,
        "base_url":       cfg.get("base_url") or cfg.get("endpoint") or "",
        "embeddings_available": embedding_provider_configured(),
    }


# ─── HTTP helper ────────────────────────────────────────────

def _post_with_retry(url: str, headers: dict, payload: dict, *, timeout: int = 120, retries: int = 4) -> dict:
    last_status = 0
    last_text   = ""
    for attempt in range(retries):
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
        last_status = resp.status_code
        last_text = (resp.text or "")[:600]
        if resp.status_code < 400:
            try:
                return resp.json()
            except ValueError as exc:
                raise LlmError(f"Non-JSON response: {last_text}") from exc
        if resp.status_code == 429 or resp.status_code >= 500:
            time.sleep((2 ** attempt) + 0.25 * attempt)
            continue
        raise LlmError(f"HTTP {resp.status_code}: {last_text}")
    raise LlmError(f"Exhausted retries (last HTTP {last_status}): {last_text}")


# ─── Chat (JSON-mode) ───────────────────────────────────────

def chat_json(system: str, user: str, *, max_tokens: int = 4000, temperature: Optional[float] = None) -> dict:
    """Single-shot chat constrained to a JSON object response.

    Provider-agnostic. Returns a parsed dict or raises LlmError.
    """
    p = chat_provider()
    if p == "ollama":     return _chat_json_ollama(system, user, max_tokens=max_tokens, temperature=temperature)
    if p == "azure":      return _chat_json_azure(system, user, max_tokens=max_tokens, temperature=temperature)
    if p == "openai":     return _chat_json_openai(system, user, max_tokens=max_tokens, temperature=temperature, cfg=_openai_cfg())
    if p == "openrouter": return _chat_json_openai(system, user, max_tokens=max_tokens, temperature=temperature, cfg=_openrouter_cfg(), is_openrouter=True)
    raise LlmError(f"Unknown LLM_PROVIDER={p}")


def _chat_json_ollama(system: str, user: str, *, max_tokens: int, temperature: Optional[float]) -> dict:
    cfg = _ollama_cfg()
    payload = {
        "model":    cfg["chat_model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "stream":   False,
        "format":   "json",
        "options":  {
            "num_predict": max_tokens,
            "temperature": 0.2 if temperature is None else temperature,
        },
    }
    body = _post_with_retry(f"{cfg['base_url']}/api/chat", {"Content-Type": "application/json"}, payload)
    content = (body.get("message") or {}).get("content")
    if not content:
        raise LlmError(f"Ollama returned empty content: {json.dumps(body)[:300]}")
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise LlmError(f"Ollama returned non-JSON despite format=json: {content[:300]}") from exc


def _chat_json_azure(system: str, user: str, *, max_tokens: int, temperature: Optional[float]) -> dict:
    cfg = _azure_cfg()
    if not (cfg["endpoint"] and cfg["api_key"] and cfg["chat_model"]):
        raise LlmError("Azure not configured (set AZURE_OPENAI_ENDPOINT/API_KEY/DEPLOYMENT).")
    url = f"{cfg['endpoint']}/openai/deployments/{cfg['chat_model']}/chat/completions?api-version={cfg['version']}"
    payload = {
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    if temperature is not None:
        payload["temperature"] = temperature
    body = _post_with_retry(url, {"api-key": cfg["api_key"], "Content-Type": "application/json"}, payload)
    content = (body.get("choices") or [{}])[0].get("message", {}).get("content")
    if not content:
        raise LlmError(f"Azure returned empty content: {json.dumps(body)[:300]}")
    return json.loads(content)


def _chat_json_openai(system: str, user: str, *, max_tokens: int, temperature: Optional[float], cfg: dict, is_openrouter: bool = False) -> dict:
    if not cfg["api_key"]:
        raise LlmError(f"{'OpenRouter' if is_openrouter else 'OpenAI'} API key not set.")
    url = f"{cfg['base_url']}/chat/completions"
    payload = {
        "model":    cfg["chat_model"],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    if temperature is not None:
        payload["temperature"] = temperature
    headers = {"Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json"}
    if is_openrouter:
        headers["HTTP-Referer"] = cfg.get("referer", "")
        headers["X-Title"]      = cfg.get("app_title", "")
    body = _post_with_retry(url, headers, payload)
    content = (body.get("choices") or [{}])[0].get("message", {}).get("content")
    if not content:
        raise LlmError(f"OpenAI-compatible returned empty content: {json.dumps(body)[:300]}")
    return json.loads(content)


# ─── Embeddings ─────────────────────────────────────────────

def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a batch of strings. Provider-agnostic."""
    if not texts:
        return []
    p = embedding_provider()
    if p == "ollama":     return _embed_ollama(texts)
    if p == "azure":      return _embed_openai_compat(texts, cfg=_azure_cfg(), is_azure=True)
    if p == "openai":     return _embed_openai_compat(texts, cfg=_openai_cfg())
    if p == "openrouter": return _embed_openai_compat(texts, cfg=_openrouter_cfg())
    raise LlmError(f"Unknown EMBEDDING_PROVIDER={p}")


def _embed_ollama(texts: list[str]) -> list[list[float]]:
    cfg = _ollama_cfg()
    if not cfg["embedding_model"]:
        raise LlmError("OLLAMA_EMBEDDING_MODEL not set. Try `ollama pull nomic-embed-text`.")
    # /api/embed (newer): supports batched `input`. Fall back to /api/embeddings (singular `prompt`) if missing.
    out: list[list[float]] = []
    try:
        body = _post_with_retry(
            f"{cfg['base_url']}/api/embed",
            {"Content-Type": "application/json"},
            {"model": cfg["embedding_model"], "input": texts},
        )
        embeddings = body.get("embeddings")
        if isinstance(embeddings, list) and len(embeddings) == len(texts):
            return embeddings
    except LlmError:
        pass    # try the legacy endpoint
    for t in texts:
        body = _post_with_retry(
            f"{cfg['base_url']}/api/embeddings",
            {"Content-Type": "application/json"},
            {"model": cfg["embedding_model"], "prompt": t},
        )
        vec = body.get("embedding")
        if not isinstance(vec, list):
            raise LlmError(f"Ollama /api/embeddings returned no vector: {json.dumps(body)[:200]}")
        out.append(vec)
    return out


def _embed_openai_compat(texts: list[str], *, cfg: dict, is_azure: bool = False) -> list[list[float]]:
    if is_azure:
        if not (cfg["endpoint"] and cfg["api_key"] and cfg["embedding_model"]):
            raise LlmError("Azure embeddings not configured.")
        url = f"{cfg['endpoint']}/openai/deployments/{cfg['embedding_model']}/embeddings?api-version={cfg['version']}"
        headers = {"api-key": cfg["api_key"], "Content-Type": "application/json"}
        payload = {"input": texts}
    else:
        if not (cfg["api_key"] and cfg["embedding_model"]):
            raise LlmError("OpenAI-compatible embeddings not configured.")
        url = f"{cfg['base_url']}/embeddings"
        headers = {"Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json"}
        payload = {"model": cfg["embedding_model"], "input": texts}

    body = _post_with_retry(url, headers, payload)
    data = body.get("data") or []
    if len(data) != len(texts):
        raise LlmError(f"Embedding count mismatch: sent {len(texts)} got {len(data)}")
    return [d["embedding"] for d in data]
