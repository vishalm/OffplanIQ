# OffplanIQ — GCC Off-Plan Property Intelligence SaaS

> Dubai/GCC real estate intelligence platform for developers and investors.
> Tracks 142+ active off-plan projects with PSF history, sell-through velocity,
> developer scorecards, and IRR calculators.

## Quick start

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, RESEND_API_KEY, STRIPE_SECRET_KEY

# Run database migrations
pnpm supabase db push

# Seed initial project data
pnpm run seed

# Start web app
pnpm --filter web dev

# Start scraper (separate terminal)
pnpm --filter scraper dev
```

## Project structure

```
offplaniq/
├── apps/
│   ├── web/                  # Next.js 14 app (main product)
│   └── scraper/              # Python data collection service
├── packages/
│   └── shared/               # Shared types, utils, constants
├── supabase/
│   ├── migrations/           # Database schema (run in order)
│   ├── functions/            # Edge Functions (cron jobs, alerts)
│   └── seed/                 # Initial project + developer data
├── docs/                     # Architecture, API, screen specs
└── scripts/                  # One-off admin utilities
```

## Tech stack

| Layer | Tool | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) | File-based routing, RSC, easy Vercel deploy |
| Database | Supabase (Postgres) | Auth + DB + Realtime + Edge Functions in one |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, zero custom CSS |
| Charts | Recharts | Lightweight, React-native, good enough |
| Email | Resend + React Email | Best DX for transactional email |
| Payments | Stripe | Subscriptions, webhooks, portal |
| Scraping | Python + Playwright | Handles JS-rendered pages |
| Scheduling | Supabase Edge Functions (cron) | No extra infra needed |
| Deployment | Vercel (web) + Railway (scraper) | Both have free tiers |

## Core data flows

1. **Scraper** runs nightly → pulls DLD transactions + Property Finder listings → upserts into Supabase
2. **score-recalculator** Edge Function runs after each scraper batch → recalculates project scores
3. **alert-dispatcher** runs hourly → diffs current scores vs snapshots → fires alerts to watchlisted users
4. **digest-sender** runs Sunday 5am UTC (9am UAE) → builds weekly email per user → sends via Resend

## Environment variables needed

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_INVESTOR=
STRIPE_PRICE_ID_AGENCY=
SCRAPER_API_KEY=           # Internal key scraper uses to call Supabase
```

## Key product decisions

- **Free tier**: Top 20 projects only, PSF data lagged 30 days, no alerts, no IRR calculator
- **Investor plan (AED 750/mo)**: All 142+ projects, live data, alerts, IRR calculator, developer scorecard
- **Agency plan (AED 3,500/mo)**: Everything + 5 seats + white-label PDF reports + API access
- **Score algorithm**: See `docs/architecture/scoring.md` — weighted formula, not ML, keep it explainable
- **Data freshness**: DLD transactions T+1 (they publish next day). Property Finder scraped every 6h.

## Claude Code instructions

When working on this repo:
1. Always read the relevant `docs/` file before touching a feature area
2. Database changes → always add a new migration file, never edit existing ones
3. The scraper is Python, everything else is TypeScript — don't mix
4. Supabase RLS policies are in the migration files — don't bypass them
5. All monetary values stored in AED as integers (fils) — display logic in `lib/formatting.ts`
6. PSF values stored as integers (AED per sqft) — no decimals in DB
