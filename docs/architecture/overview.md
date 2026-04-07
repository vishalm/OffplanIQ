# Architecture Overview

<p align="center">
  <img src="../assets/logo.svg" alt="OffplanIQ" width="300"/>
</p>

## System Architecture

```mermaid
flowchart TB
    subgraph Sources["Data Sources"]
        DLD["🏛️ Dubai Land Department<br/><sub>dubailand.gov.ae</sub>"]
        PF["🏠 Property Finder<br/><sub>propertyfinder.ae</sub>"]
        BAYUT["🔮 Bayut<br/><sub>planned</sub>"]
        RERA["📋 RERA<br/><sub>planned</sub>"]
    end

    subgraph Pipeline["Python Scrapers · Railway · Nightly 02:00 UTC"]
        direction LR
        MAIN["main.py<br/>Orchestrator"]
        DLD_S["dld.py<br/>Playwright<br/><sub>DLD transactions</sub>"]
        PF_S["property_finder.py<br/>Playwright + requests<br/><sub>Listings + plans</sub>"]
        MATCH["match_transactions.py<br/>Fuzzy word overlap<br/><sub>Links txns → projects</sub>"]
    end

    subgraph Supabase["Supabase Cloud"]
        DB[(PostgreSQL<br/>11 tables<br/>RLS enabled)]
        AUTH["🔐 Auth<br/>email/password<br/>JWT tokens"]
        
        subgraph Edge["Edge Functions"]
            PSF_UP["psf-updater<br/><sub>Weighted avg PSF</sub>"]
            SCORE["score-recalculator<br/><sub>All project scores</sub>"]
            ALERT["alert-dispatcher<br/><sub>Hourly · pg_cron</sub>"]
            DIGEST["digest-sender<br/><sub>Sunday 05:00 UTC</sub>"]
        end
        
        RT["⚡ Realtime<br/>Alert push via WebSocket"]
    end

    subgraph WebApp["Next.js 14 · Vercel"]
        subgraph ServerComponents["Server Components (data fetching)"]
            DASH["📊 /dashboard"]
            PROJ["📈 /projects/[id]"]
            ALERTS_P["🔔 /alerts"]
            BILL["💳 /settings/billing"]
        end
        subgraph ClientComponents["Client Components (interactivity)"]
            IRR_C["IrrCalculator<br/><sub>3 sliders + sensitivity</sub>"]
            FILTER["FilterBar<br/><sub>Area chips + search</sub>"]
            PREFS["AlertPrefsForm<br/><sub>Toggles + thresholds</sub>"]
        end
        subgraph APIRoutes["API Routes"]
            CHECKOUT["POST /api/checkout"]
            WH["POST /api/webhooks/stripe"]
            WL["POST|DELETE /api/watchlist"]
        end
        MW["🛡️ middleware.ts<br/>Auth guard"]
    end

    subgraph External["External Services"]
        STRIPE["💳 Stripe<br/>AED subscriptions"]
        RESEND["📧 Resend<br/>Transactional email"]
    end

    DLD --> DLD_S
    PF --> PF_S
    MAIN --> DLD_S & PF_S & MATCH
    DLD_S & PF_S --> DB
    MATCH --> DB
    MAIN --> PSF_UP --> DB
    MAIN --> SCORE --> DB
    ALERT --> DB & RESEND
    DIGEST --> DB & RESEND
    RT --> ClientComponents
    DB --> ServerComponents
    AUTH --> MW --> ServerComponents
    CHECKOUT --> STRIPE
    STRIPE --> WH --> DB
```

---

## Deployment Topology

> **No self-hosted database.** Supabase Cloud is the single backend — DB, Auth, Realtime, Edge Functions, cron, and storage all in one. Zero database ops.

```mermaid
graph LR
    subgraph Vercel["Vercel"]
        WEB["Next.js SSR<br/>+ API Routes"]
    end
    subgraph SupaCloud["Supabase Cloud · Bahrain Region"]
        PG["PostgreSQL 15<br/>+ RLS + pg_cron"]
        EF["Edge Functions ×4"]
        SA["GoTrue Auth"]
        RL["Realtime WebSockets"]
    end
    subgraph Rail["Railway"]
        PY["Python Scraper<br/>Nightly cron"]
    end
    subgraph StripeCloud["Stripe"]
        SUB["Subscriptions API"]
    end
    subgraph ResendCloud["Resend"]
        EM["Email API"]
    end

    WEB <-->|"Supabase JS SDK"| PG & SA & RL
    PY -->|"REST API + service key"| PG
    PY -->|"HTTP POST"| EF
    EF --> PG & EM
    WEB --> SUB
    SUB -->|"webhooks"| WEB
```

### Why Supabase for everything?
- **One platform** = PostgreSQL + Auth + Realtime + Edge Functions + pg_cron + Storage
- **Zero database ops** — no backups, no scaling, no patching to manage
- **RLS baked in** — security at the database layer, not the application layer
- **Edge Functions** replace Lambda/Cloud Functions for scheduled jobs
- **pg_cron** replaces external cron services for hourly alerts and weekly digests
- **Realtime** pushes alert counts to the UI without polling
- **$25/mo Pro plan** covers all needs for the first 1000 users

---

## Data Freshness

| Data | Source | Frequency | Lag | Pipeline Stage |
|------|--------|-----------|-----|---------------|
| DLD transactions | dubailand.gov.ae | Daily 02:00 UTC | T+1 | `dld.py` → `dld_transactions` |
| PSF history | Computed from DLD | After scraper | T+1 | `psf-updater` → `psf_history` |
| Project listings | Property Finder | Every 6h | ~1h | `property_finder.py` → `projects` |
| Payment plans | Property Finder | Every 6h | ~1h | `property_finder.py` → `payment_plans` |
| Project scores | Edge Function | After scraper | T+1 | `score-recalculator` → `projects.score` |
| Score snapshots | Edge Function | Daily | T+1 | `score-recalculator` → `score_snapshots` |
| Alerts | Edge Function | Hourly | <1h | `alert-dispatcher` → `alerts_log` |
| Weekly digest | Edge Function | Sunday 05:00 UTC | Weekly | `digest-sender` → email |

---

## Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as middleware.ts
    participant SA as Supabase Auth
    participant SC as Server Component
    participant DB as PostgreSQL (RLS)

    B->>MW: GET /dashboard
    MW->>SA: Check session cookie
    alt No session
        MW-->>B: 302 → /auth/login?redirectTo=/dashboard
    else Valid session
        MW->>SC: Forward request
        SC->>DB: Query with auth.uid()
        Note over DB: RLS policy enforces<br/>user can only see own data
        DB-->>SC: Filtered results
        SC-->>B: Rendered HTML
    end
```

### Three Supabase Clients

| Client | File | Used By | Has RLS |
|--------|------|---------|---------|
| Browser | `lib/supabase/client.ts` | Client Components | Yes — user JWT |
| Server | `lib/supabase/server.ts` | Server Components, Route Handlers | Yes — user JWT via cookie |
| Service | `lib/supabase/service.ts` | Webhooks, Edge Functions, scraper | **No** — bypasses RLS |

---

## Stripe Subscription Flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as Web App
    participant S as Stripe
    participant DB as Database

    U->>W: Click "Upgrade to Investor"
    W->>W: POST /api/checkout { plan: 'investor' }
    W->>S: stripe.checkout.sessions.create()
    S-->>W: { url: 'https://checkout.stripe.com/...' }
    W-->>U: 302 → Stripe Checkout

    U->>S: Enter card, complete payment
    S->>W: POST /api/webhooks/stripe<br/>checkout.session.completed
    W->>W: Verify signature
    W->>DB: UPDATE user_profiles<br/>SET subscription_tier = 'investor'
    S-->>U: 302 → /settings/billing?success=true

    Note over S,W: Subscription lifecycle
    S->>W: customer.subscription.updated
    W->>DB: Update tier + expiry
    S->>W: customer.subscription.deleted
    W->>DB: SET tier = 'free'
```

---

## Alert Pipeline

```mermaid
flowchart TB
    CRON["pg_cron<br/>Every hour"] --> AD["alert-dispatcher"]
    
    AD --> FETCH["Fetch all watchlists<br/>+ user alert preferences"]
    AD --> SNAP["Fetch yesterday's<br/>score snapshots"]
    
    FETCH & SNAP --> COMPARE{Compare scores}
    
    COMPARE -->|"score dropped<br/>≥ threshold"| DROP["Insert score_drop alert"]
    COMPARE -->|"score rose<br/>≥ threshold"| RISE["Insert score_rise alert"]
    COMPARE -->|"handover delayed<br/>(deduped 30d)"| DELAY["Insert handover_delay alert"]
    
    DROP & RISE & DELAY --> CHECK{email_alerts<br/>enabled?}
    CHECK -->|Yes| SEND["Send via Resend API"]
    CHECK -->|No| DBONLY["Alert in DB only<br/>visible in /alerts"]
    
    SEND --> USER["📧 User inbox"]
    DBONLY --> RT["⚡ Realtime push<br/>to /alerts page"]
```

---

## Component Architecture

```mermaid
graph TB
    subgraph Server["Server Components — Data fetching, no JS shipped to client"]
        NAV["Nav.tsx"]
        DASH_P["dashboard/page.tsx"]
        PROJ_P["projects/[id]/page.tsx"]
        ALERT_P["alerts/page.tsx"]
        MET["MarketMetrics"]
        TABLE["ProjectTable"]
        BADGE["ScoreBadge"]
        DEV["DeveloperCard"]
        FEED["AlertFeed"]
        WLPAN["WatchlistPanel"]
        PW["PaywallBanner"]
    end

    subgraph Client["Client Components — Interactive, shipped to browser"]
        MENU["NavUserMenu"]
        FILTER_C["FilterBar"]
        IRR["IrrCalculator"]
        WLB["WatchlistButton"]
        CHART["PsfChart"]
        APREF["AlertPrefsForm"]
        UPG["UpgradeButton"]
    end

    NAV --> MENU
    DASH_P --> MET & FILTER_C & TABLE
    TABLE --> BADGE
    PROJ_P --> CHART & IRR & DEV & WLB
    ALERT_P --> FEED & WLPAN & APREF
    IRR -.->|"free tier"| PW
    DEV -.->|"free tier"| PW
    PW --> UPG

    style Server fill:#0f172a,stroke:#22c55e,stroke-width:2px,color:#e6edf3
    style Client fill:#0f172a,stroke:#8b5cf6,stroke-width:2px,color:#e6edf3
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No ML in scoring** | Investors trust formulas they can understand. ML later as "premium signal" |
| **Python scrapers, TS everything else** | Playwright Python is more mature for complex scraping. Clean boundary via REST API |
| **Supabase for everything** | DB + Auth + Realtime + Edge Fns + cron + storage in one. Zero database ops to manage |
| **No self-hosted Postgres** | Supabase Cloud handles backups, scaling, patching. Docker only runs the web app |
| **AED integers (no decimals)** | Property prices don't need sub-AED precision. Simpler math, no floating point errors |
| **Server Components by default** | Less JS shipped. Client Components only where user interaction is required |
| **RLS on everything** | Security at the database layer. Can't accidentally leak user data even if app code has bugs |
| **Score algorithm duplicated in Edge Fn** | Deno Edge Functions can't import from monorepo packages. Accepted tradeoff with sync test |

---

## Security Model

| Layer | Mechanism |
|-------|-----------|
| **Network** | HTTPS everywhere (Vercel + Supabase enforce TLS) |
| **Authentication** | Supabase Auth with JWT. Session in HTTP-only cookie |
| **Authorization** | RLS policies — user sees only own watchlist, alerts, profile |
| **API Protection** | middleware.ts guards all `/dashboard`, `/projects`, `/alerts`, `/settings` |
| **Webhook Verification** | Stripe signature checked with `constructEvent()` |
| **Service Key Isolation** | Only in 3 files: `service.ts`, Edge Functions, scraper env |
| **Secrets** | `.env.local` gitignored. No hardcoded credentials |
