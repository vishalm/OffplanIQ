"""
OffplanIQ — Polling Daemon
============================
Continuously polls Property Finder for new/updated project data.
Runs on a configurable interval. Designed for Railway/Docker deployment.

Usage:
    python jobs/polling_daemon.py                     # Default: every 6 hours
    python jobs/polling_daemon.py --interval 3600     # Every 1 hour
    python jobs/polling_daemon.py --interval 300      # Every 5 min (dev/testing)
    python jobs/polling_daemon.py --once              # Run once and exit

Environment:
    NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY   — Service role key
    POLL_INTERVAL_S             — Override interval (seconds)
    POLL_CITIES                 — Comma-separated cities (default: dubai,abu-dhabi,ras-al-khaimah)
"""

import os
import sys
import time
import signal
import logging
from datetime import datetime, timezone

# Add parent dir to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scrapers.pf_scraper import (
    scrape_listing_page,
    scrape_project_detail,
    upsert_to_supabase,
    CITY_URLS,
    USER_AGENT,
    REQUEST_DELAY_S,
)
from playwright.sync_api import sync_playwright

# ─── Config ───
DEFAULT_INTERVAL_S = 6 * 3600  # 6 hours
MAX_PROJECTS_PER_CITY = 50
CITIES = os.environ.get("POLL_CITIES", "dubai,abu-dhabi,ras-al-khaimah").split(",")

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("offplaniq.poller")

# ─── Graceful shutdown ───
running = True

def shutdown(signum, frame):
    global running
    log.info(f"Received signal {signum}, shutting down gracefully...")
    running = False

signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)


def run_poll_cycle():
    """Execute one full polling cycle across all configured cities."""
    cycle_start = time.time()
    total_projects = 0
    errors = 0

    log.info("=" * 60)
    log.info("Starting poll cycle")
    log.info(f"Cities: {', '.join(CITIES)}")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=USER_AGENT)

            for city in CITIES:
                city = city.strip()
                url = CITY_URLS.get(city)
                if not url:
                    log.warning(f"Unknown city: {city}, skipping")
                    continue

                try:
                    log.info(f"Scraping {city}...")
                    projects = scrape_listing_page(page, url)

                    # Paginate
                    page_num = 1
                    while len(projects) < MAX_PROJECTS_PER_CITY:
                        next_btn = page.locator('a[data-testid="pagination-next"], [aria-label="Next"]')
                        if next_btn.count() == 0 or not next_btn.first.is_enabled():
                            break
                        page_num += 1
                        log.info(f"  Page {page_num}...")
                        next_btn.first.click()
                        page.wait_for_timeout(int(REQUEST_DELAY_S * 1000))
                        new_projects = scrape_listing_page(page, page.url)
                        if not new_projects:
                            break
                        projects.extend(new_projects)

                    projects = projects[:MAX_PROJECTS_PER_CITY]
                    log.info(f"  Scraped {len(projects)} projects from {city}")
                    total_projects += len(projects)

                    # Push to Supabase
                    upsert_to_supabase(projects)

                    # Respect rate limits between cities
                    time.sleep(REQUEST_DELAY_S * 2)

                except Exception as e:
                    log.error(f"Error scraping {city}: {e}")
                    errors += 1

            browser.close()

    except Exception as e:
        log.error(f"Browser error: {e}")
        errors += 1

    elapsed = round(time.time() - cycle_start)
    log.info(f"Poll cycle complete: {total_projects} projects, {errors} errors, {elapsed}s elapsed")
    return total_projects, errors


def main():
    import argparse
    parser = argparse.ArgumentParser(description="OffplanIQ Polling Daemon")
    parser.add_argument("--interval", type=int,
                        default=int(os.environ.get("POLL_INTERVAL_S", DEFAULT_INTERVAL_S)),
                        help=f"Poll interval in seconds (default: {DEFAULT_INTERVAL_S})")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    args = parser.parse_args()

    log.info("🏗️  OffplanIQ Polling Daemon")
    log.info(f"   Interval: {args.interval}s ({args.interval // 3600}h {(args.interval % 3600) // 60}m)")
    log.info(f"   Cities: {', '.join(CITIES)}")
    log.info(f"   Max per city: {MAX_PROJECTS_PER_CITY}")
    log.info(f"   Supabase: {os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'NOT SET')[:40]}...")

    if args.once:
        run_poll_cycle()
        return

    # ─── Main polling loop ───
    cycle = 0
    while running:
        cycle += 1
        log.info(f"\n--- Cycle #{cycle} at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} ---")

        try:
            projects, errors = run_poll_cycle()
        except Exception as e:
            log.error(f"Cycle #{cycle} failed: {e}")

        if not running:
            break

        # Sleep in small increments for graceful shutdown
        log.info(f"Next poll in {args.interval}s ({args.interval // 60}min)")
        slept = 0
        while slept < args.interval and running:
            time.sleep(min(30, args.interval - slept))
            slept += 30

    log.info("Polling daemon stopped.")


if __name__ == "__main__":
    main()
