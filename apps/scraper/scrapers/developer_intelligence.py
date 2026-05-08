"""
OffplanIQ — Developer Intelligence Scraper (Phase 1)
=====================================================
For each registered UAE developer:
  1. Fetch official site landing page via Playwright
  2. Discover project pages + linked PDFs (brochures, factsheets)
  3. Download PDFs to Supabase Storage; extract text via pypdf
  4. Use Azure OpenAI to LLM-extract structured project data from each source
  5. Upsert projects/developers (DLD fields preserved)
  6. Chunk + embed source text → document_chunks for RAG

Usage:
    python scrapers/developer_intelligence.py                # all in registry
    python scrapers/developer_intelligence.py --only emaar
    python scrapers/developer_intelligence.py --max 3        # first 3 developers
    python scrapers/developer_intelligence.py --dry-run      # no LLM, no upsert
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests

# Ensure parent package import works
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib import azure_openai            # noqa: E402
from lib.embeddings import chunk_text, embed_chunks   # noqa: E402
from lib.link_classifier import (                      # noqa: E402
    Link,
    classify_links,
    CLASS_PROJECT,
    CLASS_BROCHURE,
)
from lib.llm_extract import extract_projects          # noqa: E402
from lib.pdf import extract_pdf                        # noqa: E402
from lib import supabase_repo as repo                  # noqa: E402

from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout  # noqa: E402


# ─── Config ───
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
PER_PAGE_DELAY_S = 2.0
MAX_PROJECT_PAGES_PER_DEV = 25
MAX_PDFS_PER_DEV = 8
NAV_TIMEOUT_MS = 30_000


# ─── Developer registry ───
# Phase 1+2: per-developer regex is now optional. When omitted, link_classifier
# (heuristics + LLM zero-shot) infers project pages and brochures from the DOM.
@dataclass
class DeveloperSpec:
    name: str
    slug: str
    official_url: str
    project_path_re: Optional[str] = None   # optional fast-path; classifier is used when None


REGISTRY: list[DeveloperSpec] = [
    DeveloperSpec("Emaar Properties",     "emaar-properties",     "https://www.emaar.com/en/our-projects",
                  r"/en/our-projects/[a-z0-9\-]+"),
    DeveloperSpec("Sobha Realty",         "sobha-realty",         "https://www.sobharealty.com/dubai/",
                  r"/dubai/[a-z0-9\-]+/?$"),
    DeveloperSpec("Damac Properties",     "damac-properties",     "https://www.damacproperties.com/en/projects",
                  r"/en/(?:projects|properties)/[a-z0-9\-]+"),
    DeveloperSpec("Aldar Properties",     "aldar-properties",     "https://www.aldar.com/en/explore-aldar/properties-and-destinations",
                  r"/en/.+/(?:properties?|destinations)/[a-z0-9\-]+"),
    DeveloperSpec("Nakheel",              "nakheel",              "https://www.nakheel.com/en/communities",
                  r"/en/communities/[a-z0-9\-]+"),
    DeveloperSpec("Meraas Holding",       "meraas-holding",       "https://www.meraas.com/en/projects",
                  r"/en/projects/[a-z0-9\-]+"),
    DeveloperSpec("Azizi Developments",   "azizi-developments",   "https://www.azizidevelopments.com/en/projects",
                  r"/en/projects/[a-z0-9\-]+"),
    DeveloperSpec("Binghatti Developers", "binghatti-developers", "https://www.binghatti.com/projects",
                  r"/projects/[a-z0-9\-]+"),
    DeveloperSpec("Ellington Properties", "ellington-properties", "https://ellingtonproperties.ae/projects",
                  r"/projects/[a-z0-9\-]+"),
    DeveloperSpec("Dubai Properties",     "dubai-properties",     "https://www.dubaiproperties.ae/communities/",
                  r"/communities/[a-z0-9\-]+"),
]


def _is_pdf_url(url: str) -> bool:
    p = urlparse(url)
    return p.path.lower().endswith(".pdf")


def _harvest_anchors(page: Page, base_url: str) -> list[Link]:
    """Lazy-load + return same-host anchors as Link objects."""
    page.goto(base_url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    page.wait_for_timeout(2500)
    for _ in range(3):
        page.keyboard.press("End")
        page.wait_for_timeout(700)

    raw = page.eval_on_selector_all(
        "a[href]",
        "els => els.map(e => ({href: e.getAttribute('href'), text: (e.innerText || '').trim().slice(0, 200)}))",
    ) or []

    base_host = urlparse(base_url).netloc
    seen_hrefs: set[str] = set()
    out: list[Link] = []
    for r in raw:
        href = (r.get("href") or "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(base_url, href)
        if urlparse(absolute).netloc != base_host:
            continue
        if absolute in seen_hrefs:
            continue
        seen_hrefs.add(absolute)
        out.append(Link(href=absolute, text=r.get("text") or ""))
    return out


def discover_links(page: Page, base_url: str, project_path_re: Optional[str]) -> tuple[list[str], list[str]]:
    """From the landing page, return (project_page_urls, pdf_urls).

    If `project_path_re` is supplied, we use it as a fast hand-tuned regex
    (Phase 1 hand-curated registry). Otherwise the link_classifier
    (heuristics + LLM fallback) does the work — works on arbitrary developers.
    """
    links = _harvest_anchors(page, base_url)

    if project_path_re:
        return _regex_classify(links, project_path_re)

    buckets = classify_links(links)
    project_urls = sorted({l.href for l in buckets[CLASS_PROJECT]})
    pdf_urls     = sorted({l.href for l in buckets[CLASS_BROCHURE] if _is_pdf_url(l.href)})
    return project_urls[:MAX_PROJECT_PAGES_PER_DEV], pdf_urls[:MAX_PDFS_PER_DEV]


def _regex_classify(links: list[Link], project_path_re: str) -> tuple[list[str], list[str]]:
    pat = re.compile(project_path_re, re.IGNORECASE)
    project_urls: set[str] = set()
    pdf_urls: set[str] = set()
    for link in links:
        if _is_pdf_url(link.href):
            pdf_urls.add(link.href)
        elif pat.search(urlparse(link.href).path):
            project_urls.add(link.href)
    return sorted(project_urls)[:MAX_PROJECT_PAGES_PER_DEV], sorted(pdf_urls)[:MAX_PDFS_PER_DEV]


def fetch_page_text(page: Page, url: str) -> tuple[str, str, list[str]]:
    """Returns (page_text, title, found_pdfs_on_page)."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        page.wait_for_timeout(1500)
    except PWTimeout:
        print(f"  timeout fetching {url}")
        return "", "", []
    title = page.title() or ""
    body_text = page.inner_text("body") or ""

    pdf_links = page.eval_on_selector_all(
        "a[href$='.pdf'], a[href*='.pdf?']", "els => els.map(e => e.getAttribute('href'))"
    ) or []
    pdf_urls = []
    for href in pdf_links:
        if not href:
            continue
        pdf_urls.append(urljoin(url, href))

    return body_text.strip(), title.strip(), list(dict.fromkeys(pdf_urls))


def download_pdf(url: str) -> Optional[bytes]:
    try:
        resp = requests.get(url, timeout=60, headers={"User-Agent": USER_AGENT}, stream=True)
        if resp.status_code != 200:
            print(f"  pdf {resp.status_code} {url}")
            return None
        if "pdf" not in (resp.headers.get("content-type") or "").lower() and not _is_pdf_url(url):
            print(f"  not a PDF: {resp.headers.get('content-type')} {url}")
            return None
        return resp.content[:25 * 1024 * 1024]   # cap at 25MB
    except requests.RequestException as exc:
        print(f"  pdf err {url}: {exc}")
        return None


def process_source(
    *,
    developer_id: str,
    source_url: str,
    doc_type: str,
    raw_text: str,
    title: Optional[str],
    storage_path: Optional[str],
    page_count: Optional[int],
    dry_run: bool,
) -> dict:
    """Run extraction + embedding for a single source. Returns stats."""
    stats = {"projects_extracted": 0, "chunks_created": 0, "skipped_unchanged": False}
    if not raw_text or len(raw_text.strip()) < 200:
        return stats

    if dry_run:
        print(f"    [dry-run] would extract from {len(raw_text)} chars at {source_url}")
        return stats

    extracted = extract_projects(raw_text)

    project_id_for_doc: Optional[str] = None
    for proj in extracted.get("projects", []):
        pid = repo.upsert_project(developer_id, proj)
        if pid and not project_id_for_doc:
            project_id_for_doc = pid          # first project becomes the doc anchor
        stats["projects_extracted"] += int(bool(pid))

    upsert_result = repo.upsert_document(
        developer_id=developer_id,
        project_id=project_id_for_doc,
        source_url=source_url,
        doc_type=doc_type,
        title=title,
        storage_path=storage_path,
        content_text=raw_text,
        page_count=page_count,
    )
    if not upsert_result:
        return stats
    document_id, changed = upsert_result
    if not changed:
        stats["skipped_unchanged"] = True
        return stats

    chunks = chunk_text(raw_text)
    if not chunks:
        return stats

    embedded = embed_chunks(chunks)
    rows = [
        {
            "chunk_index": c.index,
            "chunk_text": c.text,
            "token_count": c.token_count,
            "embedding": vec,
        }
        for c, vec in embedded
    ]
    stats["chunks_created"] = repo.replace_document_chunks(document_id, rows)
    return stats


def _accumulate(totals: dict, source_stats: dict) -> None:
    totals["projects_extracted"] += source_stats["projects_extracted"]
    totals["chunks_created"]     += source_stats["chunks_created"]
    totals["skipped_unchanged"]  += int(source_stats["skipped_unchanged"])


def _process_project_pages(
    page: Page,
    *,
    project_urls: list[str],
    developer_id: str,
    dry_run: bool,
    totals: dict,
    pdf_accumulator: list[str],
) -> None:
    for url in project_urls:
        text, title, pdfs_on_page = fetch_page_text(page, url)
        totals["project_pages"] += 1
        if text:
            stats = process_source(
                developer_id=developer_id,
                source_url=url,
                doc_type="website",
                raw_text=text,
                title=title,
                storage_path=None,
                page_count=None,
                dry_run=dry_run,
            )
            _accumulate(totals, stats)
        for p in pdfs_on_page:
            if p not in pdf_accumulator and len(pdf_accumulator) < MAX_PDFS_PER_DEV:
                pdf_accumulator.append(p)
        time.sleep(PER_PAGE_DELAY_S)


def _process_one_pdf(
    pdf_url: str,
    *,
    spec: DeveloperSpec,
    developer_id: str,
    dry_run: bool,
) -> Optional[dict]:
    """Download → extract → upload to Storage → process. Returns source stats or None on skip."""
    print(f"  PDF: {pdf_url}")
    blob = download_pdf(pdf_url)
    if not blob:
        return None
    extracted = extract_pdf(blob)
    if not extracted.text:
        print("    no extractable text (image-only PDF?)")
        return None

    storage_path: Optional[str] = None
    if not dry_run:
        fname = re.sub(r"[^a-z0-9._-]+", "-", urlparse(pdf_url).path.split("/")[-1].lower()) or "doc.pdf"
        storage_path = f"{spec.slug}/{repo.sha256(blob)[:12]}-{fname[:60]}"
        repo.upload_asset("developer-assets", storage_path, blob, "application/pdf")

    return process_source(
        developer_id=developer_id,
        source_url=pdf_url,
        doc_type="brochure",
        raw_text=extracted.text,
        title=extracted.title,
        storage_path=storage_path,
        page_count=extracted.page_count,
        dry_run=dry_run,
    )


def crawl_developer(spec: DeveloperSpec, dry_run: bool) -> dict:
    """Crawl one developer end-to-end. Returns aggregate stats."""
    print(f"\n=== {spec.name} ({spec.official_url}) ===")
    totals = {
        "project_pages": 0, "pdfs": 0,
        "projects_extracted": 0, "chunks_created": 0,
        "skipped_unchanged": 0,
    }

    developer_id = "dry-run"
    if not dry_run:
        developer_id = repo.upsert_developer(spec.name, spec.slug, spec.official_url)
        if not developer_id:
            print(f"  Could not upsert developer {spec.name}")
            return totals
        repo.mark_developer_crawl(developer_id, "crawling")

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_context(user_agent=USER_AGENT).new_page()

            project_urls, root_pdfs = discover_links(page, spec.official_url, spec.project_path_re)
            print(f"  Discovered {len(project_urls)} project pages, {len(root_pdfs)} root PDFs")

            all_pdfs: list[str] = list(root_pdfs)
            _process_project_pages(
                page,
                project_urls=project_urls,
                developer_id=developer_id,
                dry_run=dry_run,
                totals=totals,
                pdf_accumulator=all_pdfs,
            )
            browser.close()

        # PDFs processed outside Playwright (plain HTTP).
        for pdf_url in all_pdfs[:MAX_PDFS_PER_DEV]:
            stats = _process_one_pdf(pdf_url, spec=spec, developer_id=developer_id, dry_run=dry_run)
            if stats is None:
                continue
            totals["pdfs"] += 1
            _accumulate(totals, stats)
            time.sleep(PER_PAGE_DELAY_S)

        if not dry_run:
            repo.mark_developer_crawl(developer_id, "ok")

    except Exception as exc:
        print(f"  Error crawling {spec.name}: {exc}")
        if not dry_run and developer_id != "dry-run":
            repo.mark_developer_crawl(developer_id, "error", str(exc))
        raise

    print(
        f"  Totals: pages={totals['project_pages']} pdfs={totals['pdfs']} "
        f"projects_extracted={totals['projects_extracted']} "
        f"chunks={totals['chunks_created']} unchanged_skips={totals['skipped_unchanged']}"
    )
    return totals


def _resolve_targets(args) -> list[DeveloperSpec]:
    """Pick which developers to crawl based on CLI flags. Exits the process for
    invalid combinations or empty queues."""
    if args.queued:
        rows = repo.fetch_queued_developers(limit=args.max)
        if not rows:
            print("No developers in the recrawl queue.")
            sys.exit(0)
        # Phase 1 hand-curated regexes by slug; arbitrary slugs fall through
        # to link_classifier auto-discovery.
        registry_by_slug = {s.slug: s for s in REGISTRY}
        targets: list[DeveloperSpec] = []
        for r in rows:
            spec = registry_by_slug.get(r["slug"])
            targets.append(spec or DeveloperSpec(
                name=r["name"],
                slug=r["slug"],
                official_url=r["official_url"],
                project_path_re=None,
            ))
        return targets

    if args.only:
        targets = [s for s in REGISTRY if s.slug == args.only]
        if not targets:
            print(f"Unknown developer slug: {args.only}")
            sys.exit(2)
        return targets

    return REGISTRY[: args.max]


def main() -> None:
    parser = argparse.ArgumentParser(description="Developer Intelligence Scraper")
    parser.add_argument("--only", help="Run a single developer slug (e.g. emaar-properties)")
    parser.add_argument("--max",  type=int, default=len(REGISTRY))
    parser.add_argument("--dry-run", action="store_true", help="No LLM calls, no DB writes")
    parser.add_argument("--queued", action="store_true",
                        help="Crawl developers flagged 'pending' by the recrawl-trigger edge fn")
    args = parser.parse_args()

    if not repo.configured() and not args.dry_run:
        print("SUPABASE not configured. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.")
        sys.exit(2)

    targets = _resolve_targets(args)

    grand: dict[str, int] = {"pages": 0, "pdfs": 0, "projects": 0, "chunks": 0}
    failed = 0
    for spec in targets:
        try:
            t = crawl_developer(spec, dry_run=args.dry_run)
            grand["pages"]    += t["project_pages"]
            grand["pdfs"]     += t["pdfs"]
            grand["projects"] += t["projects_extracted"]
            grand["chunks"]   += t["chunks_created"]
        except Exception:
            failed += 1
            continue

    print(
        f"\nDONE. devs={len(targets)} (failed={failed}) pages={grand['pages']} "
        f"pdfs={grand['pdfs']} projects_extracted={grand['projects']} chunks={grand['chunks']}"
    )
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
