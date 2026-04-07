# Data sources

## 1. Dubai Land Department (DLD) — PRIMARY

**URL:** https://dubailand.gov.ae/en/eservices/real-estate-transaction-search/

**What it gives us:**
- Every registered property transaction in Dubai (T+1)
- Transaction date, type (sale/mortgage/gift), area, building, unit number
- Transaction value (AED), unit area (sqft)
- We compute PSF = value / sqft

**Key facts:**
- Data published the next business day (T+1)
- Off-plan sales are registered when SPA (Sale and Purchase Agreement) is signed
- All transactions are legally required to be registered — near 100% coverage
- No login required — fully public

**Scraper file:** `apps/scraper/scrapers/dld.py`

**CRITICAL SETUP STEP:**
Before the scraper works, open https://dubailand.gov.ae/en/eservices/real-estate-transaction-search/
in Chrome DevTools → Network tab → search for a date range → find the API call or table structure.
The site may use a REST API internally (check XHR requests) — if so, call that directly instead of
scraping HTML. Check Network tab for calls to `/api/` or similar. Much easier than Playwright if available.

**Matching transactions to projects:**
The DLD gives us `building_name` and `area_name`.
We fuzzy-match these to our `projects.name` and `projects.area` fields.
See `apps/scraper/jobs/match_transactions.py` (TODO: create this file).

---

## 2. Property Finder — SECONDARY

**URL:** https://www.propertyfinder.ae/en/off-plan-projects

**What it gives us:**
- Off-plan project listings with developer, area, unit types
- Starting price and PSF (from listing data)
- Payment plan summaries
- Project images and descriptions
- Sell-through indicators (sometimes shown as "X% sold")

**Scraper file:** `apps/scraper/scrapers/property_finder.py`

**Rate limiting:**
PF blocks aggressive scrapers. Use:
- 2s delay between requests
- Rotate user agents
- Max 200 pages/run
- If blocked: add residential proxy (Bright Data or Oxylabs, ~$50/mo)

**Alternative:** Property Finder has an unofficial partner API.
If you get traction, email their partnerships team — they may whitelist you.

---

## 3. Bayut — SECONDARY

**URL:** https://www.bayut.com/off-plan/

**What it gives us:**
- Overlapping coverage with PF but different project data
- Sometimes shows units_sold counts that PF doesn't
- Good for cross-validation

**Scraper file:** TODO — create `apps/scraper/scrapers/bayut.py` mirroring PF scraper

---

## 4. RERA / Dubai REST — REGULATORY

**URL:** https://dubailand.gov.ae/en/eservices/oqood/

**What it gives us:**
- Official project registration status
- Escrow account status
- RERA complaint filings (public record)
- Handover date changes (legal filings)

**Why it matters:**
Handover delays must be filed with RERA. This is our authoritative source for
`projects.current_handover_date` and `projects.handover_delay_days`.

**Scraper priority:** High — build after DLD and PF scrapers are stable.

---

## 5. Developer websites — SUPPLEMENTARY

Scrape each major developer's off-plan page for:
- Official launch PSF
- Payment plan details (more reliable than PF)
- Exact unit counts
- Construction progress updates

Priority developers to scrape:
1. `emaar.com/off-plan` — largest volume
2. `sobharealty.com` — premium segment, high investor interest
3. `binghatti.com` — fast-moving launches
4. `danubeproperties.com` — 1% payment plans (investor favourite)
5. `danah.ae` (Nakheel) — Palm and waterfront projects

---

## 6. Manual data entry (short-term)

Until scrapers are fully operational, manually enter:
- Developer scorecards (on-time delivery %, complaints) — 2-3h of research per developer
- Payment plan structures — from developer brochures / Property Finder
- PSF history for the seed 20 projects — from DLD manual search

Use the seed script: `scripts/seed.ts`

---

## Data quality rules

| Field | Source priority | Fallback |
|---|---|---|
| PSF (current) | DLD (most recent 30d avg) | Property Finder listing |
| PSF (history) | DLD | Property Finder snapshot |
| Sell-through % | Property Finder / developer site | Manual estimate |
| Handover date | RERA filing | Developer website |
| Developer score | Manual research + RERA complaints | Default: 60 |
| Payment plans | Developer website | Property Finder |

## Known data gaps

1. **Sell-through %** — DLD doesn't publish this directly. We infer it from
   registered transaction count vs total units. This is approximate.
   If a developer tells us the number directly, override with manual entry.

2. **Floor-level PSF** — DLD transactions include floor number.
   We don't use this yet but it's valuable future data (higher floors = premium PSF).
   Schema is ready for this (dld_transactions.floor_number).

3. **Resale vs primary** — DLD doesn't cleanly distinguish resale from primary.
   We use `is_off_plan = true` heuristic (transaction during construction period).
   Resale premium is manually estimated for now.
