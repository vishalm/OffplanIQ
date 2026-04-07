# 6-week build plan

## Week 1 — Data pipeline

**Goal:** Get real data flowing into Supabase before building any UI.

**Tasks:**
- [ ] Create Supabase project at supabase.com
- [ ] Run `001_initial_schema.sql` migration
- [ ] Fill `.env.local` with Supabase keys
- [ ] Run `pnpm run seed` — verify 5 projects appear in Supabase dashboard
- [ ] Open DLD website in Chrome DevTools — inspect network requests during a search
  - If XHR API found: build a `requests`-based scraper (faster, no Playwright needed)
  - If HTML only: use Playwright scraper in `apps/scraper/scrapers/dld.py`
- [ ] Get DLD scraper pulling at least yesterday's transactions
- [ ] Verify transactions appear in `dld_transactions` table
- [ ] Deploy score-recalculator Edge Function: `supabase functions deploy score-recalculator`
- [ ] Invoke it manually — verify project scores appear in `projects.score`
- [ ] Set up Railway account, deploy scraper, set nightly cron

**Definition of done:** Supabase has 5+ projects with real PSF history and computed scores.

---

## Week 2 — Core dashboard (Screen 1)

**Goal:** Ship a working project feed that you'd be happy showing a beta user.

**Tasks:**
- [ ] Set up Next.js 14 project in `apps/web`
- [ ] Install Tailwind CSS and configure
- [ ] Set up Supabase auth (email/password to start, Google OAuth later)
- [ ] Build `middleware.ts` — verify redirect to login works
- [ ] Build `/auth/login` and `/auth/register` pages
- [ ] Build `app/dashboard/page.tsx` — server component, fetches projects
- [ ] Build `components/project/ProjectTable.tsx` — sortable table
- [ ] Build `components/project/MarketMetrics.tsx` — 4 metric cards
- [ ] Build `components/project/FilterBar.tsx` — area filter chips + search
- [ ] Build `components/project/ScoreBadge.tsx` — coloured score pill
- [ ] Deploy to Vercel: `vercel --prod`

**Definition of done:** You can log in, see the project table, filter by area, see scores.

---

## Week 3 — Project detail + IRR calculator (Screen 2)

**Goal:** The feature that makes people pay. Ship it this week.

**Tasks:**
- [ ] Build `app/projects/[id]/page.tsx`
- [ ] Build `components/charts/PsfChart.tsx` — Recharts LineChart of PSF history
- [ ] Build `components/project/IrrCalculator.tsx` — interactive sliders
  - Unit price slider
  - Exit PSF slider
  - Hold years slider
  - Payment plan selection
  - Live IRR output
  - Sensitivity table
- [ ] Build `components/project/DeveloperCard.tsx` — scorecard grid
- [ ] Build `components/ui/PaywallBanner.tsx` — upgrade prompt for free users
- [ ] Build `components/project/WatchlistButton.tsx` — add/remove from watchlist
- [ ] Add `POST /api/watchlist` route handler
- [ ] Test IRR calculator manually with 3 different scenarios

**Definition of done:** On any project page, you can drag sliders and see IRR update instantly.

---

## Week 4 — Alerts + digest (Screen 3)

**Goal:** The retention engine. Users who get the Sunday digest stay forever.

**Tasks:**
- [ ] Build `app/alerts/page.tsx`
- [ ] Build `components/project/AlertFeed.tsx`
- [ ] Build `components/project/WatchlistPanel.tsx`
- [ ] Build `components/project/AlertPreferencesForm.tsx`
- [ ] Deploy `alert-dispatcher` Edge Function
- [ ] Set up pg_cron to trigger alert-dispatcher hourly:
  ```sql
  select cron.schedule('alert-dispatcher', '0 * * * *',
    $$select net.http_post(url:='https://[project].supabase.co/functions/v1/alert-dispatcher',
    headers:='{"Authorization": "Bearer [service_key]"}'::jsonb)$$);
  ```
- [ ] Create Resend account, verify domain `offplaniq.com`
- [ ] Build `apps/web/emails/WeeklyDigest.tsx` React Email template
- [ ] Preview with: `npx email preview`
- [ ] Deploy `digest-sender` Edge Function
- [ ] Set up Sunday cron trigger
- [ ] Send yourself the first digest email manually

**Definition of done:** You receive a working Sunday digest email with your watchlisted projects.

---

## Week 5 — Auth, Stripe, billing

**Goal:** Make money. The first paying user validates the entire model.

**Tasks:**
- [ ] Create Stripe account, add AED as currency
- [ ] Create two products: Investor (AED 750/mo) and Agency (AED 3,500/mo)
- [ ] Note Price IDs → add to `.env.local`
- [ ] Build `app/settings/billing/page.tsx` — show current plan, upgrade button
- [ ] Implement `POST /api/checkout` route (file already scaffolded)
- [ ] Implement `POST /api/webhooks/stripe` (file already scaffolded)
- [ ] Test with Stripe test cards — verify `subscription_tier` updates in DB
- [ ] Add paywall gates to: IRR calculator, developer scorecard, alerts
- [ ] Test free → paid upgrade flow end to end
- [ ] Set up Stripe production keys, add webhook in Stripe dashboard
- [ ] Add Google OAuth to Supabase Auth (optional but improves conversion)

**Definition of done:** You can upgrade from free → investor and see the IRR calculator unlock.

---

## Week 6 — Launch

**Goal:** 10 beta users, 3 paying. Post everywhere.

**Pre-launch checklist:**
- [ ] All 20 seed projects have real PSF data from scraper
- [ ] Scores are computing correctly (spot-check 5 projects manually)
- [ ] IRR calculator tested with 10 different inputs
- [ ] Alerts sending correctly (add yourself to a watchlist, trigger a score change manually)
- [ ] Sunday digest sends successfully
- [ ] Stripe checkout works with real card
- [ ] Mobile responsive (check dashboard on phone)
- [ ] Error states handled: empty watchlist, no projects in filter, etc.
- [ ] `/` landing page (even just a simple one with sign-up CTA)

**Launch channels:**
- [ ] Post in Dubai Investors Facebook group (280K members)
  - Include screenshot of the score table + "Which project would you pick?"
- [ ] Post on LinkedIn with 3 screenshots
  - Frame as: "I built a tool that does for Dubai off-plan what Bloomberg does for stocks"
- [ ] DM 50 brokers on Instagram
  - Find accounts with 5K-50K followers posting Dubai property content
  - Send the IRR calculator screenshot for their favourite project
- [ ] Post in UAE real estate WhatsApp groups (get invited via LinkedIn/broker network)
- [ ] ProductHunt launch (schedule for Tuesday for max traffic)

**First 10 users target:**
- 5 from Facebook group post
- 3 from broker DMs
- 2 from LinkedIn

**Offer for first 10:** "Founding member rate: AED 499/mo for life (normally AED 750)"
Lock them in early, build trust, get feedback.

---

## Post-launch backlog (week 7+)

These are real but don't build them before you have paying users:

- **Property Finder scraper** — extends coverage significantly
- **RERA scraper** — authoritative handover delay data
- **Developer sites scrapers** — better payment plan data
- **Score trend chart** — show 30-day score history per project
- **Area comparison page** — PSF and score trends by area
- **White-label PDF reports** — agency plan feature, use Puppeteer
- **API endpoint** — agency plan, OpenAPI documented
- **Google OAuth** — reduces signup friction
- **Mobile app** — React Native when you have 100+ paying users
- **Saudi Arabia expansion** — Riyadh off-plan market is next
