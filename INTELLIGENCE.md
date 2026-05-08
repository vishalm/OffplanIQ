# OffplanIQ — LLM-Powered Property Intelligence

> Plan + live tracker for the LLM-grounded scraper / RAG system.
> Sibling document to `PLAN.md` (which covers the original Day-1 product plan).
> Owner: Vishal · Last updated: 2026-05-06

## Vision

A single intelligence layer that knows every off-plan project in the UAE — pricing, unit mix, payment plans, handover risk, developer track record — grounded in primary sources (developer brochures, RERA filings, DLD transactions) and queryable in natural language. Not a listing aggregator. An agent that can answer *"Which sub-2M Dubai 1BRs by top-quartile developers handing over before Q3 2027 have positive 30-day PSF momentum?"* with citations.

## North-star outcomes

- **Coverage:** every UAE developer, every active off-plan project (~150 developers / ~1,500 projects)
- **Freshness:** ≤24 h transactions · ≤7 d project metadata · ≤30 d brochure re-crawl
- **Grounding:** every numeric claim in chat answers cites a source document
- **Latency:** chat p50 < 3 s, p95 < 8 s
- **Cost:** ≤ $50 / month at steady state

---

## Architecture (after Phase 1)

```
┌─ Sources ──────────────────────────────────────────────────┐
│  DLD open-data API   (transactions, market data)            │
│  Property Finder     (project listings, prices)             │
│  Developer sites     (Emaar, Sobha, Damac, Aldar, ...)      │
│  Developer PDFs      (brochures, factsheets)                │
│  RERA registry       (Phase 2)                              │
└────────────┬────────────────────────────────────────────────┘
             │
┌────────────▼─── apps/scraper ──────────────────────────────┐
│  scrapers/dld.py                  scrapers/pf_scraper.py    │
│  scrapers/developer_intelligence.py  ◄── Phase 1            │
│       │                                                     │
│       ├─► Playwright fetch site + discover PDFs             │
│       ├─► pypdf extract text                                │
│       ├─► Azure OpenAI: structured extraction (gpt-4o-mini) │
│       ├─► chunk + embed (text-embedding-3-small, 1536-d)    │
│       └─► upsert projects + insert documents/chunks         │
└────────────┬────────────────────────────────────────────────┘
             │
┌────────────▼─── Supabase ──────────────────────────────────┐
│  Tables:    projects, developers, dld_transactions          │
│             documents, document_chunks  ◄── new             │
│  Extension: pgvector                    ◄── new             │
│  Storage:   developer-assets/...        ◄── new             │
└────────────┬────────────────────────────────────────────────┘
             │
┌────────────▼─── apps/web ──────────────────────────────────┐
│  /api/chat   ◄── RAG: query embedding → vector search →     │
│                  context-stuffed LLM with citations         │
│  /analytics  /search  /projects/[id]  (existing)            │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Foundation (MVP)

**Goal:** Top 10 UAE developers ingested end-to-end. Real `total_units`, `unit_types`, `handover_date` populated for ≥80 % of their projects. Chat answers brochure-grounded questions with citations.

| # | Task | Status |
|---|---|---|
| 1.1 | Migration: pgvector + `documents` + `document_chunks` tables (RLS, IVFFlat index, `search_document_chunks` RPC, `developers.official_url`/`crawl_status`) | [x] **code shipped** — file `supabase/migrations/20260506000006_pgvector_and_documents.sql`. **BLOCKED on prod apply** (DDL needs user authorization) |
| 1.2 | Storage bucket `developer-assets` (public read, service-role write) | [x] **bundled into migration 1.1** — applies same time |
| 1.3 | Python helpers: `lib/azure_openai.py`, `lib/llm_extract.py`, `lib/embeddings.py`, `lib/pdf.py`, `lib/supabase_repo.py` | [x] **shipped** |
| 1.4 | `scrapers/developer_intelligence.py` end-to-end (10-developer registry, Playwright discovery, PDF download to Storage, LLM extract, chunk+embed, idempotent upserts) | [x] **shipped** |
| 1.5 | Run on top 10 developers, verify in DB | [ ] **blocked** — needs (a) migration applied (b) `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` set in `.env` |
| 1.6 | RAG retrieval wired into `/api/chat` with citation rendering in `AiChat.tsx` (sidebar list, doc-type tag, similarity-ranked) | [x] **shipped** — `azureEmbed()` + `retrieveRagContext()` + `Source[]` flow to UI |
| 1.7 | Hook into nightly orchestrator (`main.py` Step 2.5, `--skip-intel` flag) | [x] **shipped** |

**Phase 1 Definition-of-Done**

- [ ] `select count(*) from projects where total_units > 0` ≥ 40
- [ ] `select count(*) from documents` ≥ 30
- [ ] `select count(*) from document_chunks where embedding is not null` ≥ 1000
- [ ] Asking *"what's the unit mix at Creek Bay?"* in chat returns a brochure-cited answer
- [ ] `/analytics` "Total Units" widget shows non-zero

---

## Phase 2 — Coverage

**Goal:** Every active UAE developer ingested, brochures auto-discovered.

| # | Task | Status |
|---|---|---|
| 2.1 | Developer registry from RERA + ADM (≈ 150 devs) | [~] **partial** — DLD `/open-data/developers` is currently down on their end (Cloudflare 500). Working seed: extract distinct developer names from existing DLD `building_name` "by X" patterns; bootstrap by harvesting from PF scrape (already 65 in DB). True RERA list deferred until DLD endpoint recovers. |
| 2.2 | Brochure auto-discovery (URL+anchor heuristics → LLM zero-shot fallback) | [x] **shipped** — `lib/link_classifier.py` (heuristic-first, LLM batch-25 fallback for ambiguous links); scraper now treats `project_path_re` as optional and uses classifier for arbitrary developer sites |
| 2.3 | Multi-language extraction (Arabic/English) | [ ] todo |
| 2.4 | Per-field confidence + human-review queue (`extraction_review` table) | [ ] todo |
| 2.5 | `developer-recrawl` edge function on cron | [x] **shipped** — `supabase/functions/developer-recrawl-trigger/` flags stalest N developers as `pending`; scraper has new `--queued` mode + `repo.fetch_queued_developers()` to drain the queue |

---

## Phase 3 — Real-time intelligence

| # | Task | Status |
|---|---|---|
| 3.1 | Change detection: `project_updates` table + diff logic in `upsert_project` | [x] **shipped** — migration `20260506000007_project_updates.sql` (table + `recent_project_updates` RPC), 10 tracked fields with type-aware diff (`array`/`numeric`/`date`/`text`), `delta_pct` for numeric changes |
| 3.2 | Launch radar edge fn + alert dispatch | [x] **shipped** — `supabase/functions/launch-radar/` walks fresh `change_type='launch'` rows, fans out alerts to opted-in users + project watchers, stamps `notified_at`. Wired into `main.py` Step 6. |
| 3.3 | Cross-source PSF time-series (PF + DLD + brochure) | [x] **shipped** — `record_psf(project_id, psf, source='brochure')` called from `upsert_project` whenever the LLM extracts `starting_psf_aed`. `psf_history.source` already accepts free-text. |

---

## Phase 4 — Agent capabilities

| # | Task | Status |
|---|---|---|
| 4.1 | LLM tools: `search_projects`, `compare_projects`, `find_similar_projects`, `compute_irr`, `recent_updates` + multi-turn tool-call loop in `/api/chat` | [x] **shipped** — `lib/chat-tools.ts` (5 tools, schemas + executors), `azureChatWithTools()` (max 5 iterations, fallback to no-tools turn on error), tool invocations exposed in chat response |
| 4.2 | Floor-plan extraction via GPT-4o vision (bedrooms, sqft per unit) | [ ] **deferred** — needs Azure GPT-4o-vision deployment |
| 4.3 | Saved searches with daily diffs | [x] **mostly shipped** — migration `20260506000008_saved_searches.sql` (table, RLS, `saved_search_diff` enum value); CRUD API `/api/saved-searches` (GET/POST/DELETE, owner-scoped); `supabase/functions/saved-search-diffs/` cron fn (re-runs filters, diffs vs `last_run_match_ids`, emits alert with added/removed names). UI button **deferred** — superseded by Phase 5 redesign |
| 4.4 | SSE streaming responses with progressive citations | [ ] **deferred** — large rewrite; do alongside Phase 5 |

---

## Phase 5 — AI-first website (in progress)

**Vision:** OffplanIQ should *be* the AI, not a dashboard with a chat icon. The home page is a single prompt input. Charts and project tables are *response cards inside the conversation*, not separate pages.

**Theme decision (user override 2026-05-07):** Stay on the existing **light theme** (white surface, blue accent, Inter) for consistency across pages. The original spec called for warm-dark/Dubai-gold; we kept the dark CSS tokens in place (additive) but DO NOT apply them on `/` or `/ask/[id]`. Conversation pages match `/search`, `/analytics`.

The existing `/search`, `/analytics`, `/projects/[id]` pages stay as drill-down deep-links the AI can route to.

| # | Task | Status |
|---|---|---|
| 5.1 | Design pass: light theme reused (no warm-dark); typographic stagger + fade-in motion classes already in `globals.css`; suggestion chips + prompt focus ring | [x] **shipped** |
| 5.2 | New landing route `/` — full-bleed prompt input, suggestion chips, minimal header (brand + sign-in only) | [x] **shipped** — `app/page.tsx` (light theme) + `components/ai/LandingPrompt.tsx` (auto-grow textarea, Enter sends, anon → login with seed) |
| 5.3 | Conversation page `/ask/[threadId]` — server-rendered shell, client `Conversation` component handles next-turn loop; auto-runs assistant for trailing user message | [x] **shipped** — `app/ask/[id]/page.tsx` + `components/ai/Conversation.tsx` |
| 5.4 | SSE streaming on `/api/chat` (subsumes Phase 4.4) — token-by-token, citations stream as found | [ ] **deferred** — large rewrite; current path is request/response, "thinking dots" stand in for streaming |
| 5.5 | Tool-result inline cards: project grid (search/find_similar), comparison table, IRR widget, update feed; collapsible with arg summary in header | [x] **shipped** — `components/ai/ToolResultCard.tsx` |
| 5.6 | Persistent threads — `chat_threads` + `chat_messages` migration with RLS; `/api/threads` POST creates thread + first user message, GET lists; `/api/threads/[id]` GET loads, POST appends + runs assistant + persists tool rows + assistant turn | [x] **shipped** |
| 5.7 | Reframe `/analytics` and `/search` as drill-downs from chat | [ ] todo |
| 5.8 | Demo prompts on landing wired to seed conversations | [x] **shipped** — 6 chips on landing, anon goes to login carrying `?seed=`, signed-in users hit `/api/threads` directly |
| 5.9 | Mobile-first: prompt input docks to bottom, conversation scrolls full-height | [~] **partial** — flex-column layout with sticky-style input row; explicit mobile pass deferred |

---

## Decisions locked

| Decision | Rationale |
|---|---|
| Azure OpenAI as LLM provider | Already wired in `apps/web/lib/azure-openai.ts` |
| `text-embedding-3-small` (1536-d) | $0.02/1M tokens; can swap to `-large` later |
| `gpt-4o-mini` for extraction | $0.15/1M input, structured output reliable |
| Supabase pgvector | Already in stack; IVFFlat fine for ~1M vectors |
| Python scraper / Deno edge / Next.js web | No new runtimes |
| Chunk size 800 tokens, 100 overlap | Standard for technical docs |
| DLD = source-of-truth for `current_psf`, `units_sold` | Brochures show "starting from"; only DLD has real transactions |

## Open questions (waiting on user)

| # | Question | Recommendation |
|---|---|---|
| Q1 | OCR scanned PDFs? | Phase 2 — start text-extractable only |
| Q2 | Re-crawl frequency? | Daily for top-20, weekly for tail |
| Q3 | Citation UI: inline `[1]` or sidebar? | Sidebar — keeps prose readable |
| Q4 | Show low-confidence AI fields? | Yes, with "AI-extracted" badge |

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Developer site Cloudflare blocks scraper | Med | High | Per-site delay, proxy in Phase 2 |
| LLM hallucinates `total_units` | Med | High | JSON schema, low temperature, cross-check vs source text |
| Brochures lag live site | High | Med | Show `as_of` per field |
| pgvector index degrades at scale | Low | Med | Switch to HNSW or hybrid search in Phase 3 |
| OpenAI rate limit during initial ingest | Med | Low | Backoff + concurrency cap (5 parallel) |

---

## Tracker — chronological progress log

> One line per shipped item. Add `(commit:<sha>)` when committed.

- 2026-05-06 22:01 — [0] INTELLIGENCE.md initialised; starting Phase 1
- 2026-05-06 22:30 — [1.1] Migration file written (pgvector ext, `documents`, `document_chunks`, `search_document_chunks` RPC, `developers.crawl_status`, `developer-assets` bucket + RLS); awaits prod apply
- 2026-05-06 22:30 — [1.2] Storage bucket bundled into 1.1
- 2026-05-06 22:35 — [1.3] Python lib shipped: `azure_openai.py` (chat_json + embed_batch with retry), `embeddings.py` (paragraph-aware chunker + tiktoken-or-heuristic counter), `pdf.py` (pypdf wrapper, soft-fail on parse errors), `llm_extract.py` (strict-JSON system prompt, normalised output), `supabase_repo.py` (idempotent upserts, content-hash change detection)
- 2026-05-06 22:40 — [1.4] `developer_intelligence.py` shipped: 10-developer registry, Playwright discovery + project-page crawl, PDF download → Supabase Storage, LLM extraction → projects upsert, chunk+embed → document_chunks; `--only` / `--max` / `--dry-run` flags
- 2026-05-06 22:42 — [1.6] RAG: `azureEmbed()` added to web Azure helper; `retrieveRagContext()` extracted in `route.ts` (vector-search via `search_document_chunks` RPC, embeds user question, returns top-8 ≥ 0.25 cosine similarity); `AiChat.tsx` renders sources sidebar with doc-type tag and clickable URLs
- 2026-05-06 22:43 — [1.7] `main.py` Step 2.5 wired ("Developer intelligence (LLM)"), `--skip-intel` flag; `parse_args` and `trigger_edge_step` extracted to drop main() complexity below threshold
- 2026-05-06 22:45 — [1.5] **BLOCKED** awaiting (a) migration apply (b) `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` deployment created in Azure
- 2026-05-06 23:05 — [2.1] DLD `/open-data/developers` endpoint confirmed down on their side (same Cloudflare 500 as `/projects`); RERA list deferred. PF-derived 65-dev seed remains the working catalogue.
- 2026-05-06 23:08 — [2.2] `lib/link_classifier.py` shipped: 6 heuristic regexes classify ~70% of links cheaply, ambiguous batches go to LLM (batch=25). `discover_links()` now accepts optional regex; falls through to classifier for arbitrary developers. `crawl_developer()` refactored into `_process_project_pages()` + `_process_one_pdf()` + `_accumulate()` to cap complexity.
- 2026-05-06 23:12 — [2.5] `supabase/functions/developer-recrawl-trigger/index.ts` shipped: cron-able edge fn picks N stalest developers (configurable `max_age_days`/`batch_size`/`force`) and flags them `crawl_status='pending'`. Scraper now has `--queued` mode that drains the queue via `repo.fetch_queued_developers()`. `_resolve_targets()` extracted from `main()` to keep complexity ≤ 15.
- 2026-05-06 23:25 — [3.1] Migration `20260506000007_project_updates.sql` shipped: `project_updates` table (`change_type` check, `field`, `before_value`/`after_value` jsonb, `delta_pct`, `notified_at`), partial index on unnotified rows, `recent_project_updates` RPC with project+developer denormalised. `supabase_repo._diff_project()` snapshots project before each upsert, emits one row per changed tracked field; first-time inserts emit `change_type='launch'`.
- 2026-05-06 23:28 — [3.3] Cross-source PSF: `record_psf(project_id, psf, source='brochure')` wired into `upsert_project` whenever the LLM extracts a starting PSF. `psf_history` schema needed no change (text source). Existing PSF chart on project detail page picks it up automatically.
- 2026-05-06 23:32 — [3.2] `supabase/functions/launch-radar/index.ts` shipped: walks fresh `change_type='launch'` rows ≤24h, fans alerts to (opted-in users) ∪ (project watchers), inserts into `alerts_log` (`alert_type='new_launch'`), stamps `notified_at` for dedup. Wired into `main.py` Step 6.
- 2026-05-06 23:55 — [4.1] LLM tools shipped: `lib/chat-tools.ts` (5 tools: search_projects, compare_projects, find_similar_projects, compute_irr, recent_updates with JSON schemas + executors that hit `projects`/`payment_plans`/`document_chunks`/`recent_project_updates` RPC). `azureChatWithTools()` does the multi-turn loop (max 5 iterations, falls back to no-tools turn on tool-call error). `/api/chat` returns `tool_invocations` + `iterations` so the UI can show "thinking…" indicators.
- 2026-05-07 00:05 — [4.3] Saved-searches stack shipped (UI button deferred → folded into Phase 5): migration `20260506000008` with RLS-scoped `saved_searches` table + new `alert_type='saved_search_diff'` enum value; `/api/saved-searches` GET/POST/DELETE (filters validated and clamped); `supabase/functions/saved-search-diffs/` cron fn re-runs filters → diffs vs `last_run_match_ids` → writes one alert per changed search with added/removed project names.
- 2026-05-07 00:10 — [5] **NEW PHASE 5 ADDED**: AI-first website redesign. Reference: alpha.g42.ai aesthetic. Conversation as primary surface, charts/tables as inline cards, no chatbot icon. 9 sub-items defined; UI button from 4.3 absorbed into 5.7. Phase 4.4 (streaming) absorbed into 5.4.
- 2026-05-07 02:10 — [5.1–5.6, 5.8] Light-theme landing + conversation route shipped. `chat_threads`/`chat_messages` migration; `/api/threads` + `/api/threads/[id]` (load/append/run-assistant + persist tool rows + assistant turn); `Conversation.tsx` runs trailing-user-message follow-up; `ToolResultCard.tsx` renders project grids, comparison tables, IRR widget, update feed.
- 2026-05-07 02:30 — **Score-spread fix**: 91% of projects sat at 25-29 (fake-flat 35). Three changes: (a) `score_snapshots` upsert was silently failing on the unique `(project_id, score_date)` constraint — added `onConflict`; (b) curated developer-tier ranking (`scripts/rank-developers.mjs` — Emaar/Sobha=98, Aldar/Meraas=92, Ellington=80, long-tail=52 with project-count + avg-PSF tie-breakers); (c) reweighted formula from 40/30/20/10 to 35/20/30/15 and gave `psf_delta` a richer no-history fallback (units_sold-aware: 16 if ≥5 sales, 12 if ≥1, 10 if observable, 6 if silent). Result: distribution 31–72 (mean 41), Emaar projects with active sales hit 70+, no-data projects sit at 31-39.
- 2026-05-07 02:40 — **DLD backfill 60 days**: 524 → 3,310 transactions (6.3×). Re-matched: 36 → 136 matched-to-project; 23 projects now have real `units_sold` (was 15) — Inara Residence leads with 30 DLD-matched sales.
- 2026-05-07 02:55 — **Playwright e2e infra shipped** at `apps/web/e2e/`: `playwright.config.ts` (4 projects: setup, chromium public, chromium-auth via `storageState`, mobile/firefox cross-browser), 6 spec files (landing, auth, search.auth, analytics.auth, project-detail.auth, chat.auth, api.auth), test-user fixture creates real Supabase user via admin API. **10/10 chromium specs pass; 6/6 mobile pass.** `npm run test:e2e` runs the suite, `npm run test:e2e:ui` for debugging.
- 2026-05-07 03:30 — **Anti-fake-metric pass** ahead of buyer demo. Removed every metric we couldn't substantiate from real ingested data, since UAE property professionals will spot fakery instantly:
  - **DeveloperCard** — dropped `on_time_delivery_pct` (forced 100% from default `on_track`), `rera_complaints_count` / `rera_violations_count` (no public source), `avg_roi_pct` (no historical PSF depth). Replaced with **Tier badge** (Tier 1/2/3/4 from curated developer ranking), **active/total project counts** (real from DB), **Avg portfolio PSF** (DLD-derived). Footer note explains what's intentionally absent.
  - **/analytics headline strip** — dropped `Total Units` (no inventory source), `Est. Market Value` (depends on Total Units), `% absorption` (same divisor problem). Now 4 honest tiles: Total Projects · DLD Sales Tracked · Avg Score · Avg PSF.
  - **Developer Rankings list** — dropped `% on-time` line under each developer.
  - **Sell-through Distribution chart** — now falls back to `units_sold` buckets (20+/10-19/5-9/1-4/No sales) when `sellthrough_pct` is largely zero (i.e. when total_units missing). Real signal, no fake divisor.
  - **Handover Health pie** — derived from `current_handover_date` proximity vs today (12+ months out / Within 12 months / Past handover date) instead of the hard-defaulted `handover_status='on_track'` flag. Real timing signal.
  - **Project detail Demand tile** — when `total_units=0` shows "30 DLD-matched sales · Total units unconfirmed" instead of the broken "30/0 sold, 0%".
  - **`uae-geo.ts`** — added `Madinat Al Mataar` and `Expo Valley` to the Dubai area list so DLD txns under those names map correctly.
- 2026-05-07 03:45 — **All 7 emirates panel** on /analytics — 7 tiles always rendered (Dubai/Abu Dhabi/Sharjah/Ajman/RAK/Fujairah/Umm Al Quwain). Empty tiles say "No projects yet" rather than being hidden, so coverage gaps are visible. Each tile: count, avg PSF, avg score, sales tracked. Tiles link to `/search?city=...` for drill-down.
- 2026-05-07 05:00 — **DLD 90-day backfill** complete: 524 → **4,462 real transactions** (8.5×). Re-matched: 196 sales now linked to projects (was 135). 23 projects have real `units_sold` from DLD. Top scorer changed from Hado by Beyond to a 4-way tie at 71 (Creek Haven · Inara Residence · The edit at D3 · **Terra Woods** — the latter is Emaar's Expo City project, vindicating the user's Expo City test case with real DLD evidence: 16 matched sales). Inara Residence leads on raw velocity at 42 sales.
- 2026-05-07 05:00 — **Data-source decision** for off-plan listing-level data: scrapers/pf_search.py written but PF protects `/en/search` with PerimeterX-style "Human Verification" page (Playwright + spoofed Chrome 130 UA hits the captcha). Project-level scraper (`scrapers/pf_scraper.py` on `/new-projects/lp/<city>`) stays unprotected and is the working path. Listing-level data needs Apify (community actor handles fingerprinting) or PF Partner API (RERA license). Apify ingester scaffold (`scripts/ingest-from-apify.mjs`) shipped, drop-in once a token is added to `.env`.
- 2026-05-07 05:30 — **Chat-driven data ingest** shipped. Users can now feed the catalogue from the chat widget without leaving it:
  * **Window controls** on `AiChat.tsx` — minimise / restore / expand / close. Three sizes (260×44 / 400×560 / 640×80vh).
  * **`/api/ingest` (POST)** — accepts `{ url }` (server fetches + strips HTML), `{ text }` (free-form), or multipart `file` (CSV / JSON / TXT). Routes raw text through `lib/ingest-extractor.ts` (Azure OpenAI `json_object` mode, same schema the Python `lib/llm_extract.py` uses). Each extracted row gets a self-reported `confidence` 0-1.
  * **Two-phase write contract**: rows with `confidence ≥ 0.7` AND name + (area or city) **auto-write**; rows 0.3–0.7 go to a preview list the user must confirm with checkboxes; below 0.3 are silently dropped. DLD-protected fields (`current_psf`, `units_sold`, `sellthrough_pct`) are never written from chat ingest.
  * **`/api/ingest` (GET)** — downloads `offplaniq-ingest-template.csv` with the exact column order the extractor expects (so users can pre-format and get 1.0 confidence).
  * **`AiChat.tsx`** wires it: paperclip button opens file picker; URL-only inputs (or `ingest <url>` / `scrape <url>`) trigger ingest instead of chat; `<IngestPreviewCard>` renders confirmation checklist with confidence pill badges.
  * Auth-gated, body capped at 8 MB, URL fetch capped at 4 MB / 15 s timeout, `Mozilla/5.0 (compatible; OffplanIQ/1.0; chat-ingest)` UA.
- 2026-05-07 04:30 — **User-supplied UAE Master DB ingested** (`UAE_Property_Developers_Complete_v1.xlsx` — 49 developers, sourced from DLD/ADX/DFM filings + company sites + PF/Bayut/Zawya, compiled May 2025). Replaces my hand-curated tier system with authoritative real data:
  - **Migration `20260507000001`** (file written, awaits prod apply) — adds 15 nullable columns to `developers`: `tier`, `tier_rank`, `ownership_type`, `key_person`, `hq_address`, `phone_direct`, `phone_hotline`, `email`, `segments`, `employees`, `est_revenue`, `geographic_presence`, `stock_listing`, `social_media`, `key_projects`. Indexes on `tier_rank` and `hq_location`.
  - **Seeder `scripts/seed-developers-from-excel.mjs`** — Python helper (`scripts/_xlsx-to-json.py`) parses the master DB sheet; node script fuzzy-matches by name (strips `PJSC`/`LLC`/`Properties`/`Holding`/`by <Vendor>` etc.) so "Aldar Properties PJSC" + "Aldar Properties" collapse, and PATCHES existing rows instead of creating duplicates. Column-tolerant: silently drops fields the schema doesn't have until migration applies. Idempotent.
  - **Dedupe `scripts/dedupe-developers.mjs`** — collapses near-duplicates (e.g. "Beyond by Beyond" + "BEYOND Developments" + "Beyond"), promoting the cleaner display name onto the keeper before deleting. Refuses to delete any row that still has `projects.developer_id` references. Result: 103 → 96 developers, 5 keepers renamed (Aldar/Beyond/Meraas etc.).
  - **Coverage now**: 96 developers · 46 with real `founded_year` · 46 with real `website_url` · 10 Tier-1 master developers correctly scored at 92+. The remaining 50 are PF-scrape-only entries that the Excel doesn't cover (long-tail boutique developers); they retain `developer_score=50-65` from the original tier ranking.
  - **Score recalc**: Project scores held at 28-71 (mean 40.2) — no fake inflation, just the same real signals (DLD-matched sales + Dubai-gold tier weighting + handover proximity) anchored to authoritative source data.


