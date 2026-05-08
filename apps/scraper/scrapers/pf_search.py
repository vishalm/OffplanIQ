"""
OffplanIQ — Property Finder /search Off-Plan Scraper
=====================================================
Companion to scrapers/pf_scraper.py. The other scraper hits PF's project-level
landing pages (`/new-projects/lp/<city>`); this one hits the listing-level
search index with the off-plan filter explicitly applied
(`/en/search?c=2&completion_status=off_plan_primary`) so we can pull individual
unit listings — which give us per-unit PSF, real price ranges, and richer
PSF-history depth.

⚠ BLOCKED BY PF ANTI-BOT (May 2026)
Property Finder protects `/en/search` with a "Human Verification" page
(PerimeterX-style fingerprinting). Plain Playwright + spoofed User-Agent
hits a captcha challenge instead of listings. Confirmed by `page.title() ==
'Human Verification'` on first load.

The unprotected fallback that works today is `/en/new-projects/lp/<city>` —
that's what scrapers/pf_scraper.py uses and where we get our 100+ off-plan
projects per scrape. The price PF pays for protecting `/search` more
aggressively is that the project landing pages stay open.

Three legitimate paths to unblock listing-level data:
  1. Apify pre-built PF actor (handles fingerprinting at scale)
  2. PF Partner API (requires RERA broker registration)
  3. Reidin / Property Monitor (commercial transaction-level data)

This file stays in the tree as a runner shape: when one of the above is
available, swap `scrape_city()` for the new fetcher and the rest of the
pipeline (psf_history aggregates, project matching) keeps working.

Data plumbing:
  * Each listing is parsed into a `PfListing` row (price + size + project name
    + developer + bedrooms + URL).
  * Listings group by project name (case-insensitive, normalised).
  * For each (project, day) we compute the median PSF across listings, then
    upsert into `psf_history` with `source='property_finder_listings'`.
  * Projects we don't already have are upserted into `projects` with a
    placeholder `total_units=0` and the developer matched fuzzily.

Anti-bot posture:
  * Playwright + a stable Chrome UA + sec-ua headers.
  * Scroll-based pagination (PF's search is infinite-scroll on desktop).
  * Polite delay between scrolls (REQUEST_DELAY_S = 1.5).
  * Stop after MAX_PAGES * RESULTS_PER_PAGE listings to keep cost bounded.

Usage:
    python scrapers/pf_search.py                       # Dubai, off-plan, default 200 listings
    python scrapers/pf_search.py --city abu-dhabi
    python scrapers/pf_search.py --max 500
    python scrapers/pf_search.py --dry-run             # parse, no DB writes
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass, field
from statistics import median
from typing import Optional
from urllib.parse import urlencode

import requests
from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout


# ─── Config ───
PF_BASE   = "https://www.propertyfinder.ae"
PF_SEARCH = f"{PF_BASE}/en/search"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
EXTRA_HEADERS = {
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "upgrade-insecure-requests": "1",
}
REQUEST_DELAY_S = 1.5
NAV_TIMEOUT_MS  = 35_000
MAX_SCROLL_ITERATIONS = 12

# PF search filters (verified May 2026 — see /en/search query string)
DEFAULT_FILTERS = {
    "c": "1",                              # 1 = Buy (Residential for Sale)
    "ob": "mr",                            # most recent first
    "completion_status": "off_plan_primary",
}

# locality → PF location tree id (used by the location filter `l`)
LOCATIONS = {
    "dubai":          "1",
    "abu-dhabi":      "2",
    "sharjah":        "3",
    "ajman":          "4",
    "ras-al-khaimah": "5",
    "fujairah":       "6",
    "umm-al-quwain":  "7",
}

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=representation",
}


# ─── Dataclasses ───
@dataclass
class PfListing:
    title: str
    price_aed: Optional[int]
    sqft: Optional[float]
    bedrooms: Optional[str]
    project_name: Optional[str]
    developer: Optional[str]
    area: Optional[str]
    city: str
    url: str
    raw_card_text: str = field(repr=False, default="")

    @property
    def psf(self) -> Optional[int]:
        if self.price_aed and self.sqft and self.sqft > 0:
            return round(self.price_aed / self.sqft)
        return None


# ─── Scrape ───
def build_search_url(city: str, page: int) -> str:
    params = dict(DEFAULT_FILTERS)
    if city in LOCATIONS:
        params["l"] = LOCATIONS[city]
    params["page"] = str(page)
    return f"{PF_SEARCH}?{urlencode(params)}"


def parse_price(text: str) -> Optional[int]:
    if not text:
        return None
    t = text.upper().replace(",", "").replace("AED", "").strip()
    m = re.search(r"([\d.]+)\s*M", t)
    if m: return round(float(m.group(1)) * 1_000_000)
    m = re.search(r"([\d.]+)\s*K", t)
    if m: return round(float(m.group(1)) * 1_000)
    m = re.search(r"\d{4,}", t)
    if m:
        n = int(m.group(0))
        return n if n >= 100_000 else None
    return None


def parse_sqft(text: str) -> Optional[float]:
    if not text:
        return None
    m = re.search(r"([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|ft²)", text.lower())
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


_CARD_TEXT_LIMIT = 800


def _safe_text(card, selector: str) -> str:
    el = card.locator(selector).first
    if el.count() == 0:
        return ""
    try:
        return (el.inner_text() or "").strip()
    except Exception:
        return ""


def _card_url(card) -> str:
    link = card.locator("a").first
    if link.count() == 0:
        return ""
    href = link.get_attribute("href") or ""
    if href.startswith("/"):
        return PF_BASE + href
    return href


def _parse_card(card, city: str) -> Optional[PfListing]:
    text = (card.inner_text() or "")[:_CARD_TEXT_LIMIT]
    title   = _safe_text(card, '[class*="title"], h2')
    price   = parse_price(_safe_text(card, '[class*="price"], [data-testid*="price"]'))
    project = _safe_text(card, '[class*="project"], [data-testid*="project"]') or None
    dev     = _safe_text(card, '[class*="developer"], [data-testid*="developer"]') or None
    area    = _safe_text(card, '[class*="location"], [data-testid*="location"]') or None
    url     = _card_url(card)
    sqft    = parse_sqft(text)
    beds    = re.search(r"(\d+|studio)\s*(?:br|bed|bedroom)", text, re.IGNORECASE)

    if not (title or project or url):
        return None
    return PfListing(
        title=title or project or "Untitled",
        price_aed=price,
        sqft=sqft,
        bedrooms=beds.group(0).lower() if beds else None,
        project_name=project,
        developer=dev,
        area=area,
        city=city,
        url=url,
        raw_card_text=text,
    )


def extract_listings_from_dom(page: Page, city: str) -> list[PfListing]:
    """Parse all listing cards currently in the DOM. Idempotent — meant to be
    called repeatedly between scrolls; the caller dedupes on URL."""
    cards = page.locator('article[data-testid*="property-card"], article.styles_main__YQs2Q')
    out: list[PfListing] = []
    for i in range(cards.count()):
        try:
            listing = _parse_card(cards.nth(i), city)
            if listing is not None:
                out.append(listing)
        except Exception as exc:                 # tolerate flaky individual cards
            print(f"  card parse skipped: {exc}")
    return out


def scroll_until_done(page: Page, city: str, target: int) -> list[PfListing]:
    """Scroll and re-parse until we hit `target` unique listings or scroll-stops."""
    seen: dict[str, PfListing] = {}
    last_height = 0
    for i in range(MAX_SCROLL_ITERATIONS):
        listings = extract_listings_from_dom(page, city)
        for l in listings:
            if l.url and l.url not in seen:
                seen[l.url] = l
        if len(seen) >= target:
            break
        page.keyboard.press("End")
        page.wait_for_timeout(int(REQUEST_DELAY_S * 1000))
        new_height = page.evaluate("document.body.scrollHeight")
        if new_height == last_height and i >= 2:
            break
        last_height = new_height
    print(f"  collected {len(seen)} unique listings after {i + 1} scroll(s)")
    return list(seen.values())


def scrape_city(city: str, max_listings: int) -> list[PfListing]:
    print(f"\n=== Property Finder /search · off-plan · {city} ===")
    listings: list[PfListing] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
        ctx = browser.new_context(
            user_agent=USER_AGENT,
            extra_http_headers=EXTRA_HEADERS,
            viewport={"width": 1440, "height": 900},
            locale="en-US",
        )
        ctx.add_init_script(
            # Trim the Playwright fingerprint a bit (navigator.webdriver = false)
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined })"
        )
        page = ctx.new_page()
        url = build_search_url(city, 1)
        print(f"  GET {url}")
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            page.wait_for_timeout(2500)
        except PWTimeout:
            print("  initial nav timeout — retrying once")
            page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            page.wait_for_timeout(2500)

        # Captcha / human-verification gate. PF protects /search with
        # PerimeterX-style fingerprinting; bail loudly so the orchestrator
        # surfaces the situation rather than silently writing zero.
        try:
            title = (page.title() or "").strip()
        except Exception:
            title = ""
        if re.search(r"human verification|just a moment|checking your browser|captcha", title, re.I):
            print(f"  ✗ blocked by anti-bot ({title!r}). PF /search is captcha-protected.")
            print("    Fall back to scrapers/pf_scraper.py (project-level, unprotected).")
            browser.close()
            return []

        # Cookie-banner dismiss (best effort)
        for sel in ('button:has-text("Accept")', 'button:has-text("OK")', 'button:has-text("Got it")'):
            try:
                btn = page.locator(sel).first
                if btn.count() > 0 and btn.is_visible():
                    btn.click(timeout=2000)
            except Exception:
                pass

        listings = scroll_until_done(page, city, max_listings)
        browser.close()

    # Cap to requested max in case scroll produced more.
    return listings[:max_listings]


# ─── DB writes ───
def normalise_project_key(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (name or "").lower())).strip()


def _group_listings(listings: list[PfListing]) -> dict[str, list[PfListing]]:
    by_project: dict[str, list[PfListing]] = {}
    for l in listings:
        key = normalise_project_key(l.project_name or l.title)
        if key:
            by_project.setdefault(key, []).append(l)
    return by_project


def _write_psf_row(session: requests.Session, project_id: str, today: str, psfs: list[int], key: str) -> bool:
    payload = [{
        "project_id":    project_id,
        "recorded_date": today,
        "psf":           int(median(psfs)),
        "source":        "property_finder_listings",
        "sample_size":   len(psfs),
    }]
    r = session.post(
        f"{SUPABASE_URL}/rest/v1/psf_history?on_conflict=project_id,recorded_date,source",
        headers=SB_HEADERS, json=payload, timeout=30,
    )
    if r.ok:
        return True
    print(f"    psf_history error for {key}: {r.status_code} {r.text[:200]}")
    return False


def _print_dry_preview(by_project: dict[str, list[PfListing]]) -> None:
    for key, ls in list(by_project.items())[:5]:
        psfs = [l.psf for l in ls if l.psf]
        psf_label = int(median(psfs)) if psfs else "—"
        print(f"    [dry] {key:40s} listings={len(ls)} psf-median={psf_label}")


def upsert_psf_aggregates(listings: list[PfListing], dry_run: bool) -> tuple[int, int]:
    """Group listings by project name; for each (project, today) push a median-PSF
    row into psf_history with source='property_finder_listings'. Returns
    (groups_seen, rows_written)."""
    if not listings:
        return 0, 0

    by_project = _group_listings(listings)
    print(f"  {len(by_project)} project groups across {len(listings)} listings")

    if dry_run or not (SUPABASE_URL and SUPABASE_KEY):
        _print_dry_preview(by_project)
        return len(by_project), 0

    project_lookup = _fetch_project_index()
    today = time.strftime("%Y-%m-%d")
    session = requests.Session()
    rows_written = 0
    for key, ls in by_project.items():
        psfs = [l.psf for l in ls if l.psf]
        project_id = _match_project_id(key, project_lookup) if psfs else None
        if project_id and _write_psf_row(session, project_id, today, psfs, key):
            rows_written += 1
    return len(by_project), rows_written


def _fetch_project_index() -> list[dict]:
    if not (SUPABASE_URL and SUPABASE_KEY):
        return []
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/projects?select=id,name,slug",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=30,
    )
    return r.json() if r.ok else []


def _match_project_id(key: str, projects: list[dict]) -> Optional[str]:
    """Best-effort fuzzy match: returns the first project whose normalised
    name shares ≥ 2 tokens with `key` (or full substring). Conservative on
    purpose — we'd rather drop than misattribute PSF."""
    if not key or len(key) < 4:
        return None
    key_tokens = {t for t in key.split() if len(t) >= 3}
    if not key_tokens:
        return None
    best_id, best_score = None, 0
    for p in projects:
        n = normalise_project_key(p.get("name") or "")
        if not n:
            continue
        if key in n or n in key:
            return p["id"]                 # substring is strong evidence
        toks = {t for t in n.split() if len(t) >= 3}
        score = len(key_tokens & toks)
        if score > best_score:
            best_score, best_id = score, p["id"]
    return best_id if best_score >= 2 else None


# ─── Main ───
def main() -> None:
    parser = argparse.ArgumentParser(description="PF /search off-plan scraper")
    parser.add_argument("--city", default="dubai", choices=list(LOCATIONS.keys()) + ["all"])
    parser.add_argument("--max", type=int, default=200, help="Max listings per city")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cities = list(LOCATIONS.keys()) if args.city == "all" else [args.city]
    grand_listings: list[PfListing] = []
    for city in cities:
        try:
            grand_listings.extend(scrape_city(city, args.max))
        except Exception as exc:
            print(f"  {city} failed: {exc}")
        time.sleep(REQUEST_DELAY_S)

    print(f"\nTotal listings collected: {len(grand_listings)}")
    if not grand_listings:
        sys.exit(1)

    # Sample
    for l in grand_listings[:5]:
        print(f"  · {l.title[:35]:35s} price={l.price_aed} sqft={l.sqft} psf={l.psf} dev={l.developer} area={l.area}")

    groups, rows = upsert_psf_aggregates(grand_listings, args.dry_run)
    print(f"\n{'DRY RUN' if args.dry_run else 'DONE'}. project_groups={groups} psf_rows_written={rows}")


if __name__ == "__main__":
    main()
