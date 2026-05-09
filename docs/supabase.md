# Supabase operations playbook

Everything you need to operate the OffplanIQ Supabase project — schema, edge functions, RLS, pgvector, cron, RPCs, storage, and the recipes we actually run. Bookmark this; if a Supabase trick is missing, add it.

> **Project basics**
> - **Project URL**: `$NEXT_PUBLIC_SUPABASE_URL` (set in `.env`)
> - **Anon key**: `$NEXT_PUBLIC_SUPABASE_ANON_KEY` — for the browser, RLS-bound
> - **Service-role key**: `$SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS, NEVER ship to the client
> - **Postgres version**: 15+, with `pg_cron`, `pg_net`, `pgvector`, `pgcrypto`
> - **Region**: pick the one closest to UAE (Frankfurt or Singapore — never us-east-1 for this app)

---

## 1 · Migrations

### Layout

```
supabase/migrations/
  20260407000001_initial_schema.sql           # core tables, enums, RLS, triggers
  20260407000002_cron_and_rpc.sql             # pg_cron + helper RPCs
  20260506000001_fix_handle_new_user_search_path.sql
  20260506000002_fix_market_summary_launches_filter.sql
  20260506000003_fix_market_summary_avg_sellthrough.sql
  20260506000004_add_city_to_projects.sql
  20260506000005_add_narrative_and_news.sql   # narrative + news columns on projects
  20260506000006_pgvector_and_documents.sql   # documents + document_chunks + IVFFlat + RPC
  20260506000007_project_updates.sql          # change-detection log + recent_project_updates RPC
  20260506000008_saved_searches.sql           # saved_searches + saved_search_diffs
  20260506000009_chat_threads.sql             # chat_threads + chat_messages
  20260507000001_developer_tier_metadata.sql  # tier, key_person, contacts on developers
  20260509000001_scrape_jobs.sql              # async scrape queue + claim_next_scrape_job RPC
```

### Rules

- **Never** edit a committed migration. Always add a new one.
- File-name convention: `YYYYMMDDHHMMSS_description.sql`. The lexicographic order is the apply order.
- Every DDL stays idempotent: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `INSERT … ON CONFLICT DO NOTHING`. Re-running the file must be a no-op.
- No destructive resets without an explicit env flag (`DROP`, `TRUNCATE`).
- Add an `updated_at` trigger to every mutable table — see `bump_updated_at()` in `001_initial_schema.sql`.
- Index anything you `WHERE` / `ORDER BY` in the UI. Composite indexes for the common pairs.

### Apply (Dashboard, recommended)

This is the path we use because the local CLI is finicky behind UAE network policies.

1. Open https://supabase.com/dashboard → project → **SQL Editor**.
2. Open the migration file, copy the entire body.
3. Paste in the SQL Editor. **Run**. Read the result panel.
4. If it errors mid-file, fix and re-run — every statement is idempotent so partial state is safe.

Pending migrations right now: **`20260509000001_scrape_jobs.sql`** (the admin queue table + `claim_next_scrape_job()` RPC).

### Apply (CLI alternative)

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <ref-from-dashboard>
supabase db push                                  # applies any unapplied migration files
```

### Add a migration

```bash
# create file with the right timestamp + slug
T=$(date +"%Y%m%d%H%M%S"); touch "supabase/migrations/${T}_my_change.sql"

# write the SQL with idempotent DDL
# then test locally with the SQL Editor before committing
```

---

## 2 · Schema map (what lives where)

| Table | Notes |
|---|---|
| `developers`                   | Curated tier, score, key_person, contact info (Excel-sourced). Slug-unique. |
| `projects`                     | Core. AED integers, PSF integers. RLS: read-all-active, write service-role. |
| `payment_plans`                | One row per plan (e.g. 20/50/30). Joined to `projects` via FK. |
| `psf_history`                  | Append-only. Source ∈ `{dld, brochure, listing}`. Unique on `(project_id, recorded_date, source)`. |
| `score_snapshots`              | Daily rollup written by `score-recalculator`. |
| `dld_transactions`             | DLD open-data ingest. ~4.5K rows. Indexed on `area_name`, `transaction_date`. |
| `documents`                    | Brochures + websites. Body in `content_text`, embedded chunks in `document_chunks`. |
| `document_chunks`              | pgvector column `embedding vector(1536)` (Azure default) or `vector(768)` (Ollama nomic). IVFFlat index. |
| `project_updates`              | Append-only change log: `launch | price_change | handover_change | units_change | …`. Powers the trending strip. |
| `chat_threads` + `chat_messages` | Per-user assistant conversations + tool-call breadcrumbs. |
| `saved_searches`               | URL-encoded filter sets the user has bookmarked. |
| `saved_search_diffs`           | New/dropped projects per saved search per run. |
| `user_profiles`                | Tier + email + full_name. Created on signup via `handle_new_user()` trigger. |
| `watchlist`                    | M2M user ↔ project. |
| `alerts_log`                   | What alerts have been emitted; `is_read` per user. |
| `alert_preferences`            | Per-user thresholds (PSF jump %, handover slip days, score delta). |
| `scrape_jobs`                  | Async queue for the admin Operations Copilot. SKIP-LOCKED `claim_next_scrape_job` RPC. |

### Common columns + conventions

- **PKs**: `UUID DEFAULT gen_random_uuid()` everywhere.
- **Money**: `INTEGER` AED, no decimals, no fils.
- **PSF**: `INTEGER` AED/sqft.
- **Slugs**: lowercase-kebab, unique, `≤80` chars.
- **Timestamps**: `TIMESTAMPTZ DEFAULT now()`, app-side display in `Asia/Dubai`.
- **Enums**: declared in `001_initial_schema.sql` (`project_status`, `handover_status`, `unit_type`, `alert_type`, `subscription_tier`).

---

## 3 · Row-Level Security (RLS)

Defaults:

- **Read-all-active**: signed-in users can `SELECT` rows where `status IN ('active','pre_launch')` for `projects`, `developers`, `payment_plans`. Anon gets nothing on those tables.
- **Per-user**: `watchlist`, `saved_searches`, `chat_threads`, `chat_messages`, `alerts_log`, `alert_preferences` are gated by `auth.uid() = user_id`.
- **Service-role only**: `scrape_jobs`, `dld_transactions`, `document_chunks`, `project_updates`, `score_snapshots`. The web app reads these via the service client. RLS is on with no public policy — closed by default.

### Read all policies on a table

```sql
SELECT polname, polcmd, polqual, polwithcheck
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'projects';
```

### Toggle RLS while debugging (always re-enable)

```sql
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
-- … debug as superuser …
ALTER TABLE projects ENABLE  ROW LEVEL SECURITY;
```

### Adding a policy template

```sql
CREATE POLICY "users read own watchlist" ON watchlist
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own watchlist" ON watchlist
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

---

## 4 · Edge Functions

| Function | Trigger | What it does |
|---|---|---|
| `score-recalculator`        | pg_cron every 6h, plus admin/manual | Recomputes `projects.score` + writes `score_snapshots`. |
| `psf-updater`               | After DLD ingest                    | Rolls fresh `psf_history` rows into `projects.current_psf`. |
| `launch-radar`              | After scraper run                   | Detects newly-inserted `projects` and writes `launch` rows in `project_updates`. |
| `saved-search-diffs`        | pg_cron every 30m                   | Diffs each saved search against its last snapshot, writes `saved_search_diffs`. |
| `developer-recrawl-trigger` | Admin/manual                        | Picks developers with `crawl_status='pending'` and dispatches the recrawl pipeline. |
| `alert-dispatcher`          | pg_cron hourly (`0 * * * *`)        | Sends emails for unread `alerts_log` rows. **Destructive** — admin-confirm before manual fire. |
| `digest-sender`             | pg_cron weekly (`0 5 * * 0`)        | Mails the weekly market digest. **Destructive**. |

### Manual invoke (no CLI install)

```bash
SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL='   .env | cut -d= -f2-)
SERVICE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY='   .env | cut -d= -f2-)

curl -s -X POST "$SUPABASE_URL/functions/v1/score-recalculator" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Same shape for every function — just swap the last path segment. The `/admin` Operations Copilot exposes all seven as one-click ops + as function-calling tools.

### Local development

```bash
supabase functions serve score-recalculator           # hot-reload, hits localhost:54321
supabase functions deploy score-recalculator          # ship to prod
supabase functions list
supabase functions logs score-recalculator --tail
```

### Adding a function

```bash
mkdir -p supabase/functions/my-fn && cat > supabase/functions/my-fn/index.ts <<'TS'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  // … work …
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
})
TS
```

Then register it in [`apps/web/lib/admin/operations.ts`](../apps/web/lib/admin/operations.ts) under the `Recompute` (or appropriate) category — that lights it up in the admin grid + Copilot in one shot.

---

## 5 · pg_cron + pg_net (server-side scheduling)

`pg_cron` runs from inside Postgres — `pg_net` lets it call edge functions over HTTP.

### List schedules

```sql
SELECT jobid, schedule, jobname, command, active, last_run
FROM   cron.job
ORDER  BY jobid;
```

### Schedule a function call

```sql
SELECT cron.schedule(
  'score-recalculator-6h',
  '0 */6 * * *',
  $$ SELECT net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/score-recalculator',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  ); $$
);
```

> The service-role key lives in a Postgres setting. Set once via the Dashboard → Project Settings → Database → Custom Postgres Configuration, key `app.settings.service_role_key`. Never inline a key into a migration file.

### Pause / resume / unschedule

```sql
SELECT cron.alter_job(jobid := 42, active := false);    -- pause
SELECT cron.alter_job(jobid := 42, active := true );    -- resume
SELECT cron.unschedule('score-recalculator-6h');
```

### Job history

```sql
SELECT jobid, runid, status, start_time, end_time, return_message
FROM   cron.job_run_details
ORDER  BY start_time DESC
LIMIT 20;
```

### Current schedules in this project

| Job | Cron | Calls |
|---|---|---|
| `alert-dispatcher-hourly`   | `0 * * * *`    | `/functions/v1/alert-dispatcher` |
| `digest-sender-weekly`      | `0 5 * * 0`    | `/functions/v1/digest-sender`    |
| `score-recalculator-6h`     | `0 */6 * * *`  | `/functions/v1/score-recalculator` |
| `saved-search-diffs-30m`    | `*/30 * * * *` | `/functions/v1/saved-search-diffs` |

(Confirm with the `cron.job` query above — these reflect what we declared in `20260407000002_cron_and_rpc.sql`.)

---

## 6 · pgvector (RAG)

Tables: `documents` (one row per source) + `document_chunks` (chunked text + embedding).

### Embedding dimension

Default: `vector(1536)` (Azure `text-embedding-3-small`). If you switch the embedding provider to **Ollama `nomic-embed-text`** the dimension becomes `768` — you'll need a one-time migration:

```sql
ALTER TABLE document_chunks
  ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);

-- Drop and recreate the IVFFlat index after the type change.
DROP INDEX IF EXISTS document_chunks_embedding_idx;
CREATE INDEX document_chunks_embedding_idx
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### Query (the canonical RAG RPC)

```sql
SELECT * FROM search_document_chunks(
  query_embedding      := <vector>,
  match_count          := 8,
  similarity_threshold := 0.25
);
-- Returns: chunk_id, document_id, chunk_text, similarity, source_url, doc_type, title
```

The web app uses this from [`apps/web/app/api/chat/route.ts`](../apps/web/app/api/chat/route.ts) and [`apps/web/app/api/threads/[id]/route.ts`](../apps/web/app/api/threads/[id]/route.ts).

### IVFFlat tuning notes

- `lists = ~ sqrt(rows)`. We use `100` for ≤10K chunks; bump to `200` past 40K.
- After bulk inserts, **run** `ANALYZE document_chunks` so the planner picks the index.
- `SET ivfflat.probes = 10` at session start trades recall for latency. Default `1` → fast, `10` → slower + better recall.

### Re-embed everything (after switching providers)

```ts
// scripts/reembed-chunks.ts (sketch)
import { createServiceClient } from '@/lib/supabase/service'
import { embed } from '@/lib/llm'

const sb = createServiceClient()
const { data: chunks } = await sb.from('document_chunks').select('id, chunk_text').limit(1000)
for (const c of chunks ?? []) {
  const v = await embed(c.chunk_text)
  await sb.from('document_chunks').update({ embedding: v }).eq('id', c.id)
}
```

---

## 7 · RPCs (server-side callables)

| RPC | Caller | Purpose |
|---|---|---|
| `search_document_chunks(query_embedding, match_count, similarity_threshold)` | chat / RAG | Vector kNN over brochures. |
| `recent_project_updates(limit_count)`     | landing trending strip, chat tool | Joins `project_updates` + `projects` for "what just moved". |
| `claim_next_scrape_job()`                 | scraper queue worker | SECURITY DEFINER, SKIP LOCKED. Atomically flips one `pending` row to `running`. |
| `handle_new_user()`                       | auth trigger | Creates a `user_profiles` row on signup. |
| `bump_updated_at()`                       | row triggers | Sets `updated_at = now()` on UPDATE. |

### Call from the web app

```ts
import { looseSupabase } from '@/lib/supabase/loose'
import { createServiceClient } from '@/lib/supabase/service'

const sb = looseSupabase(createServiceClient())
const { data, error } = await sb.rpc('recent_project_updates', { limit_count: 8 })
```

`looseSupabase()` is a small cast helper at [`apps/web/lib/supabase/loose.ts`](../apps/web/lib/supabase/loose.ts). It exists because `database.types.ts` is regenerated less often than we add RPCs; without the cast, TypeScript complains about the function name.

### Add a new RPC

```sql
CREATE OR REPLACE FUNCTION my_rpc(p_arg text)
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER          -- bypasses RLS; use carefully
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name FROM projects p WHERE p.area = p_arg;
END;
$$;

GRANT EXECUTE ON FUNCTION my_rpc(text) TO service_role;
```

If anonymous users should call it: `GRANT EXECUTE ... TO anon, authenticated`. **Always** scope `search_path` on `SECURITY DEFINER` functions to avoid the search-path injection class of bugs (we hit this in `20260506000001_fix_handle_new_user_search_path.sql`).

---

## 8 · Storage

Buckets we use:

| Bucket | What | Public? |
|---|---|---|
| `brochures` | PDF/PNG brochures from developer recrawl | Yes (read-only) |
| `dev-assets` | Logos, building photos | Yes |
| `exports`   | User-requested CSVs | No (signed URLs) |

### Upload via REST (used in `apps/scraper/lib/supabase_repo.py`)

```bash
curl -X POST "$SUPABASE_URL/storage/v1/object/brochures/$PATH" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/pdf" \
  -H "x-upsert: true" \
  --data-binary @file.pdf
```

Public URL: `$SUPABASE_URL/storage/v1/object/public/brochures/$PATH`.

### Storage policies (per bucket)

```sql
-- Anyone can read brochures
CREATE POLICY "public read brochures" ON storage.objects
  FOR SELECT USING (bucket_id = 'brochures');

-- Only service role can write (default — no public INSERT/UPDATE/DELETE policy)
```

---

## 9 · Auth

### Add yourself as the first admin

The admin allow-list is env-driven: [`apps/web/lib/admin/guard.ts`](../apps/web/lib/admin/guard.ts) reads `ADMIN_EMAILS=...`. Closed by default.

```env
ADMIN_EMAILS=vishal@offplaniq.com,cofounder@offplaniq.com
```

### Common auth queries

```sql
-- Find a user by email
SELECT id, email, raw_user_meta_data, created_at
FROM   auth.users
WHERE  email = 'vishal@offplaniq.com';

-- Force-confirm a user (skip email confirmation in dev)
UPDATE auth.users SET email_confirmed_at = now() WHERE email = '...';

-- Promote to admin in this app — no DB change needed; just edit ADMIN_EMAILS
```

### Profile sync

`handle_new_user()` runs on `auth.users` INSERT and creates the `user_profiles` row. If a user signed up before the trigger existed, backfill:

```sql
INSERT INTO user_profiles (id, email, full_name, subscription_tier)
SELECT u.id, u.email, '', 'free'
FROM   auth.users u
LEFT   JOIN user_profiles p ON p.id = u.id
WHERE  p.id IS NULL;
```

---

## 10 · Direct REST + RPC recipes

The PostgREST REST API is the same one the web app uses. Authenticate with either the anon key (RLS-bound) or the service key (full).

### Service-role headers

```bash
H_KEY="apikey: $SUPABASE_SERVICE_ROLE_KEY"
H_AUTH="Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### Read all active projects with developer

```bash
curl -s "$SUPABASE_URL/rest/v1/projects?select=name,slug,area,score,developer:developer_id(name)&status=in.(active,pre_launch)&order=score.desc.nullslast&limit=20" \
  -H "$H_KEY" -H "$H_AUTH"
```

### Upsert a row

```bash
curl -s "$SUPABASE_URL/rest/v1/developers?on_conflict=slug" \
  -H "$H_KEY" -H "$H_AUTH" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d '[{"name": "Expo City Dubai", "slug": "expo-city-dubai"}]'
```

### Call an RPC

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/recent_project_updates" \
  -H "$H_KEY" -H "$H_AUTH" -H "Content-Type: application/json" \
  -d '{"limit_count": 5}'
```

### Embedded selects (PostgREST nested resources)

```
?select=name,developer:developer_id(name,slug,tier)
?select=*,payment_plans(*)
```

The `:` syntax names the embedded relationship. Used everywhere in [`apps/web/lib/chat-tools.ts`](../apps/web/lib/chat-tools.ts).

### Filters cheat-sheet

| Filter | Example |
|---|---|
| `eq` | `?status=eq.active` |
| `neq` | `?status=neq.cancelled` |
| `gt`/`gte`/`lt`/`lte` | `?min_price=gte.1000000` |
| `like`/`ilike` | `?name=ilike.*creek*` |
| `in` | `?status=in.(active,pre_launch)` |
| `is` | `?score=is.null` / `?score=not.is.null` |
| `or` | `?or=(name.ilike.*creek*,name.ilike.*bay*)` |
| `order` | `?order=score.desc.nullslast,name.asc` |
| `limit` / `offset` | `?limit=20&offset=40` |

### Counts (cheap, head-only)

```bash
curl -sI "$SUPABASE_URL/rest/v1/projects?select=id&status=eq.active" \
  -H "$H_KEY" -H "$H_AUTH" -H "Prefer: count=exact"
# → Content-Range: 0-9/142    (the "142" is the total)
```

In the JS client:

```ts
const { count } = await supabase
  .from('projects').select('*', { count: 'exact', head: true })
  .eq('status', 'active')
```

---

## 11 · Maintenance + observability

### Live activity

```sql
SELECT pid, usename, application_name, state, wait_event_type, wait_event,
       NOW() - query_start AS runtime, query
FROM   pg_stat_activity
WHERE  state != 'idle'
ORDER  BY query_start;
```

### Top slow queries (requires `pg_stat_statements`)

```sql
SELECT round(total_exec_time::numeric, 0) AS total_ms,
       calls, round(mean_exec_time::numeric, 1) AS mean_ms,
       round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 1) AS pct,
       substring(query for 200) AS query
FROM   pg_stat_statements
ORDER  BY total_exec_time DESC
LIMIT  20;
```

### Table sizes

```sql
SELECT relname, n_live_tup AS rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS total,
       pg_size_pretty(pg_relation_size(relid))       AS heap
FROM   pg_stat_user_tables
ORDER  BY pg_total_relation_size(relid) DESC
LIMIT  20;
```

### Bloat / vacuum hint

```sql
SELECT relname, n_live_tup, n_dead_tup,
       round(n_dead_tup * 100.0 / NULLIF(n_live_tup, 0), 1) AS dead_pct,
       last_autovacuum, last_autoanalyze
FROM   pg_stat_user_tables
ORDER  BY n_dead_tup DESC NULLS LAST
LIMIT  20;
```

### Index usage

```sql
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM   pg_stat_user_indexes
ORDER  BY idx_scan DESC
LIMIT  20;
```

Indexes with `idx_scan = 0` after a few weeks of traffic are candidates for removal — they cost on every `INSERT`.

### One-shot reindex (after a big bulk load)

```sql
REINDEX TABLE CONCURRENTLY projects;
ANALYZE projects;
```

---

## 12 · Backups + restore

Supabase Pro takes daily PITR backups automatically. For local belt-and-braces:

```bash
# Schema-only dump
supabase db dump -f schema.sql

# Full data dump (gz)
supabase db dump --data-only -f data.sql && gzip data.sql

# Single-table export to CSV
psql "$SUPABASE_DB_URL" -c "\copy projects TO 'projects.csv' CSV HEADER"

# Restore a CSV
psql "$SUPABASE_DB_URL" -c "\copy projects FROM 'projects.csv' CSV HEADER"
```

> `$SUPABASE_DB_URL` is the connection string under Project Settings → Database → URI. Use the **session** pooler for one-off scripts, the **transaction** pooler for serverless functions.

---

## 13 · Connection pooling

Supabase exposes three URLs:

| URL | Port | Use for |
|---|---|---|
| Direct                  | `5432`  | Migrations, ad-hoc psql, REINDEX, anything long-running. |
| Session pooler          | `5432`  | App workers that hold connections, e.g. the Python scraper, Railway jobs. |
| Transaction pooler      | `6543`  | Serverless / Edge / Vercel functions — short connections, no prepared statements. |

Rule: **never** point a serverless Next.js function at the direct URL; you'll exhaust the connection cap on cold-start storms.

---

## 14 · `scrape_jobs` queue (admin Operations Copilot)

Queue model: the web app inserts rows; the Python worker drains them.

### Apply the migration (pending right now)

Open `supabase/migrations/20260509000001_scrape_jobs.sql` in the SQL Editor and run.

### Run the worker

```bash
python -m apps.scraper.scrapers.queue_worker --poll --interval 10
# add it to your tmux / Foreman / Railway alongside the main scraper
```

### Inspect the queue

```sql
SELECT id, scraper, status, attempts, started_at, finished_at, error
FROM   scrape_jobs
ORDER  BY created_at DESC
LIMIT  20;
```

### Retry stuck jobs

```sql
UPDATE scrape_jobs SET status = 'pending', started_at = NULL, attempts = 0
WHERE  status = 'running' AND started_at < now() - interval '15 minutes';
```

### Prune finished rows (housekeeping cron)

```sql
DELETE FROM scrape_jobs WHERE status IN ('success','failed') AND created_at < now() - interval '14 days';
```

### Add a new scraper to the queue

1. Add a function in [`apps/scraper/scrapers/queue_worker.py`](../apps/scraper/scrapers/queue_worker.py)'s `RUNNERS` map.
2. Register an op in [`apps/web/lib/admin/operations.ts`](../apps/web/lib/admin/operations.ts) with `kind: 'scraper'` and `run: () => queueScrape('<scraper_id>')`.
3. The button + Copilot tool light up automatically.

---

## 15 · Seeds + ingest scripts

Live in [`scripts/`](../scripts/) — Node + Python utilities. The ones you'll touch most:

```bash
# One-shot
node scripts/seed.mjs                              # baseline projects + developers
node scripts/seed-developers-from-excel.mjs        # patches developers from the curated Excel
node scripts/dedupe-developers.mjs                 # collapses near-duplicate developer rows
node scripts/rank-developers.mjs                   # writes tier + tier_rank by curated rules
node scripts/recalculate-scores.mjs                # local mirror of the score-recalculator edge fn
node scripts/ingest-real-projects.mjs              # bulk upsert from a JSON file
node scripts/generate-insights.mjs                 # pre-warm narrative + news on every project

# Per-developer scrape (Python)
python -m apps.scraper.scrapers.expo_city
python -m apps.scraper.scrapers.expo_city --enrich       # uses ScrapeGraphAI when installed
python -m apps.scraper.scrapers.dld --days 7
```

All scripts read the root `.env` via `dotenv` and use the service-role key. Idempotent — safe to re-run.

---

## 16 · Recipes

### "What changed today?"

```sql
SELECT change_type, count(*)
FROM   project_updates
WHERE  detected_at > now() - interval '24 hours'
GROUP  BY change_type
ORDER  BY count(*) DESC;
```

### "Top 10 areas by avg score"

```sql
SELECT area, count(*) AS projects, round(avg(score)::numeric, 1) AS avg_score
FROM   projects
WHERE  status IN ('active','pre_launch') AND score IS NOT NULL
GROUP  BY area
ORDER  BY avg_score DESC
LIMIT  10;
```

(Or just ask the same question on `/insights` — text-to-SQL → same answer + chart.)

### "Stuck handovers"

```sql
SELECT name, area, current_handover_date, handover_delay_days
FROM   projects
WHERE  status IN ('active','pre_launch') AND handover_delay_days > 90
ORDER  BY handover_delay_days DESC
LIMIT  25;
```

### "DLD coverage by developer"

```sql
SELECT d.name,
       count(DISTINCT p.id) AS projects,
       count(DISTINCT t.id) AS dld_sales
FROM   developers d
LEFT   JOIN projects p          ON p.developer_id = d.id
LEFT   JOIN dld_transactions t  ON t.project_id   = p.id
GROUP  BY d.name
ORDER  BY dld_sales DESC NULLS LAST
LIMIT  20;
```

### Re-rank a single developer's projects

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/score-recalculator" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"developer_slug": "expo-city-dubai"}'
```

(Edge fn currently recalcs all projects; the body is ignored. Filed as a follow-up: accept `developer_slug` to scope the run.)

### Snapshot platform stats (admin Copilot uses this)

```sql
SELECT
  (SELECT count(*) FROM projects)         AS projects,
  (SELECT count(*) FROM developers)       AS developers,
  (SELECT count(*) FROM project_updates)  AS updates,
  (SELECT count(*) FROM dld_transactions) AS dld_sales,
  (SELECT count(*) FROM user_profiles)    AS users;
```

---

## 17 · Common gotchas (and the fixes)

### "Could not find the table 'public.X'" but the migration is in the repo

You haven't applied it. Open the SQL Editor, paste the file, run it. (We don't auto-apply.)

### TypeScript: "Property 'rpc' does not exist on type …" / unknown table

`database.types.ts` was regenerated before this migration shipped. Wrap the client with [`looseSupabase`](../apps/web/lib/supabase/loose.ts) — it casts to `any`, lets the call through, and is intentionally easy to grep for ("temporary"). Regenerate types with:

```bash
supabase gen types typescript --project-id <ref> > apps/web/types/database.ts
```

### `vector` operator `<=>` not found

`CREATE EXTENSION IF NOT EXISTS vector;` is missing from the schema search path. Migration `20260506000006_pgvector_and_documents.sql` enables it; if you're on a brand-new project, run that first.

### "permission denied for schema cron"

Supabase Cloud disables `pg_cron` on the free tier. Upgrade or move the schedule into the app layer.

### Edge function returns 401 with the right key

The `Authorization` header must be `Bearer <key>`, not just the key. Triple-check the variable substitution if you're shelling.

### Vector search returns nothing after a bulk insert

`ANALYZE document_chunks` — the IVFFlat planner needs stats.

### Race in the queue worker

`claim_next_scrape_job()` uses `FOR UPDATE SKIP LOCKED` so multiple workers will not pick the same row. Don't replace it with a vanilla SELECT-then-UPDATE.

### `ALTER TYPE` on an enum errors mid-migration

Postgres doesn't allow `ALTER TYPE ... ADD VALUE` inside a transaction block in older versions. Run the `ALTER TYPE` on its own statement, or use a `DO` block:

```sql
BEGIN;
  -- can't add an enum value here in 12; in 14+ it's fine
COMMIT;

-- in older Postgres:
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'on_hold';
```

---

## 18 · Quick links

- Supabase Dashboard: https://supabase.com/dashboard
- Status page: https://status.supabase.com
- pgvector docs: https://github.com/pgvector/pgvector
- pg_cron docs: https://github.com/citusdata/pg_cron
- PostgREST filters: https://postgrest.org/en/stable/api.html#horizontal-filtering-rows
- Provider switch (LLM / embeddings): [`docs/llm-providers.md`](./llm-providers.md)
- Scraping architecture + offload notes: [`docs/scraping-architecture.md`](./scraping-architecture.md)
- Admin Operations Copilot: [`/admin`](http://localhost:3000/admin) (signed-in admin only)
