"""
OffplanIQ — DLD Transaction → Project Matcher
================================================
Runs after the DLD scraper to match raw transactions
(which only have building_name + area_name) to our projects table.

Matching strategy:
  1. Exact building name match (lowercased, stripped)
  2. Area match + fuzzy building name match (first 3 words)
  3. Mark unmatched for manual review

Usage:
    python jobs/match_transactions.py
    python jobs/match_transactions.py --since 2025-01-01
    python jobs/match_transactions.py --dry-run   # shows matches without saving
"""

import os
import re
import argparse
import requests
from dataclasses import dataclass
from typing import Optional

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
}


def normalize(s: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", s.lower())).strip()


def words(s: str, min_len: int = 3) -> list[str]:
    return [w for w in normalize(s).split() if len(w) >= min_len]


def fuzzy_match(building_name: str, project_name: str) -> float:
    """
    Returns a match confidence 0.0–1.0.
    Uses word overlap between first 4 significant words.
    """
    a = set(words(building_name)[:4])
    b = set(words(project_name)[:4])
    if not a or not b:
        return 0.0
    overlap = len(a & b)
    return overlap / max(len(a), len(b))


def fetch_unmatched_transactions(since: Optional[str] = None) -> list[dict]:
    params = "is.null"
    url = f"{SUPABASE_URL}/rest/v1/dld_transactions?project_id={params}&select=id,building_name,area_name&limit=1000"
    if since:
        url += f"&transaction_date=gte.{since}"
    resp = requests.get(url, headers=HEADERS)
    return resp.json() if resp.ok else []


def fetch_all_projects() -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/projects?select=id,name,area,slug&limit=500"
    resp = requests.get(url, headers=HEADERS)
    return resp.json() if resp.ok else []


def match_transaction(txn: dict, projects: list[dict]) -> Optional[str]:
    """
    Returns best-matching project_id or None.
    """
    txn_building = normalize(txn["building_name"])
    txn_area     = normalize(txn["area_name"])

    best_score  = 0.0
    best_id     = None

    for project in projects:
        proj_name = normalize(project["name"])
        proj_area = normalize(project["area"])

        # Area must roughly match (fast pre-filter)
        area_words_match = any(w in txn_area for w in words(proj_area, min_len=4))
        if not area_words_match:
            continue

        score = fuzzy_match(txn_building, proj_name)

        # Boost for exact substring match
        if proj_name in txn_building or txn_building in proj_name:
            score = min(score + 0.3, 1.0)

        if score > best_score:
            best_score = score
            best_id    = project["id"]

    # Only accept high-confidence matches
    return best_id if best_score >= 0.5 else None


def update_project_id(txn_id: str, project_id: str) -> bool:
    url  = f"{SUPABASE_URL}/rest/v1/dld_transactions?id=eq.{txn_id}"
    resp = requests.patch(url, headers=HEADERS, json={"project_id": project_id})
    return resp.ok


def main():
    parser = argparse.ArgumentParser(description="Match DLD transactions to projects")
    parser.add_argument("--since",   type=str, help="Only process transactions after this date YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true", help="Show matches without saving")
    args = parser.parse_args()

    print("Fetching unmatched transactions...")
    transactions = fetch_unmatched_transactions(since=args.since)
    print(f"  Found {len(transactions)} unmatched transactions")

    print("Fetching projects...")
    projects = fetch_all_projects()
    print(f"  Found {len(projects)} projects\n")

    matched   = 0
    unmatched = 0

    for txn in transactions:
        project_id = match_transaction(txn, projects)

        if project_id:
            project = next((p for p in projects if p["id"] == project_id), None)
            print(f"  MATCH: '{txn['building_name']}' ({txn['area_name']}) → {project['name'] if project else project_id}")
            if not args.dry_run:
                update_project_id(txn["id"], project_id)
            matched += 1
        else:
            print(f"  NO MATCH: '{txn['building_name']}' ({txn['area_name']})")
            unmatched += 1

    print(f"\nDone. Matched: {matched} · Unmatched: {unmatched}")
    if args.dry_run:
        print("(dry-run — no changes saved)")


if __name__ == "__main__":
    main()
