"""
OffplanIQ — DLD Transaction Scraper
====================================
Pulls real off-plan transactions from the Dubai Land Department open-data
gateway and upserts them into Supabase `dld_transactions`.

Source:  POST https://gateway.dubailand.gov.ae/open-data/transactions
Auth:    consumer-id header (public open-data consumer)
Format:  Documented by /scripts/api/OpenDataApi.js + /scripts/publicData.js
         on https://dubailand.gov.ae/en/open-data/real-estate-data/

Notes:
  - DLD `ACTUAL_AREA` is in square metres. Our schema stores square feet
    (`actual_area_sqft`). Convert with sqm * 10.7639.
  - `TRANSACTION_NUMBER` repeats across rows for portfolio transactions
    (one mortgage spanning multiple parcels). We synthesise a unique
    `dld_transaction_id` from `TRANSACTION_NUMBER + PARCEL_ID + area + value`.
  - DLD covers Dubai only. Other emirates need their own sources.

Usage:
    python scrapers/dld.py                  # yesterday only
    python scrapers/dld.py --days 7         # last 7 days
    python scrapers/dld.py --date 2026-05-05
    python scrapers/dld.py --offplan-only   # default true; pass --all to disable
    python scrapers/dld.py --dry-run        # don't upsert
"""

import os
import sys
import time
import argparse
import requests
from datetime import date, timedelta
from typing import Optional, Iterator
from dataclasses import dataclass, asdict

# ─── Config ───
DLD_API = "https://gateway.dubailand.gov.ae/open-data/transactions"
DLD_CONSUMER_ID = "gkb3WvEG0rY9eilwXC0P2pTz8UzvLj9F"   # public open-data consumer
DLD_PAGE_SIZE = 100
REQUEST_DELAY_S = 1.5
SQM_TO_SQFT = 10.7639

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")

DLD_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json, */*",
    "AppUser": "",
    "consumer-id": DLD_CONSUMER_ID,
    "Origin": "https://dubailand.gov.ae",
    "Referer": "https://dubailand.gov.ae/en/open-data/real-estate-data/",
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


@dataclass
class DldTransaction:
    dld_transaction_id: str
    transaction_date: str
    transaction_type: Optional[str]
    property_type: Optional[str]
    area_name: Optional[str]
    building_name: Optional[str]
    unit_number: Optional[str]
    floor_number: Optional[int]
    actual_area_sqft: Optional[float]
    transaction_value: int
    psf: Optional[int]
    is_off_plan: bool
    source_url: str


def _build_payload(target_date: date, skip: int, take: int, offplan_only: bool) -> dict:
    """DLD wants string-encoded numbers and DD/MM/YYYY dates."""
    return {
        "P_FROM_DATE": target_date.strftime("%d/%m/%Y"),
        "P_TO_DATE":   target_date.strftime("%d/%m/%Y"),
        "P_GROUP_ID":      "",
        "P_IS_OFFPLAN":    "1" if offplan_only else "",
        "P_IS_FREE_HOLD":  "",
        "P_AREA_ID":       "",
        "P_USAGE_ID":      "",
        "P_PROP_TYPE_ID":  "",
        "P_TAKE":          str(take),
        "P_SKIP":          str(skip),
        "P_SORT":          "TRANSACTION_NUMBER_ASC",
    }


def _row_to_transaction(row: dict) -> Optional[DldTransaction]:
    """Map a DLD API row into our schema. Returns None if row is unusable."""
    txn_number = row.get("TRANSACTION_NUMBER")
    trans_value = row.get("TRANS_VALUE")
    if not txn_number or not trans_value:
        return None

    actual_area_sqm = row.get("ACTUAL_AREA") or 0
    actual_area_sqft = round(actual_area_sqm * SQM_TO_SQFT, 2) if actual_area_sqm else None
    psf = round(trans_value / actual_area_sqft) if actual_area_sqft else None

    instance_date = (row.get("INSTANCE_DATE") or "")[:10]   # 'YYYY-MM-DD'
    if not instance_date:
        return None

    parcel_id = row.get("PARCEL_ID") or 0
    area_x100 = int((actual_area_sqm or 0) * 100)
    synthetic_id = f"{txn_number}_{parcel_id}_{area_x100}_{trans_value}"

    return DldTransaction(
        dld_transaction_id=synthetic_id,
        transaction_date=instance_date,
        transaction_type=(row.get("GROUP_EN") or "").lower() or None,
        property_type=row.get("PROP_TYPE_EN"),
        area_name=row.get("AREA_EN"),
        building_name=row.get("PROJECT_EN") or row.get("MASTER_PROJECT_EN"),
        unit_number=None,
        floor_number=None,
        actual_area_sqft=actual_area_sqft,
        transaction_value=int(trans_value),
        psf=psf,
        is_off_plan=row.get("IS_OFFPLAN") == 1,
        source_url="https://dubailand.gov.ae/en/open-data/real-estate-data/#/transactions",
    )


def _fetch_page(session: requests.Session, target_date: date, skip: int, offplan_only: bool) -> tuple[list[dict], int]:
    """Fetch one page from the DLD API. Returns (rows, total). Empty list on any failure."""
    payload = _build_payload(target_date, skip, DLD_PAGE_SIZE, offplan_only)
    try:
        resp = session.post(DLD_API, headers=DLD_HEADERS, json=payload, timeout=30)
    except requests.RequestException as exc:
        print(f"  Request failed at skip={skip}: {exc}")
        return [], 0

    if resp.status_code != 200:
        print(f"  HTTP {resp.status_code} at skip={skip}: {resp.text[:200]}")
        return [], 0

    body = resp.json()
    if body.get("responseCode") != 200:
        errs = body.get("validationErrorsList") or []
        msg = errs[0].get("errorMessage") if errs else body.get("responseCode")
        print(f"  API error at skip={skip}: {msg}")
        return [], 0

    rows = (body.get("response") or {}).get("result") or []
    total = rows[0].get("TOTAL", 0) if rows else 0
    return rows, total


def fetch_day(target_date: date, offplan_only: bool = True) -> Iterator[DldTransaction]:
    """Yield all transactions for a given date, paginating through the API."""
    session = requests.Session()
    seen_ids: set[str] = set()
    skip = 0
    page_num = 0

    while True:
        page_num += 1
        rows, total = _fetch_page(session, target_date, skip, offplan_only)
        if not rows:
            return

        page_yield = 0
        for row in rows:
            txn = _row_to_transaction(row)
            if txn and txn.dld_transaction_id not in seen_ids:
                seen_ids.add(txn.dld_transaction_id)
                page_yield += 1
                yield txn

        print(f"  Page {page_num}: {page_yield} new (skip={skip}, total={total})")
        skip += DLD_PAGE_SIZE
        if skip >= total:
            return
        time.sleep(REQUEST_DELAY_S)


def upsert_to_supabase(transactions: list[DldTransaction]) -> tuple[int, int]:
    """Upsert in batches. Returns (inserted, errors)."""
    if not transactions:
        return 0, 0
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("  SUPABASE_URL/KEY not set — skipping upsert")
        return 0, 0

    session = requests.Session()
    inserted = 0
    errors = 0
    batch_size = 100
    url = f"{SUPABASE_URL}/rest/v1/dld_transactions?on_conflict=dld_transaction_id"

    for i in range(0, len(transactions), batch_size):
        batch = transactions[i:i + batch_size]
        payload = [asdict(t) for t in batch]
        resp = session.post(url, headers=SUPABASE_HEADERS, json=payload, timeout=30)
        if resp.status_code in (200, 201, 204):
            inserted += len(batch)
        else:
            errors += len(batch)
            print(f"  Supabase {resp.status_code}: {resp.text[:300]}")
        time.sleep(0.2)

    return inserted, errors


def trigger_psf_updater(session: requests.Session) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return
    resp = session.post(
        f"{SUPABASE_URL}/functions/v1/psf-updater",
        headers=SUPABASE_HEADERS,
        json={"triggered_by": "dld_scraper"},
        timeout=120,
    )
    print(f"  psf-updater: {resp.status_code}")


def main() -> None:
    parser = argparse.ArgumentParser(description="OffplanIQ DLD Scraper")
    parser.add_argument("--date", type=str, help="Specific date YYYY-MM-DD")
    parser.add_argument("--days", type=int, default=1, help="Number of days to backfill (from yesterday)")
    parser.add_argument("--all", action="store_true", help="Include non-off-plan transactions too")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but don't upsert")
    args = parser.parse_args()

    if args.date:
        dates = [date.fromisoformat(args.date)]
    else:
        today = date.today()
        dates = [today - timedelta(days=i + 1) for i in range(args.days)]

    print(f"OffplanIQ DLD Scraper — {len(dates)} date(s), offplan_only={not args.all}")

    total_fetched = 0
    total_inserted = 0
    total_errors = 0

    for d in dates:
        print(f"\nScraping {d}...")
        transactions = list(fetch_day(d, offplan_only=not args.all))
        print(f"  Fetched: {len(transactions)} transactions")
        total_fetched += len(transactions)

        if args.dry_run:
            for t in transactions[:5]:
                print(f"    {t.transaction_date} {t.area_name} {t.building_name} {t.transaction_value:,} AED ({t.transaction_type})")
            continue

        inserted, errors = upsert_to_supabase(transactions)
        total_inserted += inserted
        total_errors += errors
        print(f"  Inserted: {inserted}, errors: {errors}")
        time.sleep(REQUEST_DELAY_S)

    if total_inserted > 0 and not args.dry_run:
        trigger_psf_updater(requests.Session())

    print(f"\nDone. Fetched: {total_fetched} · Inserted: {total_inserted} · Errors: {total_errors}")
    sys.exit(0 if total_errors == 0 else 1)


if __name__ == "__main__":
    main()
