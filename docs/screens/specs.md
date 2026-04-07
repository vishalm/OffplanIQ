# Screen specifications

Complete spec for all 3 core screens. Reference this when building components.

---

## Screen 1 — Project feed (`/dashboard`)

**Purpose:** Daily landing page. Investors check this every morning.

**Server Component** — data fetched at request time, no loading states.

### Layout
```
┌── Nav (sticky) ─────────────────────────────────────────────┐
├── Max-width container ──────────────────────────────────────┤
│   Header: "Off-plan tracker" + project count + upgrade CTA  │
│   MarketMetrics: 4 metric cards (projects, avg PSF, etc.)   │
│   FilterBar: area chips + search + sort dropdown            │
│   ProjectTable: sortable rows (see columns below)           │
│   Free tier banner: "Showing 10 of 142+ — Upgrade"         │
└─────────────────────────────────────────────────────────────┘
```

### ProjectTable columns
| Column | Source | Free tier |
|---|---|---|
| Project name + developer + area | `projects.name`, `developer.name` | Yes |
| Handover status badge | `projects.handover_status` | Yes |
| PSF (current) | `projects.current_psf` | Lagged 30d |
| 6m PSF delta % | Computed from psf_history | Lagged 30d |
| Sell-through % + bar | `projects.sellthrough_pct` | Yes |
| Handover date + delay | `projects.current_handover_date` | Yes |
| Score badge | `projects.score` | Yes |

### Access control
- Free: top 20 by score, PSF data 30 days behind
- Paid: all 142+, live data
- Rows 10-19 on free plan show blurred (CSS blur + pointer-events: none)

### Interactions
- Click row → navigate to `/projects/[slug]`
- Filter chips → update URL params, re-render server component
- Search → debounced, updates URL param `q`
- Sort dropdown → updates URL param `sort`

---

## Screen 2 — Project detail (`/projects/[slug]`)

**Purpose:** Deep-dive page. The IRR calculator is why people upgrade.

**Server Component** for data fetch, **Client Components** for interactive parts.

### Layout
```
← Back to feed

[Project name] [Watchlist btn] [Score badge large]
Developer · Area · Units · Handover date
[Status badge] [RERA badge]

┌── 4 stat cards: Launch PSF / Current PSF / Sell-through / Resale premium
│
├── PSF history chart (Recharts LineChart, Client)
│
├── Payment plan IRR calculator (Client — PAID GATE)
│   Sliders: unit price / exit PSF / hold years
│   Plan cards: 3 plans side by side, click to select
│   Sensitivity table: PSF scenarios × IRR outcome
│
├── Developer scorecard (PAID GATE)
│   Grid: 6 metrics with colour coding
│
└── PaywallBanner if free user (shown instead of gated features)
```

### IRR Calculator state
```typescript
{
  unitPrice: number         // AED, slider 500K–5M, step 50K
  exitPsf: number           // AED/sqft, slider 1000–5000, step 50
  holdYears: number         // 1–7, step 1
  selectedPlanId: string    // from project.payment_plans
}
```

All calculations happen in-browser via `lib/irr/calculator.ts`.
No network calls on slider change — instant response.

### Score badge tooltip
On hover: show breakdown "Sell-through: 36/40 · PSF: 24/30 · Developer: 18/20 · Handover: 10/10"

---

## Screen 3 — Alerts & watchlist (`/alerts`)

**Purpose:** Retention engine. Users who engage here stay forever.

**Server Component** for data, **Client Components** for preference toggles.

### Layout (2-column, 2/3 + 1/3)
```
Header: "Alerts & watchlist" + unread count

Left col (2/3):
  AlertFeed — vertical list of alert cards
    Each card: coloured dot + title + body + time + project link
    Unread cards: subtle blue tint background

Right col (1/3):
  WatchlistPanel — list of watched projects with score
    Empty state: "No projects watched — Browse →"

  AlertPreferencesForm (Client)
    Score drop threshold: dropdown (3/5/8/10/15 pts)
    Toggles: new launches / handover delays / stall / email / digest
    Save button
```

### Alert types and colours
| Type | Dot colour | Icon |
|---|---|---|
| score_drop | Red | ↓ |
| score_rise | Green | ↑ |
| new_launch | Blue | ★ |
| handover_delay | Amber | ! |
| psf_spike | Green | ↑ |
| psf_drop | Red | ↓ |
| sellthrough_stall | Gray | ~ |

### Mark as read
All alerts marked as read immediately when page is visited.
Unread badge in nav disappears on next page load.

---

## Additional screens (build after Week 5)

### `/settings/billing`
- 3-column plan comparison (Free / Investor / Agency)
- Current plan highlighted
- UpgradeButton → POST /api/checkout → Stripe
- Success/cancelled query param handling

### `/auth/login` and `/auth/register`
- Centered card, minimal
- Email + password only (Google OAuth as follow-up)
- Register shows confirmation screen after submission

### `/` (landing page)
- Nav with sign in + "Start free" CTA
- Hero headline + subtitle
- 4 stats row
- 6 feature cards
- Dark pricing CTA section
- Footer
