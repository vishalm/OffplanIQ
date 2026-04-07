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
    "dubai": f"{PF_NEW_PROJECTS}/lp/dubai",
    "abu-dhabi": f"{PF_NEW_PROJECTS}/lp/abu-dhabi",
    "ras-al-khaimah": f"{PF_NEW_PROJECTS}/lp/ras-al-khaimah",
    "sharjah": f"{PF_NEW_PROJECTS}/lp/sharjah",
    "ajman": f"{PF_NEW_PROJECTS}/lp/ajman",
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
    unit_types: list = field(default_factory=list)
    status: str = "active"
    description: Optional[str] = None
    images: list = field(default_factory=list)
    pf_url: str = ""
    total_units: int = 0
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
            parts = img_alt.split(",")
            city = parts[1].strip() if len(parts) > 1 else "Dubai"
            area = parts[2].strip() if len(parts) > 2 else city

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
    """Scrape individual project page for more details."""
    if not project.pf_url:
        return project

    try:
        page.goto(project.pf_url, timeout=20000, wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        # Description
        desc_el = page.locator('[data-testid="project-description"], [class*="description"]').first
        if desc_el.count() > 0:
            project.description = desc_el.inner_text().strip()[:500]

        # Try to find PSF
        text = page.inner_text("body")
        psf_match = re.search(r"([\d,]+)\s*(?:AED\s*)?(?:per\s+sq\.?\s*ft|/\s*sq\.?\s*ft|psf)", text, re.IGNORECASE)
        if psf_match:
            psf = int(psf_match.group(1).replace(",", ""))
            if 500 <= psf <= 10000:
                project.current_psf = psf

        # Unit types from page
        for ut in ["Studio", "1 BR", "2 BR", "3 BR", "4 BR", "Penthouse", "Villa", "Townhouse"]:
            if ut.lower() in text.lower():
                mapped = ut.lower().replace(" ", "").replace("br", "br")
                if mapped == "studio":
                    project.unit_types.append("studio")
                elif "1" in ut:
                    project.unit_types.append("1br")
                elif "2" in ut:
                    project.unit_types.append("2br")
                elif "3" in ut:
                    project.unit_types.append("3br")
                elif "4" in ut:
                    project.unit_types.append("4br")
                elif "pent" in ut.lower():
                    project.unit_types.append("penthouse")
                elif "villa" in ut.lower():
                    project.unit_types.append("villa")
                elif "town" in ut.lower():
                    project.unit_types.append("townhouse")

        project.unit_types = list(set(project.unit_types))

    except Exception as e:
        print(f"    Detail error ({project.name}): {e}")

    return project


def upsert_to_supabase(projects: list[ScrapedProject]):
    """Push scraped projects to Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("⚠️  SUPABASE_URL/KEY not set, skipping DB upsert")
        return

    # First ensure developers exist
    dev_names = list(set(p.developer_name for p in projects if p.developer_name))
    print(f"\n📦 Upserting {len(dev_names)} developers...")
    for dev_name in dev_names:
        slug = to_slug(dev_name)
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/developers",
            headers=HEADERS,
            json={"name": dev_name, "slug": slug},
        )
        if resp.status_code not in (200, 201, 409):
            # 409 = conflict (already exists), that's fine
            if "duplicate" not in resp.text.lower():
                print(f"  Dev error ({dev_name}): {resp.status_code} {resp.text[:100]}")

    # Get developer IDs
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/developers?select=id,slug",
        headers=HEADERS,
    )
    dev_map = {d["slug"]: d["id"] for d in resp.json()} if resp.status_code == 200 else {}

    # Upsert projects
    print(f"\n📦 Upserting {len(projects)} projects...")
    success = 0
    for proj in projects:
        dev_slug = to_slug(proj.developer_name)
        dev_id = dev_map.get(dev_slug)
        if not dev_id:
            continue

        data = {
            "name": proj.name,
            "slug": proj.slug,
            "developer_id": dev_id,
            "area": proj.area,
            "status": proj.status,
            "handover_status": "on_track",
            "min_price": proj.min_price,
            "current_psf": proj.current_psf,
            "current_handover_date": proj.handover_date,
            "unit_types": proj.unit_types or ["studio", "1br", "2br"],
            "total_units": proj.total_units or 0,
            "units_sold": proj.units_sold or 0,
            "sellthrough_pct": proj.sellthrough_pct or 0,
            "description": proj.description,
            "images": proj.images,
            "property_finder_id": proj.slug,
        }
        # Remove None values
        data = {k: v for k, v in data.items() if v is not None}

        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/projects",
            headers=HEADERS,
            json=data,
        )
        if resp.status_code in (200, 201):
            success += 1
        elif "duplicate" in resp.text.lower() or "unique" in resp.text.lower():
            success += 1  # Already exists
        else:
            print(f"  Error ({proj.name}): {resp.status_code} {resp.text[:100]}")

    print(f"  ✅ {success}/{len(projects)} projects upserted")

    # Record PSF data points
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/projects?select=id,slug,current_psf",
        headers=HEADERS,
    )
    if resp.status_code == 200:
        today = time.strftime("%Y-%m-%d")
        psf_points = []
        for row in resp.json():
            if row.get("current_psf"):
                psf_points.append({
                    "project_id": row["id"],
                    "recorded_date": today,
                    "psf": row["current_psf"],
                    "source": "property_finder",
                    "sample_size": 1,
                })
        if psf_points:
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/psf_history",
                headers={**HEADERS, "Prefer": "resolution=merge-duplicates"},
                json=psf_points,
            )
            print(f"  📈 {len(psf_points)} PSF data points recorded")


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
