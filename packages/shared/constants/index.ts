// packages/shared/constants/index.ts
// Single source of truth for all magic numbers and config.
// Import in both web app and edge functions.

// ─────────────────────────────────────────────
// DUBAI AREAS
// ─────────────────────────────────────────────
export const DUBAI_AREAS = [
  'Business Bay',
  'Downtown Dubai',
  'Dubai Marina',
  'JVC',             // Jumeirah Village Circle
  'JLT',             // Jumeirah Lakes Towers
  'Creek Harbour',
  'Dubai Harbour',
  'Palm Jumeirah',
  'Meydan',
  'Arjan',
  'Dubai Hills',
  'Sobha Hartland',
  'Al Furjan',
  'Motor City',
  'Sports City',
  'Damac Hills',
  'Arabian Ranches',
  'Mohammed Bin Rashid City',
  'Dubai South',
  'Expo City',
  'Abu Dhabi',
  'Yas Island',
  'Saadiyat Island',
  'Ras Al Khaimah',
  'Al Marjan Island',
] as const

export type DubaiArea = typeof DUBAI_AREAS[number]

// ─────────────────────────────────────────────
// SUBSCRIPTION TIER LIMITS
// ─────────────────────────────────────────────
export const TIER_LIMITS = {
  free: {
    max_projects:      20,
    psf_lag_days:      30,
    irr_calculator:    false,
    developer_scores:  false,
    alerts:            false,
    weekly_digest:     false,
    api_access:        false,
    seats:             1,
  },
  investor: {
    max_projects:      Infinity,
    psf_lag_days:      0,
    irr_calculator:    true,
    developer_scores:  true,
    alerts:            true,
    weekly_digest:     true,
    api_access:        false,
    seats:             1,
  },
  agency: {
    max_projects:      Infinity,
    psf_lag_days:      0,
    irr_calculator:    true,
    developer_scores:  true,
    alerts:            true,
    weekly_digest:     true,
    api_access:        true,
    seats:             5,
  },
} as const

// ─────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────
export const SCORE_WEIGHTS = {
  sellthrough: 40,
  psf_delta:   30,
  developer:   20,
  handover:    10,
} as const

export const SCORE_THRESHOLDS = {
  excellent: 85,
  good:      70,
  watch:     55,
  caution:   40,
  // below 40: avoid
} as const

// ─────────────────────────────────────────────
// ALERT DEFAULTS
// ─────────────────────────────────────────────
export const ALERT_DEFAULTS = {
  score_drop_threshold:     5,
  score_rise_threshold:     5,
  psf_change_threshold:     5,   // percent
  notify_new_launches:      true,
  notify_handover_delays:   true,
  notify_sellthrough_stall: true,
  email_alerts:             true,
  weekly_digest:            true,
} as const

// ─────────────────────────────────────────────
// PRICING (AED)
// ─────────────────────────────────────────────
export const PLAN_PRICING = {
  investor: { aed_monthly: 750,   aed_annual: 7500  },  // 2 months free
  agency:   { aed_monthly: 3500,  aed_annual: 35000 },
} as const

// ─────────────────────────────────────────────
// SCRAPER CONFIG
// ─────────────────────────────────────────────
export const SCRAPER_CONFIG = {
  request_delay_ms:  2000,
  max_retries:       3,
  batch_size:        100,   // rows per Supabase upsert
  dld_base_url:      'https://dubailand.gov.ae/en/eservices/real-estate-transaction-search/',
  pf_base_url:       'https://www.propertyfinder.ae',
  pf_offplan_url:    'https://www.propertyfinder.ae/en/off-plan-projects',
  bayut_offplan_url: 'https://www.bayut.com/off-plan/',
} as const
