# Data Model Reference

Complete database schema for OffplanIQ. All tables live in Supabase (PostgreSQL 15) with Row Level Security enabled.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    developers ||--o{ projects : "builds"
    projects ||--o{ psf_history : "price tracked"
    projects ||--o{ payment_plans : "offers"
    projects ||--o{ dld_transactions : "matched to"
    projects ||--o{ score_snapshots : "scored daily"
    projects ||--o{ watchlist : "watched by users"
    projects ||--o{ alerts_log : "triggers alerts"
    user_profiles ||--o{ watchlist : "watches projects"
    user_profiles ||--o{ alerts_log : "receives alerts"
    user_profiles ||--|{ alert_preferences : "has preferences"

    developers {
        uuid id PK
        string name "NOT NULL"
        string slug "UNIQUE"
        string rera_developer_id
        int founded_year
        string hq_location
        string website_url
        string logo_url
        int on_time_delivery_pct "0-100"
        float avg_quality_rating "1.0-5.0"
        int rera_complaints_count "default 0"
        int rera_violations_count "default 0"
        int total_projects_count "default 0"
        int completed_projects "default 0"
        int active_projects "default 0"
        float avg_roi_pct
        int developer_score "0-100 computed"
        text notes
        timestamp created_at
        timestamp updated_at "trigger"
    }

    projects {
        uuid id PK
        uuid developer_id FK
        string name "NOT NULL"
        string slug "UNIQUE"
        string rera_project_id "UNIQUE"
        string property_finder_id
        string bayut_id
        string area "NOT NULL"
        string subarea
        float latitude
        float longitude
        string google_maps_url
        enum status "project_status"
        enum handover_status "handover_status"
        array unit_types "unit_type[]"
        int total_units "default 0"
        int total_floors
        date launch_date
        date original_handover_date
        date current_handover_date
        int handover_delay_days "default 0"
        int launch_psf "AED/sqft"
        int current_psf "AED/sqft"
        int min_price "AED"
        int max_price "AED"
        int units_sold "default 0"
        float sellthrough_pct "default 0"
        float resale_premium_pct "default 0"
        int score "0-100 default 0"
        jsonb score_breakdown
        timestamp score_updated_at
        text description
        array amenities "text[]"
        array images "text[]"
        string brochure_url
        bool is_featured "default false"
        bool is_verified "default false"
        timestamp created_at
        timestamp updated_at "trigger"
    }

    psf_history {
        uuid id PK
        uuid project_id FK
        date recorded_date "NOT NULL"
        int psf "NOT NULL AED/sqft"
        string source "dld|property_finder|bayut|manual"
        int sample_size "default 1"
        timestamp created_at
    }

    payment_plans {
        uuid id PK
        uuid project_id FK
        string name "NOT NULL"
        text description
        float down_payment_pct "default 0"
        float construction_pct "default 0"
        float handover_pct "default 0"
        float post_handover_pct "default 0"
        int post_handover_months "default 0"
        float monthly_pct "default 0 (Danube 1%/mo)"
        bool is_active "default true"
        timestamp created_at
    }

    dld_transactions {
        uuid id PK
        uuid project_id FK "nullable"
        string dld_transaction_id "UNIQUE"
        date transaction_date "NOT NULL"
        string transaction_type
        string property_type
        string area_name
        string building_name
        string unit_number
        int floor_number
        float actual_area_sqft
        int transaction_value "AED NOT NULL"
        int psf "computed"
        bool is_off_plan "default true"
        string source_url
        timestamp scraped_at
    }

    user_profiles {
        uuid id PK "FK auth.users CASCADE"
        string email "NOT NULL"
        string full_name
        string company
        string phone
        enum subscription_tier "default free"
        string stripe_customer_id "UNIQUE"
        string stripe_subscription_id
        timestamp subscription_ends_at
        int seats_limit "default 1"
        uuid agency_id
        timestamp created_at
        timestamp updated_at "trigger"
    }

    watchlist {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        timestamp created_at
    }

    alert_preferences {
        uuid user_id PK "FK user_profiles"
        int score_drop_threshold "default 5"
        int score_rise_threshold "default 5"
        float psf_change_threshold "default 5%"
        bool notify_new_launches "default true"
        bool notify_handover_delays "default true"
        bool notify_sellthrough_stall "default true"
        bool email_alerts "default true"
        bool weekly_digest "default true"
    }

    alerts_log {
        uuid id PK
        uuid user_id FK
        uuid project_id FK "nullable"
        enum alert_type "NOT NULL"
        string title "NOT NULL"
        text body
        jsonb metadata
        bool is_read "default false"
        timestamp sent_at "default now()"
    }

    score_snapshots {
        uuid id PK
        uuid project_id FK
        date score_date "NOT NULL"
        int score "NOT NULL"
        jsonb breakdown
    }
```

---

## Enums

```sql
-- Project lifecycle
CREATE TYPE project_status AS ENUM (
  'pre_launch', 'active', 'sold_out', 'completed', 'delayed', 'cancelled'
);

-- Handover risk assessment
CREATE TYPE handover_status AS ENUM (
  'on_track', 'at_risk', 'delayed', 'completed'
);

-- Apartment types tracked
CREATE TYPE unit_type AS ENUM (
  'studio', '1br', '2br', '3br', '4br', 'penthouse', 'villa', 'townhouse'
);

-- Alert categories
CREATE TYPE alert_type AS ENUM (
  'score_drop', 'score_rise', 'new_launch', 'handover_delay',
  'psf_spike', 'psf_drop', 'sellthrough_stall', 'developer_flag'
);

-- Subscription plans
CREATE TYPE subscription_tier AS ENUM ('free', 'investor', 'agency');
```

---

## Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `projects` | `area` | Filter by Dubai area |
| `projects` | `status` | Filter active/pre_launch |
| `projects` | `score DESC` | Sort by score on dashboard |
| `projects` | `developer_id` | Join to developers |
| `psf_history` | `(project_id, recorded_date DESC)` | PSF chart queries |
| `dld_transactions` | `project_id` | Join matched transactions |
| `dld_transactions` | `transaction_date DESC` | Recent transactions |
| `dld_transactions` | `area_name` | Fuzzy matching pre-filter |
| `alerts_log` | `(user_id, sent_at DESC)` | User's alert feed |

---

## Unique Constraints

| Table | Constraint | Purpose |
|-------|-----------|---------|
| `developers` | `slug` | URL-safe identifier |
| `projects` | `slug` | URL routing |
| `projects` | `rera_project_id` | Dedup from RERA |
| `psf_history` | `(project_id, recorded_date, source)` | One PSF per source per day |
| `dld_transactions` | `dld_transaction_id` | Dedup from DLD |
| `watchlist` | `(user_id, project_id)` | One watch per user per project |
| `alert_preferences` | `user_id` | One preferences row per user |
| `score_snapshots` | `(project_id, score_date)` | One snapshot per day |
| `user_profiles` | `stripe_customer_id` | One Stripe customer per user |

---

## RLS Policies

### Public Read (market data)
Tables: `projects`, `developers`, `psf_history`, `payment_plans`, `score_snapshots`, `dld_transactions`

```sql
CREATE POLICY "Public read" ON projects FOR SELECT USING (true);
```

Write access: service role only (scrapers, Edge Functions).

### User-Scoped (personal data)
Tables: `user_profiles`, `watchlist`, `alert_preferences`, `alerts_log`

```sql
CREATE POLICY "Users read own" ON watchlist FOR SELECT 
  USING (auth.uid() = user_id);
CREATE POLICY "Users write own" ON watchlist FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
```

---

## Triggers

| Trigger | Table | Action |
|---------|-------|--------|
| `touch_updated_at` | `projects`, `developers`, `user_profiles` | Sets `updated_at = now()` on UPDATE |
| `handle_new_user` | `auth.users` | On INSERT: creates `user_profiles` + `alert_preferences` rows |

---

## Views (migration 002)

### `top_projects_public`
Joins `projects` with `developers`, filters to active/pre_launch, orders by score DESC. Used for public-facing queries.

### `project_psf_momentum`
CTE-based view computing 6-month PSF delta per project. Used by the scoring pipeline.

---

## RPC Functions (migration 002)

### `get_market_summary()`
Returns JSON:
```json
{
  "total_projects": 142,
  "avg_psf": 2180,
  "avg_sellthrough_pct": 67,
  "launches_this_week": 4
}
```

---

## Monetary Conventions

| Type | Storage | Example | Display |
|------|---------|---------|---------|
| Property price | AED integer | `1500000` | `AED 1.50M` |
| PSF | AED/sqft integer | `2340` | `AED 2,340/sqft` |
| Transaction value | AED integer | `2100000` | `AED 2.10M` |
| Subscription price | AED integer | `750` | `AED 750/mo` |

No decimals, no fils. Property prices don't need sub-AED precision. All display formatting in `packages/shared/utils/index.ts`.

---

## Migration Files

| File | Description |
|------|------------|
| `supabase/migrations/001_initial_schema.sql` | All 11 tables, enums, RLS, triggers, indexes (351 lines) |
| `supabase/migrations/002_cron_and_rpc.sql` | Views, RPC functions, pg_cron setup |

**Rule:** Never edit existing migration files. Always create new ones: `supabase migration new feature_name`
