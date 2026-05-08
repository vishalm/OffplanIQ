"""
Generic link classifier — given (href, anchor_text, surrounding_context),
predict whether the link is a project-detail page, a brochure/PDF, or noise.

Strategy:
  1. Cheap heuristics first (URL + anchor regexes). Most links classify here.
  2. LLM fallback only for ambiguous batches — keeps cost bounded.

This lets `developer_intelligence.py` work on developer sites we have NOT
hand-coded path regexes for. Used to extend Phase 1's 10-developer registry
to arbitrary UAE developers.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Iterable, Optional
from urllib.parse import urlparse

from .azure_openai import chat_json, AzureOpenAIError


@dataclass
class Link:
    href: str
    text: str                 # anchor inner text
    context: str = ""         # short surrounding text, for LLM disambiguation


CLASS_PROJECT  = "project_page"
CLASS_BROCHURE = "brochure"
CLASS_NOISE    = "noise"

# ─── Heuristics ──────────────────────────────────────────────
_PDF_RE          = re.compile(r"\.pdf(?:[?#]|$)", re.IGNORECASE)
_BROCHURE_TOK    = re.compile(r"\b(brochure|factsheet|fact[\-_ ]sheet|spec[\-_ ]?sheet|prospectus|payment[\-_ ]plan)\b", re.IGNORECASE)
_PROJECT_TOK     = re.compile(r"\b(project|new[\-_ ]?project|community|residence|tower|apartments?|villas?|townhouses?)\b", re.IGNORECASE)
_NOISE_PATH      = re.compile(r"^/(?:contact|about|careers?|blog|news|privacy|terms|legal|sitemap|search|press|media|gallery|investor[s]?[/\-_]relations?|cookies)(?:/|$)", re.IGNORECASE)
_NOISE_ANCHOR    = re.compile(r"\b(home|sign[\-_ ]?in|register|login|menu|cart|wishlist|newsletter|subscribe)\b", re.IGNORECASE)
_PROJECT_PATH    = re.compile(r"/(?:projects?|properties|developments?|new[\-_ ]projects|communities|portfolio|our[\-_ ]projects)/[a-z0-9\-]+", re.IGNORECASE)


def heuristic_classify(link: Link) -> Optional[str]:
    """Return a class string when confident, else None (defer to LLM)."""
    href = (link.href or "").strip()
    text = (link.text or "").strip()
    if not href:
        return CLASS_NOISE

    path = urlparse(href).path or "/"

    # PDF brochures
    if _PDF_RE.search(href) or _BROCHURE_TOK.search(text):
        return CLASS_BROCHURE

    # Obvious noise paths/anchors
    if _NOISE_PATH.search(path) or _NOISE_ANCHOR.search(text):
        return CLASS_NOISE

    # Single-segment static pages: /, /about, /home, /menu — noise.
    if len(path.strip("/").split("/")) <= 1 and not _PROJECT_PATH.search(path):
        return CLASS_NOISE

    # Project paths — the segment after /projects, /properties, etc.
    if _PROJECT_PATH.search(path):
        return CLASS_PROJECT

    # Long descriptive paths with a slug-looking last segment frequently are projects
    if path.count("/") >= 2 and re.search(r"/[a-z][a-z0-9\-]{4,}/?$", path, re.IGNORECASE):
        if _PROJECT_TOK.search(text) or _PROJECT_TOK.search(path):
            return CLASS_PROJECT

    return None


# ─── LLM fallback for ambiguous links ────────────────────────
_LLM_SYSTEM = """You classify links on a UAE property developer's website.

For each link, decide which of these categories it belongs to:
- "project_page":   detail page for a single off-plan/under-construction project
- "brochure":       PDF/factsheet/spec-sheet/prospectus for a project
- "noise":          anything else (about/contact/careers/blog/legal/login/etc)

Return STRICT JSON: {"classifications": ["project_page" | "brochure" | "noise", ...]}
The `classifications` array must have the same length and order as the input links.
"""


def llm_classify(links: list[Link]) -> list[str]:
    """Classify a batch of ambiguous links via LLM. Falls back to NOISE on error."""
    if not links:
        return []

    user_payload = json.dumps([
        {"href": l.href, "text": l.text[:120], "context": l.context[:200]}
        for l in links
    ])
    try:
        result = chat_json(_LLM_SYSTEM, user_payload, max_tokens=1200)
    except AzureOpenAIError as exc:
        print(f"  llm_classify error: {exc}")
        return [CLASS_NOISE] * len(links)

    classes = result.get("classifications") or []
    if not isinstance(classes, list) or len(classes) != len(links):
        return [CLASS_NOISE] * len(links)
    valid = {CLASS_PROJECT, CLASS_BROCHURE, CLASS_NOISE}
    return [c if c in valid else CLASS_NOISE for c in classes]


def classify_links(links: Iterable[Link], *, llm_batch_size: int = 25) -> dict[str, list[Link]]:
    """Classify a stream of links. Returns {class: [links]}.

    Heuristic-first; remaining ambiguous links are sent to the LLM in batches.
    """
    buckets: dict[str, list[Link]] = {CLASS_PROJECT: [], CLASS_BROCHURE: [], CLASS_NOISE: []}
    ambiguous: list[Link] = []

    for link in links:
        cls = heuristic_classify(link)
        if cls is None:
            ambiguous.append(link)
        else:
            buckets[cls].append(link)

    for i in range(0, len(ambiguous), llm_batch_size):
        batch = ambiguous[i : i + llm_batch_size]
        labels = llm_classify(batch)
        for link, label in zip(batch, labels):
            buckets[label].append(link)

    return buckets
