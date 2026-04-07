# PLAN.md — OffplanIQ Day 1 Master Plan

> **Date:** 2026-04-07 | **Status:** Day 1 — Foundation & Planning
> **Goal:** Go from scaffolded codebase → production-ready data pipeline + deployed dashboard in 6 weeks

---

## Executive Summary

OffplanIQ is a Dubai off-plan property intelligence SaaS that gives investors and brokers a Bloomberg-like view of 142+ active off-plan projects. The core moat is the **scoring algorithm** (weighted formula: sell-through 40% + PSF trend 30% + developer 20% + handover 10%) and the **IRR calculator** that lets users compare payment plans side-by-side.

### Revenue Model
| Plan | Price | Target |
|------|-------|--------|
| Free | AED 0 | Top 20 projects, 30-day lag, no IRR/alerts |
| Investor | AED 750/mo (AED 7,500/yr) | Full access, live data, alerts, IRR |
| Agency | AED 3,500/mo (AED 35,000/yr) | 5 seats + API + white-label PDFs |

### Success Metrics (Week 6)
- 10 beta users, 3 paying (AED 2,250+ MRR)
- 142+ projects with live PSF data
- Score accuracy validated against manual analysis
- Sunday digest retention > 60% open rate

---

## Current State Assessment

### What Exists (Scaffolded)
```
✅ Complete DB schema (2 migrations, 11 tables, RLS policies, triggers)
✅ All TypeScript types (packages/shared/types)
✅ All shared constants (tier limits, score weights, pricing)
✅ All utility functions (formatting, math, fuzzy matching)
✅ Scoring algorithm (apps/web/lib/scoring/algorithm.ts)
✅ IRR calculator (apps/web/lib/irr/calculator.ts)
✅ All 14 React components (pages + features + UI + charts)
✅ Auth middleware with protected routes
✅ 3 Supabase clients (browser, server, service)
✅ Stripe checkout + webhook routes
✅ Watchlist API route
✅ 4 Edge Functions (score-recalculator, alert-dispatcher, digest-sender, psf-updater)
✅ 2 Python scrapers (DLD, Property Finder) + transaction matcher
✅ Seed script with 5 sample projects
✅ Full documentation (architecture, API spec, screen specs, data sources)
✅ Turbo monorepo config
```

### What Needs Work (Critical Gaps)

```mermaid
graph LR
    A[🔴 Critical] --> A1[DLD scraper selectors are placeholders]
    A --> A2[PF scraper selectors are placeholders]
    A --> A3[Score algo duplicated in Edge Function]
    A --> A4[No tests anywhere]
    A --> A5[No ESLint/Prettier config]
    
    B[🟡 Important] --> B1[Digest sender uses raw HTML not React Email template]
    B --> B2[WatchlistButton bypasses API route]
    B --> B3[algorithm.ts has broken import path]
    B --> B4[API v1 routes not created yet]
    B --> B5[api_keys table migration missing]
    
    C[🟢 Nice to Have] --> C1[Bayut scraper TODO]
    C --> C2[Google OAuth]
    C --> C3[Mobile app]
    C --> C4[Saudi expansion]
```

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph DataSources["Data Sources"]
        DLD["DLD Website\n(dubailand.gov.ae)"]
        PF["Property Finder"]
        BAYUT["Bayut (TODO)"]
    end

    subgraph Scraper["Python Scrapers (Railway)"]
        DLD_S["dld.py\nPlaywright"]
        PF_S["property_finder.py\nPlaywright + requests"]
        MATCH["match_transactions.py\nFuzzy matcher"]
        MAIN["main.py\nOrchestrator\n(nightly 02:00 UTC)"]
    end

    subgraph Supabase["Supabase (Postgres + Auth + Edge Fns)"]
        DB[(PostgreSQL\n11 tables\nRLS enabled)]
        AUTH["Supabase Auth\nemail/password"]
        
        subgraph EdgeFns["Edge Functions"]
            PSF_UP["psf-updater\n(after scraper)"]
            SCORE["score-recalculator\n(after scraper)"]
            ALERT["alert-dispatcher\n(hourly via pg_cron)"]
            DIGEST["digest-sender\n(Sunday 05:00 UTC)"]
        end
    end

    subgraph WebApp["Next.js 14 App (Vercel)"]
        subgraph Pages["Pages (Server Components)"]
            DASH["/dashboard\nProject feed"]
            PROJ["/projects/[id]\nDetail + IRR"]
            ALERTS_P["/alerts\nAlert feed"]
            BILLING["/settings/billing"]
            LANDING["/ Landing"]
        end
        
        subgraph API["API Routes"]
            CHECKOUT["POST /api/checkout"]
            WEBHOOK["POST /api/webhooks/stripe"]
            WATCH_API["POST|DELETE /api/watchlist"]
        end
        
        MW["middleware.ts\nAuth guard"]
    end

    subgraph External["External Services"]
        STRIPE["Stripe\nSubscriptions"]
        RESEND["Resend\nTransactional email"]
    end

    DLD --> DLD_S
    PF --> PF_S
    DLD_S --> DB
    PF_S --> DB
    MATCH --> DB
    MAIN --> DLD_S
    MAIN --> PF_S
    MAIN --> MATCH
    MAIN --> PSF_UP
    MAIN --> SCORE

    PSF_UP --> DB
    SCORE --> DB
    ALERT --> DB
    ALERT --> RESEND
    DIGEST --> DB
    DIGEST --> RESEND

    DB --> Pages
    AUTH --> MW
    MW --> Pages
    CHECKOUT --> STRIPE
    WEBHOOK --> DB
    STRIPE --> WEBHOOK
```

---

## Database Schema (ERD)

```mermaid
erDiagram
    developers ||--o{ projects : "has many"
    projects ||--o{ psf_history : "has many"
    projects ||--o{ payment_plans : "has many"
    projects ||--o{ dld_transactions : "matched to"
    projects ||--o{ watchlist : "watched by"
    projects ||--o{ alerts_log : "triggers"
    projects ||--o{ score_snapshots : "snapshotted"
    user_profiles ||--o{ watchlist : "watches"
    user_profiles ||--o{ alerts_log : "receives"
    user_profiles ||--|{ alert_preferences : "has one"

    developers {
        uuid id PK
        string name
        string slug UK
        string rera_developer_id
        int on_time_delivery_pct
        float avg_quality_rating
        int rera_complaints_count
        int developer_score "0-100"
    }

    projects {
        uuid id PK
        uuid developer_id FK
        string name
        string slug UK
        string rera_project_id UK
        string area
        enum status "pre_launch|active|sold_out|completed|delayed|cancelled"
        enum handover_status "on_track|at_risk|delayed|completed"
        int current_psf "AED/sqft"
        int units_sold
        float sellthrough_pct
        int score "0-100"
        jsonb score_breakdown
    }

    psf_history {
        uuid id PK
        uuid project_id FK
        date recorded_date
        int psf "AED/sqft"
        string source "dld|property_finder|bayut|manual"
        int sample_size
    }

    payment_plans {
        uuid id PK
        uuid project_id FK
        string name
        float down_payment_pct
        float construction_pct
        float handover_pct
        float post_handover_pct
        int post_handover_months
    }

    dld_transactions {
        uuid id PK
        uuid project_id FK "nullable until matched"
        string dld_transaction_id UK
        date transaction_date
        int transaction_value "AED"
        int psf "computed"
        bool is_off_plan
    }

    user_profiles {
        uuid id PK "FK auth.users"
        string email
        enum subscription_tier "free|investor|agency"
        string stripe_customer_id UK
    }

    watchlist {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
    }

    alert_preferences {
        uuid user_id PK "FK user_profiles"
        int score_drop_threshold "default 5"
        bool notify_new_launches
        bool email_alerts
        bool weekly_digest
    }

    alerts_log {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        enum alert_type
        string title
        string body
        bool is_read
        timestamp sent_at
    }

    score_snapshots {
        uuid id PK
        uuid project_id FK
        date score_date
        int score
        jsonb breakdown
    }
```

---

## Data Flow Pipeline

```mermaid
sequenceDiagram
    participant CRON as Railway Cron (02:00 UTC)
    participant DLD as DLD Scraper
    participant PF as PF Scraper
    participant MATCH as Transaction Matcher
    participant DB as Supabase DB
    participant PSF as psf-updater
    participant SCORE as score-recalculator
    participant ALERT as alert-dispatcher (hourly)
    participant DIGEST as digest-sender (Sunday)
    participant USER as User Browser

    CRON->>DLD: Run dld.py
    DLD->>DB: Upsert dld_transactions (batch 100)
    CRON->>PF: Run property_finder.py
    PF->>DB: Upsert projects + payment_plans
    CRON->>MATCH: Run match_transactions.py
    MATCH->>DB: Read unmatched transactions
    DB-->>MATCH: Transactions + Projects
    MATCH->>DB: Update project_id on matched txns
    CRON->>PSF: POST /functions/v1/psf-updater
    PSF->>DB: Compute weighted avg PSF from DLD
    PSF->>DB: Update projects.current_psf + upsert psf_history
    CRON->>SCORE: POST /functions/v1/score-recalculator
    SCORE->>DB: Fetch projects + psf_history + developers
    SCORE->>DB: Update scores + upsert score_snapshots
    
    Note over ALERT: Runs every hour via pg_cron
    ALERT->>DB: Fetch watchlists + prefs + yesterday scores
    ALERT->>DB: Insert new alerts
    ALERT->>USER: Send email via Resend (if enabled)
    
    Note over DIGEST: Runs Sunday 05:00 UTC
    DIGEST->>DB: Fetch investor/agency users + watchlists
    DIGEST->>USER: Send weekly digest via Resend
```

---

## Scoring Algorithm Deep Dive

```mermaid
graph TB
    subgraph Score["Project Score (0-100)"]
        ST["Sell-through\n(0-40 pts)\nWeight: 40%"]
        PSF["PSF 6m Delta\n(0-30 pts)\nWeight: 30%"]
        DEV["Developer Score\n(0-20 pts)\nWeight: 20%"]
        HO["Handover Status\n(0-10 pts)\nWeight: 10%"]
    end
    
    ST --> |"≥90%: 40 | ≥75%: 36 | ≥60%: 30\n≥45%: 24 | ≥30%: 16 | ≥15%: 10"| TOTAL
    PSF --> |"≥+20%: 30 | ≥+10%: 24\n≥+5%: 18 | ≥0%: 12 | <-7%: 0"| TOTAL
    DEV --> |"developer_score / 100 × 20\nunknown = 10 (neutral)"| TOTAL
    HO --> |"on_track: 10 | at_risk: 6\ndelayed ≤90d: 4 | >180d: 0"| TOTAL

    TOTAL["TOTAL SCORE"]
    TOTAL --> E["85-100: Excellent 🟢"]
    TOTAL --> G["70-84: Good 🟢"]
    TOTAL --> W["55-69: Watch 🟡"]
    TOTAL --> C["40-54: Caution 🟠"]
    TOTAL --> AV["0-39: Avoid 🔴"]
```

---

## Component Architecture

```mermaid
graph TB
    subgraph Layout["Layout (Server + Client)"]
        NAV["Nav.tsx (Server)\nSession + profile + unread count"]
        NAVMENU["NavUserMenu.tsx (Client)\nAvatar + dropdown + sign out"]
    end

    subgraph Screen1["Screen 1: Dashboard"]
        DASH["dashboard/page.tsx (Server)\nFetch projects + market summary"]
        METRICS["MarketMetrics.tsx (Server)\n4 metric cards"]
        FILTER["FilterBar.tsx (Client)\nArea chips + search + sort"]
        TABLE["ProjectTable.tsx (Server)\nSortable grid + blur on free tier"]
        BADGE["ScoreBadge.tsx (Server)\nColor-coded pill + tooltip"]
    end

    subgraph Screen2["Screen 2: Project Detail"]
        DETAIL["projects/[id]/page.tsx (Server)\nFetch project + PSF + plans"]
        CHART["PsfChart.tsx (Client)\nRecharts LineChart"]
        IRR["IrrCalculator.tsx (Client)\n3 sliders + plan comparison + sensitivity"]
        DEVCARD["DeveloperCard.tsx (Server)\nScorecard grid"]
        WLBTN["WatchlistButton.tsx (Client)\nToggle bookmark"]
    end

    subgraph Screen3["Screen 3: Alerts"]
        ALERTS_PAGE["alerts/page.tsx (Server)\nFetch alerts + watchlist + prefs"]
        FEED["AlertFeed.tsx (Server)\nVertical alert list"]
        WLPANEL["WatchlistPanel.tsx (Server)\nWatched projects list"]
        PREFFORM["AlertPreferencesForm.tsx (Client)\nToggles + thresholds"]
    end

    subgraph Paywall["Paywall Layer"]
        BANNER["PaywallBanner.tsx (Server)\nLock icon + CTA"]
        UPGRADE["UpgradeButton.tsx (Client)\nStripe checkout redirect"]
    end

    NAV --> NAVMENU
    DASH --> METRICS
    DASH --> FILTER
    DASH --> TABLE
    TABLE --> BADGE
    DETAIL --> CHART
    DETAIL --> IRR
    DETAIL --> DEVCARD
    DETAIL --> WLBTN
    ALERTS_PAGE --> FEED
    ALERTS_PAGE --> WLPANEL
    ALERTS_PAGE --> PREFFORM
    IRR -.->|"free tier"| BANNER
    DEVCARD -.->|"free tier"| BANNER
    BANNER --> UPGRADE
```

---

## Week-by-Week Execution Plan

### Week 1 — Data Pipeline (CURRENT PRIORITY)

```mermaid
gantt
    title Week 1: Data Pipeline
    dateFormat  YYYY-MM-DD
    section Infrastructure
        Create Supabase project        :a1, 2026-04-07, 1d
        Run migrations + seed           :a2, after a1, 1d
        Configure .env.local            :a3, after a1, 1d
    section Scraper
        Inspect DLD site (DevTools)     :b1, 2026-04-09, 1d
        Fix DLD scraper selectors       :b2, after b1, 2d
        Test DLD scraper (7-day backfill):b3, after b2, 1d
    section Edge Functions
        Deploy psf-updater              :c1, after b3, 1d
        Deploy score-recalculator       :c2, after c1, 1d
        Verify scores in DB             :c3, after c2, 1d
    section Deploy
        Railway setup + cron            :d1, 2026-04-13, 1d
```

**Day 1 Tasks (Today):**
- [x] Review entire codebase and create documentation
- [ ] Create Supabase project
- [ ] Run 001 + 002 migrations
- [ ] Fill `.env.local`
- [ ] Run seed script — verify 5 projects in dashboard

**Day 2-3:**
- [ ] Open DLD site, inspect network tab for XHR vs HTML
- [ ] Update `dld.py` selectors based on real DOM
- [ ] Get DLD pulling yesterday's transactions

**Day 4-5:**
- [ ] Deploy `psf-updater` and `score-recalculator` Edge Functions
- [ ] Run full pipeline: scrape → match → update PSF → recalculate scores
- [ ] Validate: 5+ projects have scores and PSF history

**Day 6-7:**
- [ ] Deploy scraper to Railway
- [ ] Set nightly cron (02:00 UTC)
- [ ] Monitor first automated run

### Week 2 — Core Dashboard
- Set up Next.js project structure
- Configure Tailwind + install shadcn/ui
- Wire up Supabase Auth (email/password)
- Build middleware, login, register
- Build dashboard page with all components
- Deploy to Vercel

### Week 3 — Project Detail + IRR
- Build project detail page
- Wire up PSF chart with real data
- Make IRR calculator interactive
- Build developer scorecard
- Build watchlist toggle + API
- Test IRR with 10 scenarios

### Week 4 — Alerts + Digest
- Build alerts page with all components
- Deploy alert-dispatcher, set hourly cron
- Set up Resend, verify domain
- Fix digest-sender to use React Email template
- Deploy digest-sender, set Sunday cron
- Send first test digest

### Week 5 — Billing + Polish
- Set up Stripe products (AED currency)
- Test checkout + webhook flow
- Add paywall gates everywhere
- Add ESLint + test suite
- Fix known bugs (see below)

### Week 6 — Launch
- Pre-launch checklist (20 items)
- Landing page
- Launch channels: FB group, LinkedIn, broker DMs, ProductHunt

---

## Known Bugs & Technical Debt

### P0 — Must Fix Before Launch

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | DLD scraper selectors are placeholders | `apps/scraper/scrapers/dld.py` | Inspect live DLD site, update selectors |
| 2 | PF scraper selectors are placeholders | `apps/scraper/scrapers/property_finder.py` | Inspect live PF site, update selectors |
| 3 | Score algorithm duplicated | `algorithm.ts` + `score-recalculator/index.ts` | Extract shared module or accept sync risk |
| 4 | Broken import in algorithm.ts | `apps/web/lib/scoring/algorithm.ts:19` | Change `'../types'` → `'@offplaniq/shared'` |
| 5 | No test coverage | Entire codebase | Add unit tests for scoring, IRR, utils at minimum |

### P1 — Fix Before Week 4

| # | Issue | File | Fix |
|---|-------|------|-----|
| 6 | Digest sender uses raw HTML, not React Email | `supabase/functions/digest-sender/index.ts` | Render `WeeklyDigest.tsx` or keep raw HTML (simpler for Edge Fn) |
| 7 | WatchlistButton bypasses API route | `components/project/WatchlistButton.tsx` | Use `/api/watchlist` route or accept direct Supabase calls |
| 8 | No ESLint/Prettier config | Root | Add `eslint.config.js` + `.prettierrc` |

### P2 — Post-Launch

| # | Issue | Fix |
|---|-------|-----|
| 9 | API v1 routes not created | Build when agency tier has customers |
| 10 | `api_keys` migration missing | Create `003_api_keys.sql` |
| 11 | Bayut scraper TODO | Build after DLD + PF are stable |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DLD changes DOM structure | High | Critical — no data | Monitor scraper failures, alert on 0 transactions |
| Supabase free tier limits | Medium | High — downtime | Upgrade to Pro ($25/mo) before launch |
| Stripe AED not available | Low | High — no revenue | Fallback to USD pricing |
| Score formula perceived as wrong | Medium | Medium — trust loss | Show breakdown on hover, publish methodology |
| Scraper gets IP-blocked | Medium | High — no data | Rotate proxies, add delays, respect robots.txt |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-07 | No ML in scoring | Investors trust explainable formulas. ML later as premium signal |
| 2026-04-07 | Python for scrapers, TS for everything else | Playwright Python more mature for complex scraping |
| 2026-04-07 | Supabase Edge Fns for cron | No extra infra. pg_cron triggers functions directly |
| 2026-04-07 | AED integers (no decimals) | Property prices don't need sub-AED precision |
| 2026-04-07 | Free tier: 20 projects, 30-day lag | Enough to demonstrate value, not enough to replace paid |

---

## Post-Launch Roadmap

```mermaid
timeline
    title OffplanIQ Roadmap
    section Phase 1 (Weeks 1-6)
        Data Pipeline : DLD scraper, score engine, PSF updater
        Core Product : Dashboard, project detail, IRR calculator
        Monetization : Stripe billing, paywall gates
        Retention : Alerts, weekly digest
        Launch : 10 users, 3 paying
    section Phase 2 (Weeks 7-12)
        More Data : Property Finder scraper, RERA scraper
        Features : Score trend charts, area comparison
        Growth : Google OAuth, referral program
    section Phase 3 (Months 4-6)
        Agency Tier : API v1, white-label PDFs, multi-seat
        Scale : 100+ paying users target
        Mobile : React Native app
    section Phase 4 (Month 7+)
        Expansion : Saudi Arabia (Riyadh)
        Advanced : ML-powered signals
        Enterprise : Custom dashboards, data exports
```

---

## File Map (Quick Reference)

```
offplaniq/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── page.tsx                    # Landing page
│   │   │   ├── layout.tsx                  # Root layout + fonts
│   │   │   ├── globals.css                 # Tailwind imports
│   │   │   ├── dashboard/page.tsx          # Screen 1: Project feed
│   │   │   ├── projects/[id]/page.tsx      # Screen 2: Detail + IRR
│   │   │   ├── alerts/page.tsx             # Screen 3: Alerts
│   │   │   ├── settings/billing/page.tsx   # Subscription management
│   │   │   ├── auth/login/page.tsx         # Login
│   │   │   ├── auth/register/page.tsx      # Register
│   │   │   └── api/
│   │   │       ├── checkout/route.ts       # Stripe checkout session
│   │   │       ├── webhooks/stripe/route.ts# Stripe webhook handler
│   │   │       └── watchlist/route.ts      # Watchlist CRUD
│   │   ├── components/
│   │   │   ├── project/                    # 9 feature components
│   │   │   ├── charts/PsfChart.tsx         # Recharts wrapper
│   │   │   ├── layout/Nav.tsx + NavUserMenu.tsx
│   │   │   └── ui/PaywallBanner.tsx + UpgradeButton.tsx
│   │   ├── hooks/                          # useProjects, useWatchlist, useAlerts
│   │   ├── lib/
│   │   │   ├── scoring/algorithm.ts        # THE scoring formula
│   │   │   ├── irr/calculator.ts           # IRR computation
│   │   │   └── supabase/{client,server,service}.ts
│   │   └── emails/WeeklyDigest.tsx         # React Email template
│   └── scraper/
│       ├── main.py                         # Orchestrator
│       ├── scrapers/dld.py                 # DLD transaction scraper
│       ├── scrapers/property_finder.py     # PF listing scraper
│       ├── jobs/match_transactions.py      # Fuzzy matcher
│       └── parsers/{date,price}.py         # Parse helpers
├── packages/shared/
│   ├── types/index.ts                      # All TypeScript interfaces
│   ├── constants/index.ts                  # Tiers, weights, pricing, areas
│   └── utils/index.ts                      # Formatting, math, dates
├── supabase/
│   ├── migrations/001_initial_schema.sql   # 11 tables, RLS, triggers
│   ├── migrations/002_cron_and_rpc.sql     # Views + RPC functions
│   ├── functions/                          # 4 Edge Functions
│   └── seed/seed.sql                       # 5 sample projects
├── docs/                                   # Architecture, API, specs
├── scripts/seed.ts                         # Seed runner
├── PLAN.md                                 # ← YOU ARE HERE
└── CLAUDE.md                               # AI coding instructions
```

---

*This plan is a living document. Update it as decisions are made and milestones are hit.*
