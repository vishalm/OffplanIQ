"""
LLM-driven structured extraction.

Takes raw text (HTML-stripped page content or PDF text) and asks Azure OpenAI
to return a JSON object conforming to our project schema. Schema is intentionally
narrow — just the fields the dashboard actually surfaces, plus a per-field
`_confidence` so we can gate low-confidence values into a review queue later.
"""

from __future__ import annotations

import json
import re
from typing import Optional

from .azure_openai import chat_json, AzureOpenAIError


# Keep the prompt deterministic and field-list-driven so changes are auditable.
SYSTEM_PROMPT = """You are a UAE off-plan property data extractor.

Given raw text from a developer's marketing material (brochure, project page,
factsheet), extract a strict JSON object describing every distinct project
mentioned. Be conservative: omit a field if not stated explicitly.

Output schema (return JSON object exactly matching this shape):

{
  "developer_name": string | null,
  "projects": [
    {
      "name":             string,                    // canonical project name
      "area":             string | null,             // sub-community: 'Dubai Hills Estate', 'Business Bay'
      "city":             string | null,             // emirate: 'Dubai', 'Abu Dhabi'
      "total_units":      integer | null,            // overall unit count if stated
      "unit_types":       string[],                  // canonical from {studio,1br,2br,3br,4br,5br,penthouse,villa,townhouse,duplex}
      "min_price_aed":    integer | null,            // smallest unit price in AED, no decimals
      "max_price_aed":    integer | null,
      "starting_psf_aed": integer | null,            // 'starting from X AED/sqft' if stated
      "handover_quarter": string | null,             // 'Q3 2027' format
      "handover_date":    string | null,             // 'YYYY-MM-DD' if a specific date is given
      "launch_date":      string | null,             // 'YYYY-MM-DD' if mentioned
      "total_floors":     integer | null,
      "amenities":        string[],                  // pool, gym, beach, golf, ...
      "payment_plan":     string | null,             // free-text summary, e.g. '20% on booking, 50% on construction, 30% on handover'
      "description":      string | null              // 1-3 sentence project blurb
    }
  ]
}

RULES:
- Numbers: integers only, no commas. AED only (convert if labelled in millions).
- If multiple projects appear in one source, list them all.
- If the source is for a single project but mentions sister projects, include only the primary one.
- Omit fields you are not confident about. Empty arrays for amenities/unit_types if unsure.
- Never invent values; an empty/null field is correct when the source is silent.
"""


def _clip(text: str, max_chars: int = 60_000) -> str:
    """Hard-cap the text to keep the request under context window. We pull from
    the start (brochures lead with the most useful summary)."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars]


def _normalise_unit_types(values: list) -> list[str]:
    canon = {
        "studio", "1br", "2br", "3br", "4br", "5br",
        "penthouse", "villa", "townhouse", "duplex",
    }
    seen: list[str] = []
    for v in values or []:
        if not isinstance(v, str):
            continue
        v = v.strip().lower().replace(" ", "")
        # Common variants
        v = re.sub(r"^(\d+)bedroom$", r"\1br", v)
        v = re.sub(r"^(\d+)b/?r$", r"\1br", v)
        if v in canon and v not in seen:
            seen.append(v)
    return seen


def _coerce_int(value) -> Optional[int]:
    if value in (None, "", "null"):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        s = value.replace(",", "").strip()
        if not s:
            return None
        try:
            return int(float(s))
        except ValueError:
            return None
    return None


def _coerce_str(value) -> Optional[str]:
    if value in (None, "", "null"):
        return None
    if isinstance(value, str):
        return value.strip() or None
    return None


def extract_projects(raw_text: str) -> dict:
    """Run the LLM extractor on raw text. Returns normalised dict.

    Returns shape:
        {"developer_name": str|None, "projects": [project_dicts...]}

    Where each project_dict has the schema fields above, with strings/ints
    normalised. Never returns None. Returns {"projects": []} on extractor error.
    """
    if not raw_text or len(raw_text.strip()) < 200:
        return {"developer_name": None, "projects": []}

    try:
        result = chat_json(SYSTEM_PROMPT, _clip(raw_text), max_tokens=4000)
    except AzureOpenAIError as exc:
        print(f"  LLM extract error: {exc}")
        return {"developer_name": None, "projects": []}

    out_projects: list[dict] = []
    for p in (result.get("projects") or []):
        if not isinstance(p, dict):
            continue
        name = _coerce_str(p.get("name"))
        if not name:
            continue
        out_projects.append({
            "name": name,
            "area": _coerce_str(p.get("area")),
            "city": _coerce_str(p.get("city")),
            "total_units": _coerce_int(p.get("total_units")),
            "unit_types": _normalise_unit_types(p.get("unit_types", [])),
            "min_price_aed": _coerce_int(p.get("min_price_aed")),
            "max_price_aed": _coerce_int(p.get("max_price_aed")),
            "starting_psf_aed": _coerce_int(p.get("starting_psf_aed")),
            "handover_quarter": _coerce_str(p.get("handover_quarter")),
            "handover_date": _coerce_str(p.get("handover_date")),
            "launch_date": _coerce_str(p.get("launch_date")),
            "total_floors": _coerce_int(p.get("total_floors")),
            "amenities": [a for a in (p.get("amenities") or []) if isinstance(a, str)],
            "payment_plan": _coerce_str(p.get("payment_plan")),
            "description": _coerce_str(p.get("description")),
        })

    return {
        "developer_name": _coerce_str(result.get("developer_name")),
        "projects": out_projects,
    }
