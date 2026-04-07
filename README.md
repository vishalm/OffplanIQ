<p align="center">
  <img src="docs/assets/hero-banner.svg" alt="OffplanIQ" width="100%"/>
</p>

<p align="center">
  <strong>Bloomberg for Dubai off-plan real estate.</strong><br/>
  Track 142+ active projects with PSF analytics, scoring engine, IRR calculators, and developer scorecards.
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-blue?style=for-the-badge" alt="Quick Start"/></a>
  <a href="#-architecture"><img src="https://img.shields.io/badge/Architecture-purple?style=for-the-badge" alt="Architecture"/></a>
  <a href="#-scoring-engine"><img src="https://img.shields.io/badge/Scoring_Engine-green?style=for-the-badge" alt="Scoring"/></a>
  <a href="PLAN.md"><img src="https://img.shields.io/badge/Build_Plan-orange?style=for-the-badge" alt="Plan"/></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Next.js_14-000?logo=nextdotjs&logoColor=white" alt="Next.js"/>
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Stripe-635BFF?logo=stripe&logoColor=white" alt="Stripe"/>
  <img src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white" alt="Python"/>
  <img src="https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/tests-166_passing-brightgreen" alt="Tests"/>
</p>

---

## What is OffplanIQ?

OffplanIQ is a SaaS intelligence platform for **UAE property investors and brokers**. It aggregates data from Dubai Land Department, Property Finder, and developer sites to provide:

- **Project Scoring (0-100)** — Weighted formula combining sell-through velocity, PSF momentum, developer track record, and handover risk
- **IRR Calculator** — Compare payment plans side-by-side with sensitivity analysis
- **Real-time Alerts** — Score drops, PSF spikes, handover delays pushed via email
- **Developer Scorecards** — RERA complaints, on-time delivery %, quality ratings

### Who is this for?

| User | Value Prop |
|------|-----------|
| **Individual Investors** | Stop guessing — know which project has the best risk-adjusted returns |
| **Property Brokers** | Data-backed recommendations that close deals faster |
| **Real Estate Agencies** | White-label reports + API access for your team of 5 |

---

## 🚀 Quick Start

```bash
# Clone
git clone git@github.com:vishalm/OffplanIQ.git && cd OffplanIQ

# Install dependencies
pnpm install

# Set up environment (see .env.example for details)
cp .env.example .env.local

# Run database migrations
pnpm supabase db push

# Seed sample data (5 projects + 3 developers)
pnpm run seed

# Start the web app
pnpm --filter web dev        # → http://localhost:3000

# Run tests
pnpm --filter web test       # 95 TypeScript tests
cd apps/scraper && pytest     # 71 Python tests
```

---

## 🏗 Architecture

```mermaid
flowchart TB
    subgraph Sources["Data Sources"]
        DLD["Dubai Land Dept\ndubailand.gov.ae"]
        PF["Property Finder"]
        BAYUT["Bayut\nplanned"]
    end

    subgraph Pipeline["Data Pipeline - Railway"]
        direction LR
        DLD_S["dld.py\nPlaywright"]
        PF_S["property_finder.py\nPlaywright"]
        MATCH["match_transactions.py\nFuzzy Matcher"]
    end

    subgraph Supabase["Supabase Cloud"]
        DB[(PostgreSQL\n11 tables - RLS)]
        AUTH["Auth\nemail/password"]
        EF["Edge Functions x4"]
    end

    subgraph App["Next.js 14 - Vercel"]
        DASH["Dashboard\nProject Feed"]
        DETAIL["Project Detail\nIRR Calculator"]
        ALERTS["Alerts\nWatchlist"]
        BILLING["Billing\nStripe Integration"]
    end

    subgraph Ext["External Services"]
        STRIPE["Stripe\nSubscriptions"]
        RESEND["Resend\nEmail API"]
    end

    DLD --> DLD_S
    PF --> PF_S
    DLD_S --> DB
    PF_S --> DB
    MATCH --> DB
    EF --> DB
    EF --> RESEND
    DB --> App
    AUTH --> App
    BILLING <--> STRIPE
```

### Data Flow

```mermaid
sequenceDiagram
    participant R as Railway Cron (02:00 UTC)
    participant S as Scrapers
    participant DB as Supabase
    participant EF as Edge Functions
    participant U as Users

    R->>S: Trigger nightly pipeline
    S->>DB: Upsert transactions + listings
    S->>EF: POST psf-updater
    EF->>DB: Update current_psf + psf_history
    S->>EF: POST score-recalculator
    EF->>DB: Recalc all project scores

    loop Every hour
        EF->>DB: Check score changes vs watchlists
        EF->>U: Send alert emails (if enabled)
    end

    loop Every Sunday 9am UAE
        EF->>DB: Compile weekly stats
        EF->>U: Send digest email
    end
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js 14 (App Router) | Server Components, streaming, Vercel deploy |
| **Database** | Supabase (Postgres + RLS) | Auth + DB + Realtime + Edge Fns in one |
| **Styling** | Tailwind CSS | Utility-first, zero custom CSS |
| **Charts** | Recharts | React-native, lightweight |
| **Payments** | Stripe | AED subscriptions, webhooks, portal |
| **Email** | Resend + React Email | Best DX for transactional email |
| **Scraping** | Python + Playwright | Handles JS-rendered government sites |
| **CI/CD** | GitHub Actions | Lint + typecheck + 166 tests on every PR |
| **Hosting** | Vercel + Railway | Both have generous free tiers |

---

## 📊 Scoring Engine

<p align="center">
  <img src="docs/assets/score-formula.svg" alt="Score Formula" width="100%"/>
</p>

The score is the product. Every alert, digest, and investor decision is built on this number.

```
Score (0-100) = Sell-through (40) + PSF Delta (30) + Developer (20) + Handover (10)
```

**Why this formula?**
- **Sell-through (40%)** — Demand is the strongest signal. 90%+ sold means the market validated this project.
- **PSF Delta (30%)** — 6-month price momentum. Rising PSF = capital appreciation = what investors want.
- **Developer (20%)** — On-time delivery, RERA complaints, quality ratings. Execution trust.
- **Handover (10%)** — Is it on track? Delays kill investor ROI (especially with payment plan structures).

> **Design principle:** No ML. Fully explainable. Investors trust it because they understand every point.

See [docs/scoring-methodology.md](docs/scoring-methodology.md) for the full deep dive.

---

## 💰 IRR Calculator

The key paid feature. An investor managing a AED 1.5M purchase will pay AED 750/mo just to see this number.

```mermaid
graph LR
    A["Unit Price\nAED 1.5M"] --> C["IRR Engine"]
    B["Exit PSF\nAED 2,500/sqft"] --> C
    D["Hold Years\n3 years"] --> C
    E["Payment Plan\n20/40/40"] --> C
    C --> F["Estimated IRR\n+24.3%"]
    C --> G["Net Gain\nAED 375K"]
    C --> H["Sensitivity\nTable x8"]
```

**Key insight:** Lower down payment = less cash at risk = higher IRR on the same property. This is why comparing payment plans is the killer feature.

---

## 🗃️ Database Schema

```mermaid
erDiagram
    developers ||--o{ projects : "builds"
    projects ||--o{ psf_history : "tracks"
    projects ||--o{ payment_plans : "offers"
    projects ||--o{ dld_transactions : "matched"
    projects ||--o{ score_snapshots : "scored"
    user_profiles ||--o{ watchlist : "watches"
    user_profiles ||--o{ alerts_log : "receives"
    user_profiles ||--|{ alert_preferences : "configures"
    projects ||--o{ watchlist : "watched by"

    developers {
        uuid id PK
        string name
        int developer_score "0-100"
        int on_time_delivery_pct
        int rera_complaints_count
    }
    projects {
        uuid id PK
        string name
        string area
        enum status
        int current_psf "AED/sqft"
        int score "0-100"
        jsonb score_breakdown
        float sellthrough_pct
    }
    psf_history {
        uuid id PK
        date recorded_date
        int psf
        string source
    }
    payment_plans {
        uuid id PK
        string name
        float down_payment_pct
        float construction_pct
    }
    user_profiles {
        uuid id PK
        enum subscription_tier "free|investor|agency"
        string stripe_customer_id
    }
    alerts_log {
        uuid id PK
        enum alert_type
        string title
        bool is_read
    }
```

11 tables, all with RLS policies. Public read for market data, user-scoped for personal data.

See [docs/data-model.md](docs/data-model.md) for the complete schema reference.

---

## 💳 Subscription Tiers

```mermaid
graph LR
    F["Free\nAED 0/mo"]:::free --> I["Investor\nAED 750/mo"]:::inv
    I --> A["Agency\nAED 3,500/mo"]:::agency

    classDef free fill:#1e293b,stroke:#475569,color:#94a3b8
    classDef inv fill:#1e1b4b,stroke:#6366f1,color:#a5b4fc
    classDef agency fill:#172554,stroke:#3b82f6,color:#93c5fd
```

| Feature | Free | Investor | Agency |
|---------|:----:|:--------:|:------:|
| Projects visible | Top 20 | All 142+ | All 142+ |
| PSF data | 30-day lag | Live (T+1) | Live (T+1) |
| IRR calculator | — | ✅ | ✅ |
| Developer scorecard | — | ✅ | ✅ |
| Score breakdown | — | ✅ | ✅ |
| Alerts & digest | — | ✅ | ✅ |
| API access | — | — | ✅ |
| White-label PDFs | — | — | ✅ |
| Seats | 1 | 1 | 5 |

---

## 📁 Project Structure

```
offplaniq/
├── apps/
│   ├── web/                          # Next.js 14 (App Router)
│   │   ├── app/                      # Pages (Server Components)
│   │   │   ├── dashboard/            # Screen 1: Project feed
│   │   │   ├── projects/[id]/        # Screen 2: Detail + IRR
│   │   │   ├── alerts/               # Screen 3: Alerts & watchlist
│   │   │   ├── settings/billing/     # Stripe subscription
│   │   │   └── api/                  # Checkout, webhook, watchlist
│   │   ├── components/               # 14 React components
│   │   ├── lib/
│   │   │   ├── scoring/algorithm.ts  # ⭐ THE scoring formula
│   │   │   └── irr/calculator.ts     # ⭐ IRR computation
│   │   ├── hooks/                    # useProjects, useWatchlist, useAlerts
│   │   └── __tests__/               # 95 Vitest tests
│   └── scraper/                      # Python data pipeline
│       ├── scrapers/                 # DLD + Property Finder
│       ├── jobs/                     # Transaction matcher
│       ├── parsers/                  # Date + price parsers
│       └── tests/                    # 71 pytest tests
├── packages/shared/                  # Types, constants, utils
├── supabase/
│   ├── migrations/                   # 001 + 002 SQL migrations
│   ├── functions/                    # 4 Edge Functions
│   └── seed/                         # Sample data
├── docs/                             # Architecture + API + specs
├── gh-pages/                         # Documentation site
├── PLAN.md                           # 6-week build plan
└── AUDIT.md                          # Codebase health audit
```

---

## 🧪 Testing

```bash
# TypeScript tests (scoring, IRR, utils)
pnpm --filter web test               # 95 tests

# Python tests (date parser, price parser)
cd apps/scraper && pytest -v          # 71 tests

# Watch mode
pnpm --filter web test:watch
```

| Suite | Tests | What's covered |
|-------|------:|---------------|
| `scoring.test.ts` | 31 | All score components, thresholds, labels |
| `irr.test.ts` | 20 | IRR calc, plan comparison, sensitivity table |
| `utils.test.ts` | 44 | Formatting, math, fuzzy matching, dates |
| `test_date_parser.py` | 34 | Quarter, month, ISO, edge cases |
| `test_price_parser.py` | 37 | AED/PSF parsing, ranges, sanity checks |

---

## 🔧 Development

```bash
# Run everything locally
pnpm --filter web dev                 # Web app on :3000
supabase functions serve              # Edge functions locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Scraper (separate terminal)
python apps/scraper/scrapers/dld.py --days 7

# Add a database migration
supabase migration new your_feature_name
# Edit the file, then:
supabase db push
```

---

## 📚 Documentation

| Document | Description |
|----------|------------|
| [PLAN.md](PLAN.md) | 6-week build plan with Gantt charts and milestones |
| [AUDIT.md](AUDIT.md) | Codebase health audit (62/100) with action items |
| [Architecture Overview](docs/architecture/overview.md) | System diagram, data freshness, key decisions |
| [Data Model](docs/data-model.md) | Complete database schema with ERD |
| [Scoring Methodology](docs/scoring-methodology.md) | Deep dive into the scoring formula |
| [API Reference](docs/api/overview.md) | Agency-tier REST API spec |
| [Data Sources](docs/data-sources/overview.md) | How data gets into the system |
| [Screen Specs](docs/screens/specs.md) | UI specifications for all 3 screens |

---

## 🗺️ Roadmap

```mermaid
timeline
    title OffplanIQ 2026
    section Phase 1 · Build (Weeks 1-6)
        Week 1-2 : Data pipeline + Dashboard
        Week 3-4 : IRR calculator + Alerts
        Week 5-6 : Stripe billing + Launch
    section Phase 2 · Grow (Weeks 7-12)
        More scrapers : Property Finder + RERA
        More features : Score trends · Area comparison
        More users : Google OAuth · Referrals
    section Phase 3 · Scale (Months 4-6)
        Agency tier : API · PDFs · Multi-seat
        Target : 100+ paying users
    section Phase 4 · Expand (Month 7+)
        Saudi Arabia : Riyadh market
        Advanced : ML-powered signals
```

---

<p align="center">
  <sub>Built with obsessive attention to Dubai off-plan market data.</sub><br/>
  <sub>Made with ❤️ by <a href="https://github.com/vishalm">@vishalm</a></sub>
</p>
