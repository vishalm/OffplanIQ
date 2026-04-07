# CLAUDE.md — Instructions for Claude Code

This file tells Claude Code how to work on the OffplanIQ codebase.
Read this before making any changes.

## What this project is

OffplanIQ is a Dubai off-plan property intelligence SaaS.
It tracks 142+ active projects with PSF history, sell-through velocity,
IRR calculators, and developer scorecards. Target users: UAE property investors and brokers.

## Project structure rules

```
apps/web/          → Next.js 14 App Router. TypeScript only.
apps/scraper/      → Python scrapers. Playwright + requests. No TypeScript here.
packages/shared/   → Shared types. Import as @offplaniq/shared in web app.
supabase/          → DB migrations, Edge Functions (Deno/TypeScript), seed
docs/              → Architecture, API, data source documentation
scripts/           → One-off utilities (seed, backfill, etc.)
```

## Before touching any feature

1. Read the relevant `docs/` file first
2. Check if the feature already has a stub file in the codebase
3. Never edit migration files — always create a new one for DB changes

## TypeScript conventions

```typescript
// ALWAYS import types from packages/shared/types, not re-define them
import type { Project, Developer, PaymentPlan } from '@offplaniq/shared'

// Supabase client usage:
// Server Components → import from '@/lib/supabase/server'
// Client Components → import from '@/lib/supabase/client'
// Webhooks/Service → import from '@/lib/supabase/service'

// All monetary values are AED integers (no decimals, no fils)
// PSF values are AED/sqft integers (e.g. 2340, never 2340.5)

// Format display values with lib/formatting.ts helpers, not inline
import { formatAed, formatPsf, formatPct } from '@/lib/formatting'
```

## Database conventions

```sql
-- Never edit existing migration files
-- Create new migration: supabase/migrations/002_feature_name.sql

-- Always use UUID primary keys
-- Always add updated_at trigger for mutable tables
-- Always add RLS policies — see 001_initial_schema.sql for pattern
-- Index anything you filter/sort by in the UI
```

## Component architecture

```
app/[page]/page.tsx          → Server Component. Data fetching only. No UI logic.
components/project/          → Feature components (may be Server or Client)
components/ui/               → Generic UI primitives (always Client or pure)
components/charts/           → Recharts wrappers (always Client — 'use client')
components/layout/           → Nav, sidebar, shell (mix of both)
```

## Key files to understand first

| File | Why important |
|---|---|
| `supabase/migrations/001_initial_schema.sql` | Complete DB schema — understand this first |
| `packages/shared/types/index.ts` | All TypeScript types — the contract |
| `apps/web/lib/scoring/algorithm.ts` | Score formula — the product's core logic |
| `apps/web/lib/irr/calculator.ts` | IRR calculator — the key paid feature |
| `docs/architecture/overview.md` | System diagram and decisions |
| `docs/data-sources/overview.md` | How data gets into the system |

## Scraper conventions (Python)

```python
# Always use Playwright for JS-heavy pages, requests for simple APIs
# Always add REQUEST_DELAY_S = 2.0 between page requests
# Always upsert (not insert) — re-runs must be idempotent
# Always print progress: "Scraping {date}... Found: {n} transactions"
# Environment vars from os.environ, never hardcoded
```

## Adding a new data source

1. Create `apps/scraper/scrapers/{source_name}.py`
2. Document it in `docs/data-sources/overview.md`
3. Add any new DB columns as a new migration file
4. Update the seed script if needed

## Adding a new page

1. Create `apps/web/app/{route}/page.tsx` as Server Component
2. Data fetching at the page level, pass props down
3. Interactive parts → separate Client Component with `'use client'`
4. Add route to the protected paths in `middleware.ts` if auth required
5. Add to navigation in `components/layout/Nav.tsx`

## Paywalled features pattern

```tsx
// Server Component pattern for gating features
const isPaid = profile?.subscription_tier !== 'free'

{isPaid ? (
  <IrrCalculator project={project} paymentPlans={plans} />
) : (
  <PaywallBanner
    title="Payment plan IRR calculator"
    description="Compare every payment plan's annualised return. Upgrade to Investor."
  />
)}
```

## Common tasks

**Run locally:**
```bash
pnpm --filter web dev          # web app on :3000
pnpm run seed                  # seed initial data
supabase functions serve       # edge functions locally
python apps/scraper/scrapers/dld.py --days 7   # backfill DLD
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Deploy:**
```bash
vercel --prod                  # web app
supabase functions deploy score-recalculator
supabase functions deploy alert-dispatcher
supabase functions deploy digest-sender
# Scraper: push to Railway, it auto-deploys from git
```

**Add a migration:**
```bash
supabase migration new your_migration_name
# Edit the created file
supabase db push
```

**Test an edge function locally:**
```bash
supabase functions serve score-recalculator
curl -X POST http://localhost:54321/functions/v1/score-recalculator \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## What NOT to do

- Don't use `any` type in TypeScript — define proper types in packages/shared
- Don't call Supabase from Client Components without the browser client
- Don't use the service role key in client-side code ever
- Don't edit `001_initial_schema.sql` — create `002_...sql` instead
- Don't add Python dependencies to the web app
- Don't hardcode AED amounts — use the constants in `packages/shared/constants`
- Don't write raw SQL in Next.js — use Supabase query builder or RPC calls
- Don't create new UI components without checking `components/ui/` first
