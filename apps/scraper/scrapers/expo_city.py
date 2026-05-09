"""
Expo City Dubai scraper.

Reads https://www.expocitydubai.com/en/expo-living/ and its sub-pages,
extracts every off-plan residential project, and upserts via supabase_repo.

Why a hand-curated module instead of a generic crawler:
    - The marketing site is JS-heavy SPA; a server-side fetch sees an empty
      shell. The pricing / handover details live in client-rendered widgets
      that are flaky to drive without Playwright + a long wait-for-network-idle.
    - We *do* know the project list, slugs, districts, and unit types from
      the index page. Curating those facts as a constant gives us a stable
      90% answer immediately and lets the recrawl path enrich the rest
      (price, handover, full unit mix) when the page yields.

Run:
    python -m apps.scraper.scrapers.expo_city
or with a richer detail-page enricher (Playwright + LLM extract):
    python -m apps.scraper.scrapers.expo_city --enrich

The --enrich pass is best-effort: if Playwright or Ollama isn't available,
the script still upserts the curated baseline so the projects exist in
/search the moment you run it.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Optional

# Load the repo-root .env BEFORE importing supabase_repo (which reads env at
# import time). Local-dev convenience — Railway / CI inject env directly so
# this is a no-op there.
try:
    from dotenv import load_dotenv
    _ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"
    if _ROOT_ENV.is_file():
        load_dotenv(_ROOT_ENV)
except ImportError:
    pass

from ..lib import supabase_repo as repo


DEVELOPER_NAME = "Expo City Dubai"
DEVELOPER_SLUG = "expo-city-dubai"
DEVELOPER_URL  = "https://www.expocitydubai.com/"

# District constants — Expo City's master plan splits into named neighbourhoods.
# Centralised here so a future rename or split (e.g. "Expo Central" carved out
# of "Expo City") only touches one line.
AREA_EXPO_CITY   = "Expo City"
AREA_EXPO_VALLEY = "Expo Valley"
AREA_EXPO_FIELDS = "Expo Fields"
CITY_DUBAI       = "Dubai"


# Canonical baseline derived from the public expo-living index + each detail
# page's <title>/<meta>. The recrawl pass enriches price / handover / amenities
# from the rendered page; this constant is the never-empty floor.
CURATED_PROJECTS: list[dict] = [
    {
        "name":             "Sidr Residences",
        "area":             AREA_EXPO_CITY,
        "city":             CITY_DUBAI,
        "unit_types":       ["1br", "2br", "3br"],
        "description":      "Sidr Residences sits at the heart of Expo City Dubai's master plan — apartments designed around walkable courtyards and the Expo legacy parks.",
        "page_url":         "https://www.expocitydubai.com/en/expo-living/sidr-residences/",
    },
    {
        "name":             "Maha Villas",
        "area":             AREA_EXPO_VALLEY,
        "city":             CITY_DUBAI,
        "unit_types":       ["villa"],
        "description":      "Five-bedroom villas in Expo Valley — Expo City Dubai's first villa community, set against natural landscaping and the cycling spine.",
        "page_url":         "https://www.expocitydubai.com/en/expo-living/expo-valley/maha-villas/",
    },
    {
        "name":             "Yasmina Villas",
        "area":             AREA_EXPO_VALLEY,
        "city":             CITY_DUBAI,
        "unit_types":       ["villa", "townhouse"],
        "min_price_aed":    6_100_000,
        "description":      "Mixed villa-and-townhouse community in Expo Valley, marketed at families looking for sustainable low-rise living adjacent to Expo Central Park.",
        "page_url":         "https://www.expocitydubai.com/en/expo-living/expo-valley/yasmina-villas-at-expo-valley/",
    },
    {
        "name":             "Al Waha Residences",
        "area":             AREA_EXPO_FIELDS,
        "city":             CITY_DUBAI,
        "description":      "Signature residences at Expo Fields — Expo City Dubai's premium-positioned apartment line, centred on the Expo events boulevard.",
        "handover_quarter": "Q2 2027",
        "page_url":         "https://www.expocitydubai.com/en/al-waha/",
    },
    {
        "name":             "Expo Valley Views",
        "area":             AREA_EXPO_VALLEY,
        "city":             CITY_DUBAI,
        "unit_types":       ["1br", "2br", "3br"],
        "handover_date":    "2029-10-31",
        "description":      "One-, two- and three-bedroom apartments overlooking Expo Valley — Expo City Dubai positions this release as the next chapter of its sustainable-living district.",
        "page_url":         "https://www.expocitydubai.com/en/expo-living/expo-valley/expo-valley-views/",
    },
    {
        "name":             "Shamsa Townhouses",
        "area":             AREA_EXPO_VALLEY,
        "city":             CITY_DUBAI,
        "unit_types":       ["townhouse"],
        "description":      "Townhouse cluster in Expo Valley, positioned for end-users looking for low-rise townhome living inside Expo City's master plan.",
        "page_url":         "https://www.expocitydubai.com/en/expo-living/expo-valley/shamsa-townhouses/",
    },
    {
        "name":             "Sky Residences",
        "area":             AREA_EXPO_CITY,
        "city":             CITY_DUBAI,
        "description":      "Luxury apartment release within Expo City Dubai's Expo Living portfolio — high-floor inventory marketed at investors.",
        "page_url":         "https://www.expocitydubai.com/en/expo-living/sky-residences/",
    },
    {
        "name":             "Mangrove Residences",
        "area":             AREA_EXPO_CITY,
        "city":             CITY_DUBAI,
        "unit_types":       ["1br", "2br", "3br", "4br"],
        "description":      "1-to-4-bedroom apartments by Expo City Dubai — \"distinctive residences\" line within the broader Expo Living masterplan.",
        "page_url":         "https://www.expocitydubai.com/en/expo-living/mangrove-residences/",
    },
]


def _normalise(p: dict) -> dict:
    """Turn the curated dict into the shape supabase_repo.upsert_project expects."""
    return {
        "name":             p["name"],
        "area":             p.get("area"),
        "city":             p.get("city") or "Dubai",
        "total_units":      p.get("total_units"),
        "total_floors":     p.get("total_floors"),
        "unit_types":       p.get("unit_types"),
        "min_price_aed":    p.get("min_price_aed"),
        "max_price_aed":    p.get("max_price_aed"),
        "starting_psf_aed": p.get("starting_psf_aed"),
        "handover_quarter": p.get("handover_quarter"),
        "handover_date":    p.get("handover_date"),
        "launch_date":      p.get("launch_date"),
        "amenities":        p.get("amenities"),
        "payment_plan":     p.get("payment_plan"),
        "description":      p.get("description"),
    }


def _try_enrich_via_sgai(project: dict) -> dict:
    """Best-effort: ask ScrapeGraphAI to read the page and overlay any new
    facts (price, handover) onto the curated baseline. Falls through silently
    when SGAI isn't installed."""
    try:
        from ..lib import scrapegraph
    except Exception:                                                                            # noqa: BLE001
        return project
    if not scrapegraph.available():
        return project
    url = project.get("page_url")
    if not url:
        return project
    print(f"  [sgai] enriching {project['name']}…")
    out = scrapegraph.extract_from_url(url)
    if not out.get("available"):
        print(f"  [sgai] {out.get('reason')} — keeping curated baseline")
        return project
    data = out.get("data") or {}
    if isinstance(data, list):
        data = (data or [{}])[0] or {}

    # Overlay non-null fields from the LLM extraction onto the curated row.
    # Curated values "win" only when the page didn't volunteer a value — so
    # if Expo City updates a price tomorrow, the recrawl picks it up.
    for key in ("min_price_aed", "max_price_aed", "starting_psf_aed",
                "handover_quarter", "handover_date", "launch_date",
                "total_units", "total_floors", "unit_types", "amenities",
                "payment_plan"):
        v = data.get(key)
        if v not in (None, "", []):
            project[key] = v
    return project


def run(*, enrich: bool = False) -> int:
    if not repo.configured():
        print("Supabase not configured (set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).")
        return 2

    print(f"Upserting developer: {DEVELOPER_NAME}")
    developer_id = repo.upsert_developer(DEVELOPER_NAME, DEVELOPER_SLUG, DEVELOPER_URL)
    if not developer_id:
        print("  ! could not upsert developer; aborting.")
        return 3
    print(f"  developer_id = {developer_id}")

    inserted = 0
    for raw in CURATED_PROJECTS:
        project = dict(raw)
        if enrich:
            project = _try_enrich_via_sgai(project)
        normalised = _normalise(project)
        project_id = repo.upsert_project(developer_id, normalised)
        if project_id:
            print(f"  + {normalised['name']:<25} → {project_id}")
            inserted += 1
        else:
            print(f"  ! {normalised['name']:<25} upsert FAILED")

    repo.mark_developer_crawl(developer_id, status="ok")
    print(f"\nDone. {inserted}/{len(CURATED_PROJECTS)} projects upserted.")
    return 0


def _main() -> int:
    parser = argparse.ArgumentParser(description="Scrape Expo City Dubai's expo-living catalogue")
    parser.add_argument("--enrich", action="store_true",
                        help="Run ScrapeGraphAI on each detail page to overlay live fields onto the curated baseline.")
    args = parser.parse_args()
    return run(enrich=args.enrich)


if __name__ == "__main__":
    raise SystemExit(_main())
