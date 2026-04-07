"""
OffplanIQ — DLD Transaction Scraper
====================================
Scrapes Dubai Land Department transaction search for off-plan sales.
Runs nightly via Railway cron (or locally with: python scrapers/dld.py)

Data source: https://dubailand.gov.ae/en/eservices/real-estate-transaction-search/
DLD publishes T+1 data (yesterday's transactions available today).

Output: upserts into Supabase dld_transactions table via REST API

Usage:
    python scrapers/dld.py --date 2025-04-06
    python scrapers/dld.py --days 7   # backfill last 7 days
    python scrapers/dld.py            # default: yesterday
"""

import os
import sys
import json
import time
import argparse
import requests
from datetime import date, datetime, timedelta
from typing import Optional
from dataclasses import dataclass, asdict
from playwright.sync_api import sync_playwright, Page, TimeoutError as PlaywrightTimeout

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
DLD_BASE_URL = "https://dubailand.gov.ae/en/eservices/real-estate-transaction-search/"
REQUEST_DELAY_S = 1.5   # polite delay between page requests
MAX_RETRIES = 3

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",  # upsert
}

# ─────────────────────────────────────────────
# DATA MODEL
# ─────────────────────────────────────────────
@dataclass
class DldTransaction:
    dld_transaction_id: str
    transaction_date: str          # ISO date YYYY-MM-DD
    transaction_type: str
    area_name: str
    building_name: str
    unit_number: Optional[str]
    floor_number: Optional[int]
    actual_area_sqft: Optional[float]
    transaction_value: int         # AED integer
    psf: Optional[int]            # computed
    is_off_plan: bool
    source_url: str

# ─────────────────────────────────────────────
# SCRAPER
# ─────────────────────────────────────────────
class DldScraper:
    def __init__(self):
        self.session = requests.Session()
        self.scraped = 0
        self.inserted = 0
        self.errors = 0

    def scrape_date(self, target_date: date) -> list[DldTransaction]:
        """
        Scrapes all transactions for a given date.
        DLD paginates results — we follow all pages.
        """
        transactions = []

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (compatible; OffplanIQ/1.0; +https://offplaniq.com/bot)"
            )
            page = context.new_page()

            try:
                page.goto(DLD_BASE_URL, wait_until="networkidle", timeout=30000)
                self._set_date_filter(page, target_date)
                self._apply_offplan_filter(page)

                page_num = 1
                while True:
                    rows = self._extract_page_rows(page, target_date)
                    transactions.extend(rows)
                    print(f"  Page {page_num}: {len(rows)} rows")

                    if not self._has_next_page(page):
                        break

                    self._click_next_page(page)
                    page.wait_for_load_state("networkidle")
                    time.sleep(REQUEST_DELAY_S)
                    page_num += 1

            except PlaywrightTimeout:
                print(f"  Timeout on {target_date} — partial data returned")
            finally:
                browser.close()

        return transactions

    def _set_date_filter(self, page: Page, target_date: date):
        """Fill in the date range filter with the target date."""
        date_str = target_date.strftime("%d/%m/%Y")
        # TODO: Update selectors by inspecting DLD site in browser DevTools
        # These are placeholder selectors — inspect the actual page to confirm
        page.fill("#startDate", date_str)
        page.fill("#endDate", date_str)
        page.click("#searchBtn")
        page.wait_for_load_state("networkidle")

    def _apply_offplan_filter(self, page: Page):
        """Filter to off-plan transactions only."""
        # TODO: Inspect DLD filter dropdowns
        # May need: page.select_option("#transactionType", "off-plan")
        pass

    def _extract_page_rows(self, page: Page, target_date: date) -> list[DldTransaction]:
        """
        Extract transaction rows from the current page.
        IMPORTANT: Inspect DLD table structure in DevTools → copy selectors here.
        """
        transactions = []

        # TODO: Update selector to match actual DLD table
        rows = page.query_selector_all("table.results-table tbody tr")

        for row in rows:
            try:
                cells = row.query_selector_all("td")
                if len(cells) < 8:
                    continue

                txn_id    = cells[0].inner_text().strip()
                txn_type  = cells[1].inner_text().strip()
                area      = cells[2].inner_text().strip()
                building  = cells[3].inner_text().strip()
                unit_no   = cells[4].inner_text().strip() or None
                area_sqft = self._parse_float(cells[5].inner_text())
                value_aed = self._parse_int(cells[6].inner_text())

                psf = None
                if area_sqft and area_sqft > 0 and value_aed:
                    psf = round(value_aed / area_sqft)

                txn = DldTransaction(
                    dld_transaction_id=txn_id,
                    transaction_date=target_date.isoformat(),
                    transaction_type=txn_type,
                    area_name=area,
                    building_name=building,
                    unit_number=unit_no,
                    floor_number=None,
                    actual_area_sqft=area_sqft,
                    transaction_value=value_aed or 0,
                    psf=psf,
                    is_off_plan=True,
                    source_url=DLD_BASE_URL,
                )
                transactions.append(txn)

            except Exception as e:
                print(f"  Row parse error: {e}")
                self.errors += 1

        return transactions

    def _has_next_page(self, page: Page) -> bool:
        next_btn = page.query_selector(".pagination .next:not(.disabled)")
        return next_btn is not None

    def _click_next_page(self, page: Page):
        page.click(".pagination .next")

    def _parse_float(self, text: str) -> Optional[float]:
        try:
            return float(text.replace(",", "").strip())
        except (ValueError, AttributeError):
            return None

    def _parse_int(self, text: str) -> Optional[int]:
        try:
            return int(text.replace(",", "").strip())
        except (ValueError, AttributeError):
            return None

    def upsert_to_supabase(self, transactions: list[DldTransaction]) -> int:
        """Batch upsert transactions to Supabase."""
        if not transactions:
            return 0

        batch_size = 100
        inserted = 0

        for i in range(0, len(transactions), batch_size):
            batch = transactions[i:i + batch_size]
            payload = [asdict(t) for t in batch]

            resp = self.session.post(
                f"{SUPABASE_URL}/rest/v1/dld_transactions",
                headers=HEADERS,
                json=payload,
            )

            if resp.status_code in (200, 201):
                inserted += len(batch)
            else:
                print(f"  Supabase error {resp.status_code}: {resp.text[:200]}")
                self.errors += len(batch)

            time.sleep(0.2)  # rate limit courtesy

        return inserted

    def trigger_psf_update(self):
        """
        After inserting transactions, trigger the psf-updater Edge Function
        to recompute current_psf and update psf_history for affected projects.
        """
        resp = self.session.post(
            f"{SUPABASE_URL}/functions/v1/psf-updater",
            headers=HEADERS,
            json={"triggered_by": "dld_scraper"},
        )
        print(f"  psf-updater: {resp.status_code}")


# ─────────────────────────────────────────────
# ENTRYPOINT
# ─────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="OffplanIQ DLD Scraper")
    parser.add_argument("--date", type=str, help="Specific date YYYY-MM-DD")
    parser.add_argument("--days", type=int, default=1, help="Number of days to backfill")
    args = parser.parse_args()

    scraper = DldScraper()

    if args.date:
        dates = [date.fromisoformat(args.date)]
    else:
        today = date.today()
        dates = [today - timedelta(days=i + 1) for i in range(args.days)]

    print(f"OffplanIQ DLD Scraper — {len(dates)} date(s)")

    for d in dates:
        print(f"\nScraping {d}...")
        transactions = scraper.scrape_date(d)
        print(f"  Found: {len(transactions)} transactions")

        if transactions:
            inserted = scraper.upsert_to_supabase(transactions)
            print(f"  Inserted: {inserted}")

    if scraper.errors == 0:
        scraper.trigger_psf_update()

    print(f"\nDone. Errors: {scraper.errors}")
    sys.exit(0 if scraper.errors == 0 else 1)


if __name__ == "__main__":
    main()
