"""
Thin Azure OpenAI client (chat + embeddings) for the scraper.

Env (root .env):
    AZURE_OPENAI_ENDPOINT             https://<resource>.openai.azure.com
    AZURE_OPENAI_API_KEY              ...
    AZURE_OPENAI_DEPLOYMENT           chat deployment name (e.g. gpt-5-mini, gpt-4o-mini)
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT embedding deployment (e.g. text-embedding-3-small)
    AZURE_OPENAI_API_VERSION          default 2025-04-01-preview
"""

from __future__ import annotations

import os
import json
import time
import requests

from typing import Optional


def _config() -> dict:
    return {
        "endpoint":  (os.environ.get("AZURE_OPENAI_ENDPOINT") or "").rstrip("/"),
        "api_key":   os.environ.get("AZURE_OPENAI_API_KEY", ""),
        "chat":      os.environ.get("AZURE_OPENAI_DEPLOYMENT", ""),
        "embed":     os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small"),
        "version":   os.environ.get("AZURE_OPENAI_API_VERSION", "2025-04-01-preview"),
    }


class AzureOpenAIError(RuntimeError):
    pass


def _post_with_retry(url: str, headers: dict, payload: dict, *, timeout: int = 90, retries: int = 4) -> dict:
    """POST with exponential backoff on 429/5xx. Returns parsed JSON or raises."""
    last_status = 0
    last_text = ""
    for attempt in range(retries):
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
        last_status = resp.status_code
        last_text = resp.text[:600]
        if resp.status_code < 400:
            try:
                return resp.json()
            except ValueError as exc:
                raise AzureOpenAIError(f"Non-JSON response: {last_text}") from exc
        if resp.status_code in (429,) or resp.status_code >= 500:
            wait = (2 ** attempt) + (0.25 * attempt)
            time.sleep(wait)
            continue
        raise AzureOpenAIError(f"HTTP {resp.status_code}: {last_text}")
    raise AzureOpenAIError(f"Exhausted retries (last HTTP {last_status}): {last_text}")


def chat_json(
    system: str,
    user: str,
    *,
    max_tokens: int = 4000,
    temperature: Optional[float] = None,
) -> dict:
    """Chat call constrained to JSON object output.

    Some Azure deployments (gpt-5/o1 reasoning) reject `temperature`; we omit
    it unless the caller passes one explicitly.
    """
    cfg = _config()
    if not cfg["endpoint"] or not cfg["api_key"] or not cfg["chat"]:
        raise AzureOpenAIError(
            "Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT, "
            "AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT in .env."
        )

    url = f"{cfg['endpoint']}/openai/deployments/{cfg['chat']}/chat/completions?api-version={cfg['version']}"
    payload = {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    if temperature is not None:
        payload["temperature"] = temperature

    body = _post_with_retry(url, {"api-key": cfg["api_key"], "Content-Type": "application/json"}, payload)
    content = (body.get("choices") or [{}])[0].get("message", {}).get("content")
    finish = (body.get("choices") or [{}])[0].get("finish_reason")
    if not content:
        if finish == "length":
            raise AzureOpenAIError("Hit token budget before producing output. Increase max_tokens.")
        raise AzureOpenAIError(f"Empty response: {json.dumps(body)[:400]}")

    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise AzureOpenAIError(f"Model returned non-JSON despite json_object format: {content[:400]}") from exc


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a batch of strings. Returns list of vectors (1536-d for text-embedding-3-small)."""
    if not texts:
        return []
    cfg = _config()
    if not cfg["endpoint"] or not cfg["api_key"] or not cfg["embed"]:
        raise AzureOpenAIError(
            "Azure OpenAI embedding not configured. Set AZURE_OPENAI_EMBEDDING_DEPLOYMENT in .env."
        )

    url = f"{cfg['endpoint']}/openai/deployments/{cfg['embed']}/embeddings?api-version={cfg['version']}"
    body = _post_with_retry(
        url,
        {"api-key": cfg["api_key"], "Content-Type": "application/json"},
        {"input": texts},
    )
    data = body.get("data") or []
    if len(data) != len(texts):
        raise AzureOpenAIError(f"Embedding count mismatch: sent {len(texts)} got {len(data)}")
    return [d["embedding"] for d in data]
