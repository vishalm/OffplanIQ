"""
OffplanIQ — Property Finder Scraper
=====================================
Scrapes propertyfinder.ae for off-plan project listings.
Captures: project name, developer, area, PSF, payment plans, unit counts.

Runs every 6 hours via Railway cron.

Usage:
    python scrapers/property_finder.py
    python scrapers/property_finder.py --area "Business Bay"
    python scrapers/property_finder.py --project-slug "binghatti-skyrise"
"""

import os
import re
import time
import json
import requests
import argparse
from dataclasses import dataclass, asdict
from typing import Optional
from playwright.sync_api import sync_playwright, Page

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
PF_BASE = "https://www.propertyfinder.ae"
PF_OFFPLAN = f"{PF_BASE}/en/off-plan-projects"
REQUEST_DELAY_S = 2.0

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

# ─────────────────────────────────────────────
# DATA MODELS
# ─────────────────────────────────────────────
@dataclass
class PfProject:
    property_finder_id: str
    name: str
    developer_name: str
    area: str
    subarea: Optional[str]
    status: str                    # maps to our ProjectStatus enum
    total_units: Optional[int]
    min_price: Optional[int]       # AED
    max_price: Optional[int]
    current_psf: Optional[int]
    unit_types: list[str]
    handover_date: Optional[str]   # YYYY-MM-DD or YYYY-MM approximation
    description: Optional[str]
    images: list[str]
    source_url: str

@dataclass
class PfPaymentPlan:
    property_finder_id: str       # parent project
    name: str
    down_payment_pct: int
    construction_pct: int
    handover_pct: int
    post_handover_pct: int
    post_handover_months: int

# ─────────────────────────────────────────────
# SCRAPER
# ─────────────────────────────────────────────
class PropertyFinderScraper:

    def scrape_all_offplan(self, area_filter: Optional[str] = None) -> list[PfProject]:
        projects = []

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_context(
                user_agent="Mozilla/5.0 (compatible; OffplanIQ/1.0)"
            ).new_page()

            url = PF_OFFPLAN
            if area_filter:
                url += f"?location={area_filter.replace(' ', '-').lower()}"

            page.goto(url, wait_until="networkidle", timeout=30000)

            page_num = 1
            while True:
                cards = self._extract_project_cards(page)
                projects.extend(cards)
                print(f"  Page {page_num}: {len(cards)} projects")

                if not self._next_page(page):
                    break
                page_num += 1
                time.sleep(REQUEST_DELAY_S)

            browser.close()

        return projects

    def scrape_project_detail(self, project_url: str) -> Optional[dict]:
        """
        Scrape a single project page for detailed data including payment plans.
        Called for each project found in the listing scrape.
        """
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_context().new_page()
            page.goto(project_url, wait_until="networkidle", timeout=30000)

            # TODO: Map selectors to actual PF project page structure
            # Inspect a live project page to get real selectors

            detail = {
                "description": self._safe_text(page, ".project-description"),
                "amenities":   self._safe_list(page, ".amenities-list li"),
                "images":      self._safe_image_list(page, ".project-gallery img"),
                "units_sold":  self._parse_sold_units(page),
            }

            payment_plans = self._extract_payment_plans(page)
            browser.close()

        return {**detail, "payment_plans": payment_plans}

    def _extract_project_cards(self, page: Page) -> list[PfProject]:
        """
        Extract project cards from the listing page.
        TODO: Update selectors after inspecting live PF off-plan page.
        """
        projects = []

        # Placeholder selectors — inspect propertyfinder.ae/en/off-plan-projects
        cards = page.query_selector_all("[data-testid='project-card']")

        for card in cards:
            try:
                pf_id = card.get_attribute("data-project-id") or ""
                name  = self._safe_text(card, ".project-name")
                dev   = self._safe_text(card, ".developer-name")
                area  = self._safe_text(card, ".project-location")
                price = self._parse_price(self._safe_text(card, ".starting-price"))
                url   = card.query_selector("a")
                href  = PF_BASE + url.get_attribute("href") if url else ""

                projects.append(PfProject(
                    property_finder_id=pf_id,
                    name=name,
                    developer_name=dev,
                    area=area,
                    subarea=None,
                    status="active",
                    total_units=None,
                    min_price=price,
                    max_price=None,
                    current_psf=None,
                    unit_types=[],
                    handover_date=None,
                    description=None,
                    images=[],
                    source_url=href,
                ))
            except Exception as e:
                print(f"  Card parse error: {e}")

        return projects

    def _extract_payment_plans(self, page: Page) -> list[dict]:
        """
        Extract payment plan tables from a project detail page.
        PF shows plans as percentage breakdowns.
        """
        plans = []
        # TODO: Inspect a real PF project page that shows payment plans
        # Example: https://www.propertyfinder.ae/en/new-projects/emaar/...
        return plans

    def _parse_price(self, text: str) -> Optional[int]:
        if not text:
            return None
        # e.g. "Starting from AED 1,200,000" or "AED 1.2M"
        text = text.upper().replace(",", "").replace("AED", "").strip()
        if "M" in text:
            try:
                return int(float(text.replace("M", "")) * 1_000_000)
            except ValueError:
                return None
        try:
            return int(re.sub(r"[^\d]", "", text))
        except ValueError:
            return None

    def _parse_sold_units(self, page: Page) -> Optional[int]:
        text = self._safe_text(page, ".units-sold-counter")
        if not text:
            return None
        nums = re.findall(r"\d+", text.replace(",", ""))
        return int(nums[0]) if nums else None

    def _safe_text(self, el, selector: str) -> str:
        try:
            node = el.query_selector(selector)
            return node.inner_text().strip() if node else ""
        except Exception:
            return ""

    def _safe_list(self, el, selector: str) -> list[str]:
        try:
            return [n.inner_text().strip() for n in el.query_selector_all(selector)]
        except Exception:
            return []

    def _safe_image_list(self, el, selector: str) -> list[str]:
        try:
            return [
                n.get_attribute("src") or n.get_attribute("data-src") or ""
                for n in el.query_selector_all(selector)
                if n.get_attribute("src")
            ]
        except Exception:
            return []

    def _next_page(self, page: Page) -> bool:
        btn = page.query_selector(".pagination button[aria-label='Next']:not([disabled])")
        if btn:
            btn.click()
            page.wait_for_load_state("networkidle")
            time.sleep(REQUEST_DELAY_S)
            return True
        return False

    def upsert_projects(self, projects: list[PfProject]):
        session = requests.Session()
        batch = [asdict(p) for p in projects]
        resp = session.post(
            f"{SUPABASE_URL}/rest/v1/projects",
            headers=HEADERS,
            json=batch,
        )
        print(f"  Upsert projects: {resp.status_code}")
        return resp.status_code in (200, 201)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--area", type=str, help="Filter by area")
    parser.add_argument("--project-slug", type=str, help="Scrape single project")
    args = parser.parse_args()

    scraper = PropertyFinderScraper()

    if args.project_slug:
        url = f"{PF_BASE}/en/new-projects/{args.project_slug}"
        detail = scraper.scrape_project_detail(url)
        print(json.dumps(detail, indent=2))
    else:
        projects = scraper.scrape_all_offplan(area_filter=args.area)
        print(f"Found {len(projects)} projects")
        scraper.upsert_projects(projects)
