"""
ScrapeGraphAI-powered project extractor.

Usage:
    python -m apps.scraper.scrapers.sgai_extract https://emaar.com/properties/...
    python -m apps.scraper.scrapers.sgai_extract --file path/to/saved.html

Pipeline:
    1. ScrapeGraphAI fetches the page (or accepts pre-fetched HTML), reasons
       about which DOM regions are project facts vs. boilerplate, and extracts
       a strict JSON object using the configured LLM (default: local Ollama
       qwen2.5-coder:7b).
    2. We normalise the result through the same _coerce_* helpers as
       llm_extract.py so the downstream upsert path is unchanged.
    3. If ScrapeGraphAI isn't available OR the LLM provider isn't configured,
       we fall back to the legacy text-strip + llm_extract path.

Why this is worth it:
    - Brochures and project pages have lots of layout noise (sticky CTAs,
      footer trust badges, repeated nav). SGAI's graph reasoning trims the
      input the LLM ever sees, cutting tokens 40-60%.
    - Tables (payment plans, unit mix grids) get extracted properly instead
      of being lost to whitespace stripping.
    - Same provider switch as the rest of the app (LLM_PROVIDER), so a
      developer with a free Ollama install can run the whole pipeline locally.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from ..lib import scrapegraph
from ..lib.llm_extract import extract_projects as legacy_extract
from ..lib.llm_extract import _coerce_int, _coerce_str, _normalise_unit_types


def _normalise_sgai_result(raw: object) -> dict:
    """Coerce SGAI's free-form output into the same shape llm_extract returns.

    SGAI returns whatever the model emitted. Most often a list of project
    dicts directly, sometimes wrapped in {"projects": [...]} or
    {"developer_name": ..., "projects": [...]}. We accept any of those.
    """
    developer_name: Optional[str] = None
    projects_in: list = []

    if isinstance(raw, dict):
        developer_name = _coerce_str(raw.get("developer_name") or raw.get("developer"))
        if isinstance(raw.get("projects"), list):
            projects_in = raw["projects"]
        elif "name" in raw:
            # SGAI returned a single project dict at the top level.
            projects_in = [raw]
    elif isinstance(raw, list):
        projects_in = raw

    out: list[dict] = []
    for p in projects_in:
        if not isinstance(p, dict):
            continue
        name = _coerce_str(p.get("name"))
        if not name:
            continue
        out.append({
            "name": name,
            "area": _coerce_str(p.get("area")),
            "city": _coerce_str(p.get("city")),
            "total_units":      _coerce_int(p.get("total_units")),
            "unit_types":       _normalise_unit_types(p.get("unit_types") or []),
            "min_price_aed":    _coerce_int(p.get("min_price_aed") or p.get("min_price")),
            "max_price_aed":    _coerce_int(p.get("max_price_aed") or p.get("max_price")),
            "starting_psf_aed": _coerce_int(p.get("starting_psf_aed") or p.get("psf")),
            "handover_quarter": _coerce_str(p.get("handover_quarter")),
            "handover_date":    _coerce_str(p.get("handover_date")),
            "launch_date":      _coerce_str(p.get("launch_date")),
            "total_floors":     _coerce_int(p.get("total_floors")),
            "amenities":        [a for a in (p.get("amenities") or []) if isinstance(a, str)],
            "payment_plan":     _coerce_str(p.get("payment_plan")),
            "description":      _coerce_str(p.get("description")),
        })

    return {"developer_name": developer_name, "projects": out}


def extract_from_url(url: str) -> dict:
    """Try ScrapeGraphAI first, fall back to legacy text-strip if it isn't available."""
    sgai_result = scrapegraph.extract_from_url(url)
    if sgai_result.get("available"):
        return _normalise_sgai_result(sgai_result.get("data"))
    print(f"  [sgai] {sgai_result.get('reason')} — falling back to legacy extractor")
    raw = _fetch_html(url)
    if not raw:
        return {"developer_name": None, "projects": []}
    text = _html_to_text(raw)
    return legacy_extract(text)


def extract_from_file(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    sgai_result = scrapegraph.extract_from_html(raw, source_url=str(path))
    if sgai_result.get("available"):
        return _normalise_sgai_result(sgai_result.get("data"))
    print(f"  [sgai] {sgai_result.get('reason')} — falling back to legacy extractor")
    return legacy_extract(_html_to_text(raw))


def _fetch_html(url: str) -> Optional[str]:
    try:
        import requests
        resp = requests.get(url, timeout=60, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
        })
        if resp.status_code == 200 and resp.text:
            return resp.text
        print(f"  fetch failed: HTTP {resp.status_code}")
    except Exception as exc:                                                                    # noqa: BLE001
        print(f"  fetch error: {exc}")
    return None


def _html_to_text(html: str) -> str:
    """Cheap HTML → text. Same heuristic the legacy scraper uses."""
    import re
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>",  " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;|&amp;|&quot;|&#39;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _main() -> int:
    parser = argparse.ArgumentParser(description="ScrapeGraphAI-powered project extractor")
    parser.add_argument("source", nargs="?", help="URL to scrape, or - to read HTML from stdin")
    parser.add_argument("--file", type=Path, help="Path to a saved HTML file to extract from")
    args = parser.parse_args()

    if args.file:
        result = extract_from_file(args.file)
    elif args.source and args.source != "-":
        result = extract_from_url(args.source)
    else:
        html = sys.stdin.read()
        sgai_result = scrapegraph.extract_from_html(html, source_url="stdin")
        result = (_normalise_sgai_result(sgai_result.get("data"))
                  if sgai_result.get("available")
                  else legacy_extract(_html_to_text(html)))

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
