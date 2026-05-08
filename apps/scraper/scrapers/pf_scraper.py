"""
OffplanIQ — Property Finder Real Scraper
=========================================
Scrapes real off-plan project data from propertyfinder.ae/en/new-projects
using Playwright. No mock data, no stubs.

Usage:
    python scrapers/pf_scraper.py                    # All UAE
    python scrapers/pf_scraper.py --city dubai        # Dubai only
    python scrapers/pf_scraper.py --city abu-dhabi    # Abu Dhabi only
    python scrapers/pf_scraper.py --city ras-al-khaimah
    python scrapers/pf_scraper.py --max 50            # Limit to 50 projects
"""

import os
import re
import sys
import json
import time
import argparse
import requests
from typing import Optional
from dataclasses import dataclass, field, asdict
from playwright.sync_api import sync_playwright, Page, Locator

# ─── Config ───
PF_BASE = "https://www.propertyfinder.ae"
PF_NEW_PROJECTS = f"{PF_BASE}/en/new-projects"
REQUEST_DELAY_S = 2.0
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Supabase config from env
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", os.environ.get("SUPABASE_URL", ""))
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("SUPABASE_SERVICE_KEY", ""))
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

CITY_URLS = {
    "dubai":          f"{PF_NEW_PROJECTS}/lp/dubai",
    "abu-dhabi":      f"{PF_NEW_PROJECTS}/lp/abu-dhabi",
    "sharjah":        f"{PF_NEW_PROJECTS}/lp/sharjah",
    "ajman":          f"{PF_NEW_PROJECTS}/lp/ajman",
    "ras-al-khaimah": f"{PF_NEW_PROJECTS}/lp/ras-al-khaimah",
    "fujairah":       f"{PF_NEW_PROJECTS}/lp/fujairah",
    "umm-al-quwain":  f"{PF_NEW_PROJECTS}/lp/umm-al-quwain",
}


@dataclass
class ScrapedProject:
    name: str
    slug: str
    developer_name: str
    area: str
    city: str
    min_price: Optional[int] = None
    max_price: Optional[int] = None
    current_psf: Optional[int] = None
    handover_date: Optional[str] = None
    launch_date: Optional[str] = None
    unit_types: list = field(default_factory=list)
    status: str = "active"
    description: Optional[str] = None
    images: list = field(default_factory=list)
    pf_url: str = ""
    total_units: int = 0
    total_floors: int = 0
    units_sold: int = 0
    sellthrough_pct: float = 0


def parse_price(text: str) -> Optional[int]:
    """Parse AED price from PF format: '1,864,888 AED' or 'from 1.2M AED'"""
    if not text:
        return None
    text = text.upper().replace(",", "").replace("AED", "").strip()
    text = re.sub(r"(FROM|STARTING|PRICE|:)", "", text).strip()
    try:
        m = re.search(r"([\d.]+)\s*M", text)
        if m:
            return round(float(m.group(1)) * 1_000_000)
        k = re.search(r"([\d.]+)\s*K", text)
        if k:
            return round(float(k.group(1)) * 1_000)
        num = re.search(r"[\d.]+", text)
        if num:
            val = float(num.group())
            if val >= 100_000:
                return round(val)
    except (ValueError, AttributeError):
        pass
    return None


def parse_handover(text: str) -> Optional[str]:
    """Parse delivery date: 'Q1 2030' → '2030-03-01'"""
    if not text:
        return None
    text = text.strip().lower()
    q_match = re.search(r"q([1-4])\s*(\d{4})", text)
    if q_match:
        q, yr = int(q_match.group(1)), int(q_match.group(2))
        month = {1: 3, 2: 6, 3: 9, 4: 12}[q]
        return f"{yr}-{month:02d}-01"
    yr_match = re.search(r"(202[5-9]|203\d)", text)
    if yr_match:
        return f"{yr_match.group(1)}-06-01"
    return None


def to_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def scrape_listing_page(page: Page, url: str) -> list[ScrapedProject]:
    """Scrape all project cards from a PF listing page."""
    projects = []

    print(f"  Loading {url}")
    page.goto(url, timeout=30000, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    # Scroll to load lazy content
    for _ in range(5):
        page.keyboard.press("End")
        page.wait_for_timeout(800)

    cards = page.locator('[data-testid="project-card-link"]')
    count = cards.count()
    print(f"  Found {count} project cards")

    for i in range(count):
        try:
            card = cards.nth(i)
            article = card.locator("xpath=ancestor::article")

            # Name from title attribute
            name = card.get_attribute("title") or ""
            href = card.get_attribute("href") or ""

            # Clean name: "Creek Haven from 1,864,888 AED" → "Creek Haven"
            name = re.sub(r"\s*from\s+[\d,]+\s*AED.*", "", name, flags=re.IGNORECASE).strip()
            if not name:
                continue

            # Price from title
            price_match = re.search(r"from\s+([\d,]+)\s*AED", card.get_attribute("title") or "", re.IGNORECASE)
            min_price = parse_price(price_match.group(1) if price_match else "")

            # Developer
            dev_el = article.locator('[data-testid="project-card-developer-name"]')
            developer = dev_el.inner_text().strip() if dev_el.count() > 0 else ""
            if not developer:
                # Try from alt text
                img_alt = article.locator("img").first.get_attribute("alt") or ""
                dev_match = re.search(r"by\s+(.+?)(?:,|$)", img_alt)
                developer = dev_match.group(1).strip() if dev_match else "Unknown"

            # Location from alt text or card
            img_alt = article.locator("img").first.get_attribute("alt") or ""
            # "image of Creek Haven by Emaar Properties, Dubai, Dubai Creek Harbour..."
            # PF sometimes appends a unit-count tag like " — [12]" — strip it.
            parts = img_alt.split(",")
            city = re.sub(r"\s*[—–-]\s*\[[^\]]*\]\s*$", "", parts[1].strip()) if len(parts) > 1 else "Dubai"
            area = re.sub(r"\s*[—–-]\s*\[[^\]]*\]\s*$", "", parts[2].strip()) if len(parts) > 2 else city

            # Delivery date
            delivery_el = article.locator('[data-testid="tag-delivery_date"]')
            handover_text = delivery_el.inner_text().strip() if delivery_el.count() > 0 else ""
            handover_text = handover_text.replace("Delivery Date:", "").strip()

            # Image
            img_src = article.locator("img").first.get_attribute("src") or ""

            slug = to_slug(f"{to_slug(developer)[:15]}-{name}")

            proj = ScrapedProject(
                name=name,
                slug=slug,
                developer_name=developer,
                area=area,
                city=city,
                min_price=min_price,
                handover_date=parse_handover(handover_text),
                images=[img_src] if img_src else [],
                pf_url=f"{PF_BASE}{href}" if href.startswith("/") else href,
                status="active",
            )
            projects.append(proj)
            print(f"    [{i+1}/{count}] {name} by {developer} — {area} — {min_price or '?'} AED")

        except Exception as e:
            print(f"    [{i+1}/{count}] Error: {e}")
            continue

    return projects


def scrape_project_detail(page: Page, project: ScrapedProject) -> ScrapedProject:
    """Scrape individual project page for more details.

    PF reliably shows: description, current PSF, unit types, sometimes total_units.
    PF rarely shows: sellthrough %, units_sold, launch date — those come from DLD/RERA.
    """
    if not project.pf_url:
        return project

    try:
        page.goto(project.pf_url, timeout=20000, wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        # Description
        desc_el = page.locator('[data-testid="project-description"], [class*="description"]').first
        if desc_el.count() > 0:
            project.description = desc_el.inner_text().strip()[:500]

        text = page.inner_text("body")

        # PSF — match "1,234 AED / sq.ft" or "AED 1,234 per sq ft" etc.
        psf_match = re.search(r"([\d,]+)\s*(?:AED\s*)?(?:per\s+sq\.?\s*ft|/\s*sq\.?\s*ft|psf)", text, re.IGNORECASE)
        if psf_match:
            psf = int(psf_match.group(1).replace(",", ""))
            if 500 <= psf <= 10000:
                project.current_psf = psf

        # Total units — patterns vary per PF page; only accept sensible counts.
        unit_patterns = [
            r"(?:total\s+(?:units|apartments|residences)|number\s+of\s+units)\s*[:\-]?\s*([\d,]+)",
            r"([\d,]+)\s+(?:total\s+)?(?:apartments?|residences?|units)\b",
        ]
        for pat in unit_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                n = int(m.group(1).replace(",", ""))
                if 10 <= n <= 50000:
                    project.total_units = n
                    break

        # Floors — sometimes shown as "Total floors: N" or "N storey/storeys"
        floors_m = re.search(r"(?:total\s+floors|floors|storeys?)\s*[:\-]?\s*(\d{1,3})", text, re.IGNORECASE)
        if floors_m:
            try:
                f = int(floors_m.group(1))
                if 1 <= f <= 200:
                    project.total_floors = f
            except (ValueError, AttributeError):
                pass

        # Launch / project completion year — rare on PF, but try
        launch_m = re.search(r"launched\s+(?:in\s+)?(?:Q[1-4]\s+)?(20\d{2})", text, re.IGNORECASE)
        if launch_m:
            project.launch_date = f"{launch_m.group(1)}-01-01"

        # Unit types from page
        unit_types_found = set()
        for ut in ["Studio", "1 BR", "2 BR", "3 BR", "4 BR", "5 BR", "Penthouse", "Villa", "Townhouse"]:
            if ut.lower() in text.lower():
                if ut == "Studio":               unit_types_found.add("studio")
                elif "BR" in ut and "1" in ut:   unit_types_found.add("1br")
                elif "BR" in ut and "2" in ut:   unit_types_found.add("2br")
                elif "BR" in ut and "3" in ut:   unit_types_found.add("3br")
                elif "BR" in ut and "4" in ut:   unit_types_found.add("4br")
                elif "BR" in ut and "5" in ut:   unit_types_found.add("5br")
                elif "Penthouse" in ut:           unit_types_found.add("penthouse")
                elif "Villa" in ut:               unit_types_found.add("villa")
                elif "Townhouse" in ut:           unit_types_found.add("townhouse")
        if unit_types_found:
            project.unit_types = sorted(unit_types_found)

    except Exception as e:
        print(f"    Detail error ({project.name}): {e}")

    return project


def _post_rest(path: str, body, on_conflict: Optional[str] = None) -> requests.Response:
    """POST to PostgREST with proper upsert semantics."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    return requests.post(url, headers=headers, json=body)


def upsert_to_supabase(projects: list[ScrapedProject]):
    """Push scraped projects to Supabase. Real upserts; only writes fields we have."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("⚠️  SUPABASE_URL/KEY not set, skipping DB upsert")
        return

    # 1) Upsert developers (real upsert, on_conflict=slug).
    dev_names = sorted({p.developer_name for p in projects if p.developer_name})
    print(f"\n📦 Upserting {len(dev_names)} developers...")
    if dev_names:
        dev_rows = [{"name": n, "slug": to_slug(n)} for n in dev_names]
        resp = _post_rest("developers", dev_rows, on_conflict="slug")
        if resp.status_code not in (200, 201, 204):
            print(f"  Dev upsert error: {resp.status_code} {resp.text[:200]}")

    # 2) Look up developer IDs.
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/developers?select=id,slug",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
    )
    dev_map = {d["slug"]: d["id"] for d in resp.json()} if resp.status_code == 200 else {}

    # 3) Build project rows. Only include fields we actually scraped — never write
    #    a placeholder zero, since downstream scoring treats 0 sellthrough as a real signal.
    print(f"\n📦 Upserting {len(projects)} projects...")
    project_rows = []
    for proj in projects:
        dev_id = dev_map.get(to_slug(proj.developer_name))
        if not dev_id:
            continue
        # Every row must have the same key set — PostgREST rejects batches with
        # mismatched shapes (PGRST102). Send None for missing values; the upsert
        # MERGE will leave existing columns unchanged when the value is null.
        #
        # IMPORTANT: PF does NOT own current_psf or units_sold. Those are DLD-
        # derived (real transactions). Including them here would null-overwrite
        # the values set by psf-updater and the matcher.
        row = {
            "name": proj.name,
            "slug": proj.slug,
            "developer_id": dev_id,
            "area": proj.area,
            "city": proj.city,
            "status": proj.status,
            "handover_status": "on_track",
            "property_finder_id": proj.slug,
            "min_price": proj.min_price,
            "max_price": proj.max_price,
            "current_handover_date": proj.handover_date,
            "launch_date": proj.launch_date,
            "total_units": proj.total_units or 0,
            "total_floors": proj.total_floors or None,
            "unit_types": proj.unit_types or None,
            "description": proj.description,
            "images": proj.images or None,
        }
        project_rows.append(row)

    success = 0
    if project_rows:
        # Upsert in batches of 100 to keep payloads sane.
        for i in range(0, len(project_rows), 100):
            batch = project_rows[i : i + 100]
            resp = _post_rest("projects", batch, on_conflict="slug")
            if resp.status_code in (200, 201, 204):
                success += len(batch)
            else:
                print(f"  Project upsert error (batch starting {i}): {resp.status_code} {resp.text[:200]}")
    print(f"  ✅ {success}/{len(projects)} projects upserted")

    # 4) Record PSF data points only for projects we just scraped that actually have PSF.
    just_scraped_slugs = {p.slug for p in projects if p.current_psf}
    if just_scraped_slugs:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/projects?select=id,slug,current_psf"
            f"&slug=in.({','.join(just_scraped_slugs)})",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        )
        if resp.status_code == 200:
            today = time.strftime("%Y-%m-%d")
            psf_points = [
                {
                    "project_id": row["id"],
                    "recorded_date": today,
                    "psf": row["current_psf"],
                    "source": "property_finder",
                    "sample_size": 1,
                }
                for row in resp.json()
                if row.get("current_psf")
            ]
            if psf_points:
                resp = _post_rest(
                    "psf_history",
                    psf_points,
                    on_conflict="project_id,recorded_date,source",
                )
                if resp.status_code in (200, 201, 204):
                    print(f"  📈 {len(psf_points)} PSF data points recorded")
                else:
                    print(f"  PSF history error: {resp.status_code} {resp.text[:200]}")


def main():
    parser = argparse.ArgumentParser(description="Scrape Property Finder off-plan projects")
    parser.add_argument("--city", default="all", help="City to scrape (dubai/abu-dhabi/ras-al-khaimah/all)")
    parser.add_argument("--max", type=int, default=200, help="Max projects to scrape")
    parser.add_argument("--detail", action="store_true", help="Also scrape individual project pages")
    parser.add_argument("--dry-run", action="store_true", help="Don't push to Supabase")
    args = parser.parse_args()

    print("🏗️  OffplanIQ — Property Finder Scraper")
    print("───────────────────────────────────────")

    cities = list(CITY_URLS.keys()) if args.city == "all" else [args.city]
    all_projects: list[ScrapedProject] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)

        for city in cities:
            url = CITY_URLS.get(city)
            if not url:
                print(f"⚠️  Unknown city: {city}")
                continue

            print(f"\n🌐 Scraping {city.title()}...")
            projects = scrape_listing_page(page, url)

            # Paginate — look for "next" button
            page_num = 1
            while len(projects) < args.max:
                next_btn = page.locator('a[data-testid="pagination-next"], [aria-label="Next"]')
                if next_btn.count() == 0 or not next_btn.first.is_enabled():
                    break
                page_num += 1
                print(f"\n  Page {page_num}...")
                next_btn.first.click()
                page.wait_for_timeout(REQUEST_DELAY_S * 1000)
                new_projects = scrape_listing_page(page, page.url)
                if not new_projects:
                    break
                projects.extend(new_projects)

            all_projects.extend(projects[:args.max])

            if args.detail:
                print(f"\n📋 Scraping detail pages for {len(projects)} projects...")
                for i, proj in enumerate(projects[:args.max]):
                    print(f"  [{i+1}/{len(projects)}] {proj.name}")
                    scrape_project_detail(page, proj)
                    time.sleep(REQUEST_DELAY_S)

        browser.close()

    # Deduplicate by slug
    seen = set()
    unique = []
    for proj in all_projects:
        if proj.slug not in seen:
            seen.add(proj.slug)
            unique.append(proj)
    all_projects = unique

    print(f"\n{'='*50}")
    print(f"Total scraped: {len(all_projects)} unique projects")

    if args.dry_run:
        print("\n🏁 Dry run — not pushing to Supabase")
        for proj in all_projects:
            print(f"  {proj.name:40s} | {proj.developer_name:20s} | {proj.area:20s} | {proj.min_price or '?':>12} AED")
    else:
        upsert_to_supabase(all_projects)

    print("\n✅ Done!")


if __name__ == "__main__":
    main()
