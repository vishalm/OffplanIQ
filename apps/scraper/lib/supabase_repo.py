"""
Supabase repository wrappers used by the intelligence scraper.

Encapsulates REST + storage calls so the scraper code stays declarative.
"""

from __future__ import annotations

import hashlib
import os
import time
from typing import Optional

import requests


SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")

REST = f"{SUPABASE_URL.rstrip('/')}/rest/v1"
STORAGE_API = f"{SUPABASE_URL.rstrip('/')}/storage/v1"

_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

_HEADERS_UPSERT = {
    **_HEADERS,
    "Prefer": "resolution=merge-duplicates,return=representation",
}


def configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def sha256(blob: bytes | str) -> str:
    if isinstance(blob, str):
        blob = blob.encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


# ─── Storage ─────────────────────────────────────────────────
def upload_asset(bucket: str, path: str, blob: bytes, content_type: str) -> Optional[str]:
    """Upload to Supabase Storage. Returns public URL on success."""
    if not configured():
        return None
    url = f"{STORAGE_API}/object/{bucket}/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    resp = requests.post(url, headers=headers, data=blob, timeout=120)
    if resp.status_code in (200, 201):
        return f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{bucket}/{path}"
    print(f"  Storage upload {resp.status_code}: {resp.text[:200]}")
    return None


# ─── Developers ──────────────────────────────────────────────
def upsert_developer(name: str, slug: str, official_url: Optional[str]) -> Optional[str]:
    """Upsert a developer row. Returns developer_id."""
    if not configured():
        return None
    payload = {"name": name, "slug": slug}
    if official_url:
        payload["official_url"] = official_url
    resp = requests.post(
        f"{REST}/developers?on_conflict=slug",
        headers=_HEADERS_UPSERT,
        json=[payload],
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        print(f"  Developer upsert {resp.status_code}: {resp.text[:200]}")
        return None
    rows = resp.json()
    return rows[0]["id"] if rows else None


def mark_developer_crawl(developer_id: str, status: str, error: Optional[str] = None) -> None:
    if not configured():
        return
    payload = {"crawl_status": status, "last_crawled_at": "now()"}
    if error:
        payload["crawl_error"] = error[:500]
    requests.patch(
        f"{REST}/developers?id=eq.{developer_id}",
        headers=_HEADERS,
        json=payload,
        timeout=30,
    )


def fetch_queued_developers(limit: int = 50) -> list[dict]:
    """Return developers that the recrawl-trigger edge fn has flagged as pending."""
    if not configured():
        return []
    resp = requests.get(
        f"{REST}/developers"
        f"?select=id,name,slug,official_url"
        f"&crawl_status=eq.pending"
        f"&official_url=not.is.null"
        f"&order=last_crawled_at.asc.nullsfirst"
        f"&limit={limit}",
        headers=_HEADERS,
        timeout=30,
    )
    return resp.json() if resp.ok else []


# ─── Projects ────────────────────────────────────────────────
# Fields whose value-change is worth surfacing in the "What's changed" feed.
# (project field name, change_type, kind: "numeric"|"date"|"text"|"array")
_TRACKED_FIELDS: list[tuple[str, str, str]] = [
    ("min_price",             "price_change",       "numeric"),
    ("max_price",             "price_change",       "numeric"),
    ("launch_psf",            "price_change",       "numeric"),
    ("total_units",           "units_change",       "numeric"),
    ("total_floors",          "units_change",       "numeric"),
    ("current_handover_date", "handover_change",    "date"),
    ("launch_date",           "handover_change",    "date"),
    ("description",           "description_change", "text"),
    ("unit_types",            "plan_change",        "array"),
    ("amenities",             "amenities_change",   "array"),
]


def _fetch_existing_project(slug: str) -> Optional[dict]:
    if not configured():
        return None
    resp = requests.get(
        f"{REST}/projects?slug=eq.{slug}&select=id,"
        + ",".join(f for f, _, _ in _TRACKED_FIELDS),
        headers=_HEADERS,
        timeout=30,
    )
    if not resp.ok:
        return None
    rows = resp.json()
    return rows[0] if rows else None


def _values_changed(before, after, kind: str) -> bool:
    """True iff the two values differ in a way worth surfacing."""
    if kind == "array":
        return sorted(before or []) != sorted(after or [])
    return before != after


def _delta_pct(before, after) -> Optional[float]:
    if before in (None, 0):
        return None
    try:
        return round(((float(after) - float(before)) / float(before)) * 100, 2)
    except (ValueError, TypeError):
        return None


def _diff_project(old: dict, new_row: dict) -> list[dict]:
    """Compare old vs new project rows. Returns project_updates payload rows
    for any meaningful change. Skips fields where new_row didn't supply a value
    (we don't want a 'change to null' just because the LLM was silent)."""
    if not old:
        return []
    updates: list[dict] = []
    for field, change_type, kind in _TRACKED_FIELDS:
        before = old.get(field)
        after = new_row.get(field)
        if field not in new_row or before is None or after is None:
            continue
        if not _values_changed(before, after, kind):
            continue
        updates.append({
            "project_id": old["id"],
            "change_type": change_type,
            "field": field,
            "before_value": before,
            "after_value": after,
            "delta_pct": _delta_pct(before, after) if kind == "numeric" else None,
        })
    return updates


def _record_launch(project_id: str) -> None:
    if not configured() or not project_id:
        return
    requests.post(
        f"{REST}/project_updates",
        headers=_HEADERS,
        json=[{"project_id": project_id, "change_type": "launch"}],
        timeout=30,
    )


def _record_updates(updates: list[dict]) -> None:
    if not configured() or not updates:
        return
    resp = requests.post(
        f"{REST}/project_updates",
        headers=_HEADERS,
        json=updates,
        timeout=30,
    )
    if not resp.ok:
        print(f"  project_updates insert {resp.status_code}: {resp.text[:200]}")


def _build_project_row(developer_id: str, project: dict) -> dict:
    """Build the upsert payload, dropping None values so absent keys preserve
    existing column values on PostgREST upserts."""
    name = project["name"]
    slug = _slug(name)[:80]
    row = {
        "developer_id": developer_id,
        "name": name,
        "slug": slug,
        "area": project.get("area") or "Unknown",
        "city": project.get("city") or "Dubai",
        "status": "active",
        "handover_status": "on_track",
        "total_units": project.get("total_units") or 0,
        "total_floors": project.get("total_floors"),
        "min_price": project.get("min_price_aed"),
        "max_price": project.get("max_price_aed"),
        "launch_psf": project.get("starting_psf_aed"),
        "current_handover_date": project.get("handover_date") or _quarter_to_date(project.get("handover_quarter")),
        "launch_date": project.get("launch_date"),
        "unit_types": project.get("unit_types") or None,
        "amenities": project.get("amenities") or None,
        "description": project.get("description"),
    }
    return {k: v for k, v in row.items() if v is not None}


def upsert_project(developer_id: str, project: dict) -> Optional[str]:
    """Upsert a project from extractor output and record diffs.

    Never overwrites DLD-owned fields (current_psf, units_sold, sellthrough_pct).
    First-time inserts emit a 'launch' update; subsequent updates emit one row
    per changed tracked field.
    Returns project_id."""
    if not configured() or not project.get("name"):
        return None

    row = _build_project_row(developer_id, project)
    existing = _fetch_existing_project(row["slug"])   # snapshot BEFORE upsert

    resp = requests.post(
        f"{REST}/projects?on_conflict=slug",
        headers=_HEADERS_UPSERT,
        json=[row],
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        print(f"  Project upsert {resp.status_code}: {resp.text[:200]}")
        return None
    rows = resp.json()
    project_id = rows[0]["id"] if rows else None
    if not project_id:
        return None

    if existing is None:
        _record_launch(project_id)
    else:
        _record_updates(_diff_project(existing, row))

    # Phase 3.3: brochure-derived starting PSF feeds the cross-source PSF series.
    if project.get("starting_psf_aed"):
        record_psf(project_id, int(project["starting_psf_aed"]), source="brochure")

    return project_id


def record_psf(project_id: str, psf: int, *, source: str, recorded_date: Optional[str] = None) -> None:
    """Append a row to psf_history. Idempotent on (project_id, recorded_date, source)."""
    if not configured() or not project_id or not psf:
        return
    if not recorded_date:
        from datetime import date as _date
        recorded_date = _date.today().isoformat()
    requests.post(
        f"{REST}/psf_history?on_conflict=project_id,recorded_date,source",
        headers=_HEADERS_UPSERT,
        json=[{
            "project_id": project_id,
            "recorded_date": recorded_date,
            "psf": psf,
            "source": source,
            "sample_size": 1,
        }],
        timeout=30,
    )


# ─── Documents + chunks ──────────────────────────────────────
def upsert_document(
    developer_id: str,
    project_id: Optional[str],
    source_url: str,
    doc_type: str,
    title: Optional[str],
    storage_path: Optional[str],
    content_text: str,
    page_count: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> Optional[tuple[str, bool]]:
    """Upsert a document. Returns (id, is_new_or_changed)."""
    if not configured():
        return None
    content_hash = sha256(content_text or "") if content_text else None

    # Look up by (developer_id, source_url) to detect content change.
    existing = requests.get(
        f"{REST}/documents?developer_id=eq.{developer_id}"
        f"&source_url=eq.{requests.utils.quote(source_url, safe='')}"
        f"&select=id,content_hash",
        headers=_HEADERS,
        timeout=30,
    )
    existing_row = (existing.json() or [None])[0] if existing.ok else None
    unchanged = bool(existing_row and existing_row.get("content_hash") == content_hash)

    payload = {
        "developer_id": developer_id,
        "project_id": project_id,
        "source_url": source_url,
        "doc_type": doc_type,
        "title": title,
        "storage_path": storage_path,
        "content_hash": content_hash,
        "content_text": content_text,
        "page_count": page_count,
        "metadata": metadata or {},
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    resp = requests.post(
        f"{REST}/documents?on_conflict=developer_id,source_url",
        headers=_HEADERS_UPSERT,
        json=[payload],
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        print(f"  Document upsert {resp.status_code}: {resp.text[:200]}")
        return None
    rows = resp.json()
    doc_id = rows[0]["id"] if rows else None
    if not doc_id:
        return None
    return doc_id, not unchanged


def replace_document_chunks(document_id: str, chunks: list[dict]) -> int:
    """Wipe and reinsert chunks for a document. Returns insert count.

    `chunks` items: {chunk_index, chunk_text, token_count, embedding}
    """
    if not configured() or not chunks:
        return 0
    requests.delete(
        f"{REST}/document_chunks?document_id=eq.{document_id}",
        headers=_HEADERS,
        timeout=30,
    )
    payload = [
        {
            "document_id": document_id,
            "chunk_index": c["chunk_index"],
            "chunk_text": c["chunk_text"],
            "token_count": c.get("token_count"),
            "embedding": c["embedding"],
        }
        for c in chunks
    ]
    inserted = 0
    for i in range(0, len(payload), 100):
        batch = payload[i : i + 100]
        resp = requests.post(
            f"{REST}/document_chunks",
            headers=_HEADERS,
            json=batch,
            timeout=60,
        )
        if resp.status_code in (200, 201, 204):
            inserted += len(batch)
        else:
            print(f"  Chunk insert {resp.status_code}: {resp.text[:200]}")
        time.sleep(0.1)
    return inserted


# ─── helpers ─────────────────────────────────────────────────
def _slug(text: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")


def _quarter_to_date(quarter: Optional[str]) -> Optional[str]:
    """'Q3 2027' → '2027-09-01'."""
    if not quarter:
        return None
    import re
    m = re.match(r"\s*Q([1-4])\s+(\d{4})\s*$", quarter, re.IGNORECASE)
    if not m:
        return None
    q, yr = int(m.group(1)), int(m.group(2))
    month = {1: 3, 2: 6, 3: 9, 4: 12}[q]
    return f"{yr}-{month:02d}-01"
