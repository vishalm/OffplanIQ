# Architecture overview

## System diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        DATA LAYER                             │
│                                                              │
│  DLD website ──────────┐                                     │
│  Property Finder ───────┤──► Python scrapers ──► Supabase DB │
│  Bayut ────────────────┘         (Railway)                   │
│  Developer sites                                             │
└──────────────────────────────────────────────────────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │   Supabase Edge Fns │
                          │  score-recalculator │ (after scraper)
                          │  alert-dispatcher   │ (hourly)
                          │  digest-sender      │ (Sunday 5am UTC)
                          │  psf-updater        │ (after scraper)
                          └─────────┬──────────┘
                                    │
┌──────────────────────────────────────────────────────────────┐
│                      WEB APP (Next.js 14)                     │
│                          Vercel                               │
│                                                              │
│  /dashboard         → Project feed (Screen 1)                │
│  /projects/[slug]   → Project detail + IRR (Screen 2)        │
│  /alerts            → Alerts + Watchlist (Screen 3)          │
│  /settings/billing  → Stripe subscription management         │
│  /auth/login        → Supabase Auth (email + Google)         │
│                                                              │
│  API routes:                                                  │
│  POST /api/checkout          → Create Stripe checkout        │
│  POST /api/webhooks/stripe   → Handle Stripe events          │
│  POST /api/watchlist         → Add/remove watchlist entries  │
└──────────────────────────────────────────────────────────────┘
```

## Data freshness

| Data type | Source | Frequency | Lag |
|---|---|---|---|
| DLD transactions | dubailand.gov.ae | Daily 2am UAE | T+1 |
| Project listings | Property Finder | Every 6h | ~1h |
| PSF history | Computed from DLD + PF | After scraper | T+1 |
| Project scores | Edge Function | After scraper | T+1 |
| Alerts | Edge Function | Hourly | <1h |
| Weekly digest | Edge Function | Sunday 9am UAE | Weekly |

## Free vs paid data access

| Feature | Free | Investor | Agency |
|---|---|---|---|
| Projects visible | Top 20 by score | All 142+ | All 142+ |
| PSF data | 30-day lag | Live (T+1) | Live (T+1) |
| Sell-through | Yes | Yes | Yes |
| IRR calculator | No (paywall) | Yes | Yes |
| Developer scorecard | No (paywall) | Yes | Yes |
| Score breakdown | No | Yes | Yes |
| Alerts | No | Yes | Yes (5 seats) |
| Weekly digest | No | Yes | Yes |
| API access | No | No | Yes |
| White-label PDF | No | No | Yes |
| Seats | 1 | 1 | 5 |

## Scoring algorithm

See `apps/web/lib/scoring/algorithm.ts` for implementation.

```
Score (0-100) = sellthrough (40) + psf_delta (30) + developer (20) + handover (10)
```

Score thresholds:
- 85-100: Excellent (green)
- 70-84:  Good (green)
- 55-69:  Watch (amber)
- 40-54:  Caution (orange)
- 0-39:   Avoid (red)

Score is recalculated after every scraper run. Stored in `projects.score`
and snapshotted daily in `score_snapshots` for trend charts.

## Stripe subscription flow

```
User clicks "Upgrade" on /settings/billing
    → POST /api/checkout { plan: 'investor' }
    → Stripe Checkout Session created
    → User redirected to Stripe hosted page
    → Payment complete
    → Stripe webhook fires checkout.session.completed
    → POST /api/webhooks/stripe
    → user_profiles.subscription_tier updated to 'investor'
    → User redirected to /settings/billing?success=true
```

## Alert system flow

```
Every hour:
  alert-dispatcher Edge Function runs
    → Fetches all watchlist entries with user prefs
    → Gets yesterday's score snapshots for comparison
    → Detects: score drops, score rises, handover delays
    → Inserts rows into alerts_log
    → Sends email via Resend (if email_alerts = true)

UI:
  /alerts page fetches alerts_log for current user
  Unread badge shown in nav
  All marked as read on page visit
```

## Email system

Using Resend + React Email:
- Transactional alerts: fired by alert-dispatcher
- Weekly digest: fired by digest-sender (Sunday 5am UTC)
- Templates in: `apps/web/emails/`
- Preview: `npx email preview` from apps/web

## Key constraints and decisions

**All money in AED, stored as integers (fils)**
- AED 1,500,000 stored as `1500000` (not fils, just AED integer — no decimals needed for property)
- PSF stored as integer AED per sqft (e.g. 2340 not 2340.50)
- Display formatting in `lib/formatting.ts`

**No ML in scoring — keep it simple**
- Weighted formula, fully explainable to investors
- Investors trust it more when they understand it
- Can layer ML later as a "premium signal" feature

**Scraper is Python, everything else is TypeScript**
- Playwright in Python is more mature for complex scraping
- Don't mix — the scraper communicates only via Supabase REST API

**Row Level Security everywhere**
- Public read on projects, developers, psf_history, payment_plans
- User-scoped RLS on watchlist, alerts, preferences
- Service role key used only in: scraper, Edge Functions, webhook handler

**Supabase Edge Functions for scheduled jobs**
- No separate scheduler infra needed
- pg_cron extension triggers the functions
- Simpler than Lambda/Cloud Functions for a solo founder
