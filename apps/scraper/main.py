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

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")

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


def trigger_edge_step(label: str, fn_name: str, errors: list[str], short_label: str) -> None:
    """Print a header, fire the edge function, and record any failure."""
    print(f"\n{'='*50}")
    print(f"STEP: {label}")
    print(f"{'='*50}")
    if not trigger_edge_fn(fn_name):
        errors.append(short_label)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OffplanIQ nightly scraper")
    parser.add_argument("--skip-dld",    action="store_true")
    parser.add_argument("--skip-pf",     action="store_true")
    parser.add_argument("--skip-match",  action="store_true")
    parser.add_argument("--skip-intel",  action="store_true", help="Skip LLM developer-intelligence step")
    parser.add_argument("--date",        type=str, help="Specific date YYYY-MM-DD for DLD backfill")
    parser.add_argument("--poll",        action="store_true", help="Run polling daemon (continuous)")
    parser.add_argument("--poll-interval", type=int, default=21600, help="Poll interval seconds (default 6h)")
    return parser.parse_args()


def main():
    args = parse_args()

    # Polling mode — delegates to polling daemon
    if args.poll:
        cmd = ["python", "jobs/polling_daemon.py", "--interval", str(args.poll_interval)]
        os.execvp("python", cmd)

    print(f"OffplanIQ Scraper — {date.today()}")
    errors: list[str] = []

    # Step 1: DLD
    if not args.skip_dld:
        cmd = ["python", "scrapers/dld.py"]
        if args.date:
            cmd += ["--date", args.date]
        if not run_step("DLD transaction scraper", cmd):
            errors.append("DLD")

    # Step 2: Property Finder (--detail enriches each listing with PSF, total_units,
    # floors, unit_types from the project's detail page; ~2s/project but worth it).
    if not args.skip_pf and not run_step("Property Finder scraper", ["python", "scrapers/pf_scraper.py", "--detail"]):
        errors.append("PropertyFinder")

    # Step 2.5: LLM-powered developer intelligence (brochures + sites → projects + RAG)
    if not args.skip_intel and not run_step("Developer intelligence (LLM)", ["python", "scrapers/developer_intelligence.py"]):
        errors.append("DeveloperIntelligence")

    # Step 3: Transaction matcher
    if not args.skip_match and not run_step("Transaction → project matcher", ["python", "jobs/match_transactions.py"]):
        errors.append("Matcher")

    # Step 4 + 5: edge functions
    trigger_edge_step("Trigger PSF updater", "psf-updater", errors, "PSFUpdater")
    time.sleep(5)
    trigger_edge_step("Trigger score recalculator", "score-recalculator", errors, "ScoreRecalculator")

    # Step 6: launch radar — dispatches new-launch alerts based on project_updates
    # rows the intelligence scraper just wrote. Soft-fail (missing edge fn → log only).
    trigger_edge_step("Trigger launch radar", "launch-radar", errors, "LaunchRadar")

    # Summary
    print(f"\n{'='*50}")
    print("SCRAPER COMPLETE")
    if errors:
        print(f"Errors in: {', '.join(errors)}")
        sys.exit(1)
    print("All steps completed successfully.")
    sys.exit(0)


if __name__ == "__main__":
    main()
