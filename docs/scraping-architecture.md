# Scraping & inference architecture

## Today

```
┌──────────────────┐    Playwright    ┌────────────────────┐
│  Railway scraper │ ───────────────► │  Source websites   │
│  (Python 3.11)   │                  │  (DLD, PF, devs)   │
└────────┬─────────┘                  └────────────────────┘
         │ raw text + PDFs
         ▼
┌──────────────────┐    chat_json    ┌────────────────────┐
│  llm_extract.py  │ ───────────────► │  LLM (any provider)│
│  (apps/scraper)  │                  │  default: Ollama   │
└────────┬─────────┘                  └────────────────────┘
         │ structured rows
         ▼
┌────────────────────────────────────────────────────────┐
│  Supabase Postgres (RLS) — projects, developers,       │
│  payment_plans, project_updates, document_chunks,      │
│  score_snapshots, dld_transactions, market_summary     │
└────────────────────────────────────────────────────────┘
```

## What ScrapeGraphAI changes

[`apps/scraper/lib/scrapegraph.py`](../apps/scraper/lib/scrapegraph.py) wraps
[ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai) as an
optional first-pass extractor. The pipeline becomes:

```
Source URL ──► SGAI graph ──► structured dict ──► supabase_repo upsert
                  │
                  └─ falls back to llm_extract.py if SGAI not installed
```

Why bother:

- **Layout-aware**. SGAI's `SmartScraperGraph` builds a DOM graph and asks
  the LLM *which regions* are relevant before extracting. Our hand-rolled
  text strip throws everything at the model and burns tokens on nav, ads,
  and footers.
- **Tables survive**. Payment-plan and unit-mix tables render as `<table>`
  blocks in the DOM, which our `re.sub('<[^>]+>', ' ', ...)` flattens into
  whitespace soup. SGAI keeps them structured.
- **Same provider switch**. SGAI is configured from the same `LLM_PROVIDER`
  env we use everywhere — Ollama (default), Azure, OpenAI, OpenRouter.
- **Optional**. The dep is heavy (langchain + faiss). Existing scrapers
  keep working; new scrapers opt in.

## What can move to Supabase

| Concern                        | Today                         | Supabase fit?                                                                   |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------- |
| Browser rendering (Playwright) | Railway scraper               | **No** — Edge Functions don't ship Chromium.                                    |
| HTML → structured JSON via LLM | Railway scraper               | **Yes, partial.** New `extract-page` Edge Function can call any LLM provider.   |
| Embedding new chunks           | Railway scraper               | **Yes.** `embed-document-chunks` Edge Function (Deno) — same provider switch.   |
| Vector search                  | Already in Postgres (pgvector) | Already there.                                                                  |
| Score recalculation            | Edge Function (`score-recalculator`) | Already there.                                                                  |
| Daily digests / alert dispatch | Edge Function (`digest-sender`, `alert-dispatcher`) | Already there.                                                                  |
| Change detection (project_updates) | Edge Function (`launch-radar`) | Already there.                                                                  |
| Periodic cron triggers         | Supabase scheduler            | **Yes** — replace any external cron.                                            |
| Browse + scoring queries       | Edge Function or REST          | Already there (PostgREST + RPCs).                                               |

### Concrete next moves (in order of value)

1. **Push `embed_batch` to a Supabase Edge Function**. The scraper sends raw chunks; the function holds the LLM credentials and writes to `document_chunks`. Benefit: the scraper machine never sees a cloud API key, embedding back-pressure lives on Supabase's connection pool, and you can run the scraper from any laptop.
2. **Move score-snapshot writes inside `score-recalculator`**. The web app currently posts via REST; pulling the recompute trigger into the Edge Function removes a round-trip and centralises the algorithm.
3. **Materialised views for `/analytics`**. We already have `market_summary`; add `developer_leaderboard` and `area_velocity` materialised views and refresh them from `score-recalculator`. The web app reads them with one `select *`.
4. **Edge Function `extract-page`**. Accepts `{ url }` from the scraper; runs SGAI server-side; returns the structured dict. Removes Playwright + LLM call cost from the scraper machine, but requires a Chromium-capable runtime — for now keep this on Railway, revisit when Supabase ships browser support (or proxy via Browserless).

## Provider switch (recap)

The scraper resolves provider via `apps/scraper/lib/llm.py` (mirrors
`apps/web/lib/llm/`). Switching providers is a single env flip:

```env
LLM_PROVIDER=ollama        # default — local, no key required
# LLM_PROVIDER=azure
# LLM_PROVIDER=openai
# LLM_PROVIDER=openrouter
```

See [docs/llm-providers.md](./llm-providers.md) for the full env reference.
