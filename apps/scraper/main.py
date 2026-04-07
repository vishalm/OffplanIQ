"""
OffplanIQ — Scraper Orchestrator
==================================
Main entrypoint. Called by Railway cron nightly at 02:00 UTC (06:00 UAE).

Order of operations:
  1. DLD scraper    — pulls yesterday's transactions
  2. PF scraper     — updates project listings and prices
  3. Matcher        — links DLD transactions to projects
  4. Trigger PSF updater  (Supabase Edge Function)
  5. Trigger score recalculator (Supabase Edge Function)

Usage:
    python main.py                  # full nightly run
    python main.py --skip-dld       # skip DLD (useful when DLD is down)
    python main.py --skip-pf        # skip Property Finder
    python main.py --date 2025-04-01 # backfill specific date
"""

import os
import sys
import time
import argparse
import subprocess
import requests
from datetime import date, timedelta

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
}


def run_step(name: str, cmd: list[str]) -> bool:
    print(f"\n{'='*50}")
    print(f"STEP: {name}")
    print(f"{'='*50}")
    start = time.time()
    result = subprocess.run(cmd, cwd=os.path.dirname(__file__))
    elapsed = round(time.time() - start, 1)
    status = "OK" if result.returncode == 0 else "FAILED"
    print(f"→ {status} in {elapsed}s")
    return result.returncode == 0


def trigger_edge_fn(fn_name: str) -> bool:
    url  = f"{SUPABASE_URL}/functions/v1/{fn_name}"
    resp = requests.post(url, headers=HEADERS, json={}, timeout=120)
    print(f"  Edge fn {fn_name}: {resp.status_code}")
    try:
        print(f"  Response: {resp.json()}")
    except Exception:
        pass
    return resp.ok


def main():
    parser = argparse.ArgumentParser(description="OffplanIQ nightly scraper")
    parser.add_argument("--skip-dld",    action="store_true")
    parser.add_argument("--skip-pf",     action="store_true")
    parser.add_argument("--skip-match",  action="store_true")
    parser.add_argument("--date",        type=str, help="Specific date YYYY-MM-DD for DLD backfill")
    args = parser.parse_args()

    print(f"OffplanIQ Scraper — {date.today()}")
    errors = []

    # Step 1: DLD
    if not args.skip_dld:
        cmd = ["python", "scrapers/dld.py"]
        if args.date:
            cmd += ["--date", args.date]
        if not run_step("DLD transaction scraper", cmd):
            errors.append("DLD")

    # Step 2: Property Finder
    if not args.skip_pf:
        if not run_step("Property Finder scraper", ["python", "scrapers/property_finder.py"]):
            errors.append("PropertyFinder")

    # Step 3: Transaction matcher
    if not args.skip_match:
        if not run_step("Transaction → project matcher", ["python", "jobs/match_transactions.py"]):
            errors.append("Matcher")

    # Step 4: PSF updater edge function
    print(f"\n{'='*50}")
    print("STEP: Trigger PSF updater")
    print(f"{'='*50}")
    if not trigger_edge_fn("psf-updater"):
        errors.append("PSFUpdater")

    # Brief pause to let PSF update settle
    time.sleep(5)

    # Step 5: Score recalculator edge function
    print(f"\n{'='*50}")
    print("STEP: Trigger score recalculator")
    print(f"{'='*50}")
    if not trigger_edge_fn("score-recalculator"):
        errors.append("ScoreRecalculator")

    # Summary
    print(f"\n{'='*50}")
    print("SCRAPER COMPLETE")
    if errors:
        print(f"Errors in: {', '.join(errors)}")
        sys.exit(1)
    else:
        print("All steps completed successfully.")
        sys.exit(0)


if __name__ == "__main__":
    main()
