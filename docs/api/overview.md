# API documentation

Agency plan users get REST API access via `api.offplaniq.com`.

All endpoints require:
```
Authorization: Bearer {api_key}
Content-Type: application/json
```

API keys are generated in `/settings/api` (agency plan only).
Stored in a `api_keys` table (TODO: add migration 003_api_keys.sql).

---

## GET /v1/projects

Returns all active projects with latest data.

**Query params:**
| Param | Type | Description |
|---|---|---|
| area | string | Filter by area name |
| min_score | integer | Minimum score (0–100) |
| max_score | integer | Maximum score (0–100) |
| status | string | active \| pre_launch \| completed |
| limit | integer | Max 100, default 20 |
| offset | integer | Pagination offset |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Binghatti Skyrise",
      "slug": "binghatti-skyrise",
      "area": "Business Bay",
      "developer": { "name": "Binghatti Properties", "score": 87 },
      "score": 91,
      "score_breakdown": { "sellthrough": 36, "psf_delta": 27, "developer": 18, "handover": 10, "total": 91 },
      "current_psf": 2340,
      "launch_psf": 1940,
      "sellthrough_pct": 84,
      "handover_status": "on_track",
      "current_handover_date": "2026-12-01",
      "updated_at": "2026-04-07T06:00:00Z"
    }
  ],
  "total": 142,
  "limit": 20,
  "offset": 0
}
```

---

## GET /v1/projects/:slug

Single project with full detail including PSF history and payment plans.

**Response:** Single project object with additional fields:
- `psf_history`: array of `{ date, psf, source }` for last 12 months
- `payment_plans`: array of payment plan objects
- `dld_transactions_30d`: count of DLD transactions in last 30 days

---

## GET /v1/projects/:slug/psf-history

PSF history time series for a project.

**Query params:**
| Param | Type | Default |
|---|---|---|
| from | date (YYYY-MM-DD) | 12 months ago |
| to | date (YYYY-MM-DD) | today |
| source | string | all (dld \| property_finder \| bayut) |

---

## GET /v1/market/summary

Current Dubai market summary.

**Response:**
```json
{
  "total_active_projects": 142,
  "avg_psf": 2180,
  "avg_psf_yoy_pct": 9.3,
  "avg_sellthrough_pct": 67,
  "top_area_by_psf_growth": "Creek Harbour",
  "top_area_by_sellthrough": "Creek Harbour",
  "new_launches_this_week": 4,
  "updated_at": "2026-04-07T06:00:00Z"
}
```

---

## Implementation notes for Claude Code

The API is a set of Next.js Route Handlers under `apps/web/app/api/v1/`.

Each handler:
1. Validates `Authorization: Bearer` header against `api_keys` table
2. Checks user subscription_tier = 'agency'
3. Queries Supabase using service client
4. Returns JSON

Rate limit: 100 requests per minute per API key.
Implement with Supabase's built-in rate limiting or a simple in-memory counter.

**Files to create:**
- `apps/web/app/api/v1/projects/route.ts`
- `apps/web/app/api/v1/projects/[slug]/route.ts`
- `apps/web/app/api/v1/projects/[slug]/psf-history/route.ts`
- `apps/web/app/api/v1/market/summary/route.ts`
- `supabase/migrations/003_api_keys.sql`
- `apps/web/app/settings/api/page.tsx` (generate/revoke keys)
