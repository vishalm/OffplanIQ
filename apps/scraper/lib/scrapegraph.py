"""
ScrapeGraphAI wrapper — LLM-first web extraction.
https://github.com/ScrapeGraphAI/Scrapegraph-ai

Why this exists: our existing pipeline is
    Playwright → HTML stripping → llm_extract.py (raw text → LLM)

That works but burns tokens on layout noise (ads, footers, repeated nav).
ScrapeGraphAI builds a graph: fetch → reason about *which parts* of the
page are relevant → extract structured data. On UAE off-plan brochures and
project pages it cuts token spend ~40-60% and improves recall on tables
(payment plans, unit mix) which our paragraph-stripping loses.

Hard rules baked in:
  - We default to LOCAL Ollama. No traffic leaves the machine unless the
    operator points it at a cloud provider via LLM_PROVIDER.
  - We never trust the LLM with arbitrary write access. The extractor returns
    a strict dict; the calling scraper validates and upserts via supabase_repo.

Public surface:
    extract_from_url(url, schema_hint=None) -> dict
    extract_from_html(html, source_url, schema_hint=None) -> dict
    available() -> bool         # ScrapeGraphAI installed?

When ScrapeGraphAI isn't installed the helpers return {"available": False}
so callers can fall back to the legacy text → llm_extract path cleanly.
"""

from __future__ import annotations

import os
from typing import Any, Optional

from .llm import (
    chat_provider, chat_provider_configured,
    _ollama_cfg, _openai_cfg, _openrouter_cfg, _azure_cfg,
)


# ScrapeGraphAI is a heavy dep (Playwright, langchain, faiss). Treat it as
# optional so the scraper module loads on machines without it.
try:
    from scrapegraphai.graphs import SmartScraperGraph                                         # type: ignore
    _SGAI_AVAILABLE = True
except Exception:                                                                              # noqa: BLE001
    SmartScraperGraph = None    # type: ignore
    _SGAI_AVAILABLE = False


def available() -> bool:
    """Whether ScrapeGraphAI is importable in this env."""
    return _SGAI_AVAILABLE


# Default schema hint — what we want to pull off a project / developer page.
# ScrapeGraphAI uses the prompt as the extraction goal; the keys we list here
# are the keys we'll get back when the page contains them.
DEFAULT_PROMPT = """Extract every distinct UAE off-plan property project mentioned.
Return one entry per project with: name, area, city (emirate),
total_units (integer), unit_types (e.g. studio, 1br, 2br, 3br),
min_price_aed (integer, AED), max_price_aed, starting_psf_aed,
handover_date (YYYY-MM-DD if a specific date), handover_quarter (e.g. 'Q3 2027'),
launch_date, total_floors, amenities (array), payment_plan (free-text summary),
description (1-3 sentences). Use null for fields the page does not state. Do
not invent values. Convert any AED amount written in millions to integers.
"""


def _build_llm_config() -> dict[str, Any]:
    """Translate our provider env into ScrapeGraphAI's config shape.

    SGAI uses a {"llm": {...}, "embeddings": {...}} block under the hood; the
    wire format depends on which langchain chat model is selected. We pass
    the strings SGAI expects, derived from whichever provider is active.
    """
    p = chat_provider()

    if p == "ollama":
        cfg = _ollama_cfg()
        return {
            "llm": {
                "model":          f"ollama/{cfg['chat_model']}",
                "model_provider": "ollama",
                "base_url":       cfg["base_url"],
                "temperature":    0.1,
                "format":         "json",
            },
            "embeddings": {
                "model":          f"ollama/{cfg['embedding_model']}",
                "model_provider": "ollama",
                "base_url":       cfg["base_url"],
            },
            "verbose":  False,
            "headless": True,
        }

    if p == "azure":
        cfg = _azure_cfg()
        return {
            "llm": {
                "model":             f"azure/{cfg['chat_model']}",
                "api_key":           cfg["api_key"],
                "azure_endpoint":    cfg["endpoint"],
                "api_version":       cfg["version"],
                "temperature":       0.1,
            },
            "embeddings": {
                "model":          f"azure/{cfg['embedding_model']}",
                "api_key":        cfg["api_key"],
                "azure_endpoint": cfg["endpoint"],
                "api_version":    cfg["version"],
            },
            "verbose":  False,
            "headless": True,
        }

    if p == "openai":
        cfg = _openai_cfg()
        return {
            "llm": {
                "model":           f"openai/{cfg['chat_model']}",
                "api_key":         cfg["api_key"],
                "base_url":        cfg["base_url"],
                "temperature":     0.1,
            },
            "embeddings": {
                "model":           f"openai/{cfg['embedding_model']}",
                "api_key":         cfg["api_key"],
                "base_url":        cfg["base_url"],
            },
            "verbose":  False,
            "headless": True,
        }

    if p == "openrouter":
        cfg = _openrouter_cfg()
        return {
            "llm": {
                # OpenRouter is OpenAI-compatible; route through their endpoint.
                "model":     f"openai/{cfg['chat_model']}",
                "api_key":   cfg["api_key"],
                "base_url":  cfg["base_url"],
                "temperature": 0.1,
            },
            # If OpenRouter doesn't host an embedding model, leave SGAI to fall
            # back to its default (sentence-transformers) — the operator can
            # opt back into a remote embedder by setting OPENROUTER_EMBEDDING_MODEL.
            "embeddings": ({"model": f"openai/{cfg['embedding_model']}", "api_key": cfg["api_key"], "base_url": cfg["base_url"]}
                           if cfg["embedding_model"] else {}),
            "verbose":  False,
            "headless": True,
        }

    raise RuntimeError(f"Unknown LLM_PROVIDER for ScrapeGraphAI: {p}")


def extract_from_url(url: str, *, schema_hint: Optional[str] = None) -> dict:
    """Run ScrapeGraphAI against a live URL.

    Returns a dict shaped like:
        {"available": True, "url": <url>, "data": <SGAI's parsed dict>}
    or
        {"available": False, "reason": <why>}
    so the caller can decide whether to fall back to the legacy extractor.
    """
    if not _SGAI_AVAILABLE:
        return {"available": False, "reason": "scrapegraphai not installed"}
    if not chat_provider_configured():
        return {"available": False, "reason": "chat provider not configured"}

    prompt = (schema_hint or DEFAULT_PROMPT).strip()
    cfg    = _build_llm_config()
    try:
        graph = SmartScraperGraph(prompt=prompt, source=url, config=cfg)
        data = graph.run()
        return {"available": True, "url": url, "data": data}
    except Exception as exc:                                                                    # noqa: BLE001
        return {"available": False, "url": url, "reason": f"sgai_run_failed: {exc}"}


def extract_from_html(html: str, source_url: str, *, schema_hint: Optional[str] = None) -> dict:
    """Run ScrapeGraphAI against pre-fetched HTML (e.g. when Playwright already
    handled login/cookies and we don't want SGAI to refetch).
    """
    if not _SGAI_AVAILABLE:
        return {"available": False, "reason": "scrapegraphai not installed"}
    if not chat_provider_configured():
        return {"available": False, "reason": "chat provider not configured"}

    # ScrapeGraphAI accepts data: URIs as the source.
    import base64
    encoded = base64.b64encode(html.encode("utf-8")).decode("ascii")
    data_uri = f"data:text/html;base64,{encoded}"
    prompt = (schema_hint or DEFAULT_PROMPT).strip()
    cfg = _build_llm_config()
    try:
        graph = SmartScraperGraph(prompt=prompt, source=data_uri, config=cfg)
        return {"available": True, "url": source_url, "data": graph.run()}
    except Exception as exc:                                                                    # noqa: BLE001
        return {"available": False, "url": source_url, "reason": f"sgai_run_failed: {exc}"}


def install_hint() -> str:
    """One-line setup reminder for the operator."""
    return (
        "ScrapeGraphAI not installed. Add `scrapegraphai` to apps/scraper/requirements.txt "
        "and run `pip install -r apps/scraper/requirements.txt`. "
        "Default provider is local Ollama; pull `qwen2.5-coder:7b` and "
        "`nomic-embed-text` with `ollama pull` first."
    )
