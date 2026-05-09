"""
Drain `scrape_jobs` — the queue the /admin Operations Copilot writes to.

Run modes:
    python -m apps.scraper.scrapers.queue_worker            # one pass, exit
    python -m apps.scraper.scrapers.queue_worker --poll     # loop forever, 10s interval
    python -m apps.scraper.scrapers.queue_worker --poll --interval 30

Each loop:
    1. RPC claim_next_scrape_job() flips one row pending→running (SKIP LOCKED).
    2. Dispatch to the right scraper based on `scraper` column value.
    3. Update the row to success/failed with output/error.

Add a new scraper:
    map "<scraper_id>" → callable in `RUNNERS` below. Keep callables idempotent.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Callable

import requests

# Load repo-root .env so this works locally without sourcing manually.
try:
    from dotenv import load_dotenv
    _ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"
    if _ROOT_ENV.is_file():
        load_dotenv(_ROOT_ENV)
except ImportError:
    pass


SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")

REST    = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}


# ─── Scraper dispatch ───────────────────────────────────────

def _run_expo_city(args: dict) -> dict:
    from .expo_city import run as expo_run
    code = expo_run(enrich=bool(args.get("enrich")))
    return {"exit_code": code}


def _run_dld(args: dict) -> dict:
    days = int(args.get("days", 7))
    from .dld import scrape_dld_recent              # type: ignore[attr-defined]
    return scrape_dld_recent(days=days) or {"days": days}


def _run_pf(args: dict) -> dict:
    from .pf_scraper import run as pf_run            # type: ignore[attr-defined]
    return pf_run(**args) or {"ok": True}


# Add your scraper here once → it's callable from /admin and the Copilot.
RUNNERS: dict[str, Callable[[dict], dict]] = {
    "expo_city":   _run_expo_city,
    "dld":         _run_dld,
    "pf_scraper":  _run_pf,
}


# ─── Queue I/O ──────────────────────────────────────────────

def _claim_next() -> dict | None:
    """Atomically claim one pending row via the SECURITY DEFINER RPC."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Supabase env not configured.")
    resp = requests.post(f"{REST}/rpc/claim_next_scrape_job", headers=HEADERS, timeout=30)
    if resp.status_code == 404:
        # Migration not applied yet — surface a clear error and bail.
        raise RuntimeError("RPC claim_next_scrape_job missing — apply migration 20260509000001_scrape_jobs.sql.")
    if not resp.ok:
        raise RuntimeError(f"claim_next_scrape_job HTTP {resp.status_code}: {resp.text[:200]}")
    payload = resp.json()
    # PostgREST returns the row directly (or null when nothing pending).
    if not payload:
        return None
    if isinstance(payload, list):
        return payload[0] if payload else None
    return payload


def _finalise(job_id: str, *, success: bool, output: dict | None, error: str | None) -> None:
    body = {
        "status":      "success" if success else "failed",
        "finished_at": "now()",
    }
    if output is not None:
        body["output"] = output
    if error:
        body["error"]  = error[:1000]
    requests.patch(
        f"{REST}/scrape_jobs?id=eq.{job_id}",
        headers=HEADERS,
        json=body,
        timeout=30,
    )


# ─── Loop ───────────────────────────────────────────────────

def drain_once(verbose: bool = True) -> int:
    """Process every pending row once and return the count handled."""
    handled = 0
    while True:
        job = _claim_next()
        if not job:
            break
        scraper = job.get("scraper") or ""
        args    = job.get("args") or {}
        runner  = RUNNERS.get(scraper)
        if verbose:
            print(f"[queue] claimed {scraper} (id={job.get('id')}), args={args}")
        if not runner:
            _finalise(job["id"], success=False, output=None,
                      error=f"unknown scraper '{scraper}'. Known: {sorted(RUNNERS)}")
            continue
        try:
            output = runner(args)
            _finalise(job["id"], success=True, output=output, error=None)
            if verbose:
                print(f"[queue] OK {scraper} → {json.dumps(output)[:200]}")
        except Exception as exc:                                                                # noqa: BLE001
            _finalise(job["id"], success=False, output=None, error=f"{type(exc).__name__}: {exc}")
            if verbose:
                print(f"[queue] FAIL {scraper}: {exc}")
        handled += 1
    return handled


def poll_forever(interval_s: float, verbose: bool = True) -> None:
    print(f"[queue] polling every {interval_s:.0f}s — Ctrl+C to stop")
    while True:
        try:
            count = drain_once(verbose=verbose)
            if count == 0 and verbose:
                pass    # quiet on idle ticks
        except Exception as exc:                                                                # noqa: BLE001
            print(f"[queue] poll error: {exc}")
        time.sleep(max(2.0, interval_s))


def _main() -> int:
    parser = argparse.ArgumentParser(description="Drain the scrape_jobs queue")
    parser.add_argument("--poll", action="store_true",   help="Loop forever")
    parser.add_argument("--interval", type=float, default=10.0, help="Poll interval in seconds (with --poll)")
    parser.add_argument("--quiet",    action="store_true", help="Suppress progress logging")
    args = parser.parse_args()

    if args.poll:
        poll_forever(interval_s=args.interval, verbose=not args.quiet)
        return 0

    n = drain_once(verbose=not args.quiet)
    print(f"[queue] done — handled {n} job(s)")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
