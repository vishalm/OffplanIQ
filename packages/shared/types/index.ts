// OffplanIQ — Shared TypeScript Types
// These mirror the Supabase schema exactly.
// Import from '@offplaniq/shared' in both web and any future services.

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────
export type ProjectStatus = 'pre_launch' | 'active' | 'sold_out' | 'completed' | 'delayed' | 'cancelled'
export type HandoverStatus = 'on_track' | 'at_risk' | 'delayed' | 'completed'
export type UnitType = 'studio' | '1br' | '2br' | '3br' | '4br' | 'penthouse' | 'villa' | 'townhouse'
export type AlertType = 'score_drop' | 'score_rise' | 'new_launch' | 'handover_delay' | 'psf_spike' | 'psf_drop' | 'sellthrough_stall' | 'developer_flag'
export type SubscriptionTier = 'free' | 'investor' | 'agency'

// ─────────────────────────────────────────────
// DATABASE ROW TYPES
// ─────────────────────────────────────────────
export interface Developer {
  id: string
  name: string
  slug: string
  rera_developer_id: string | null
  founded_year: number | null
  website_url: string | null
  logo_url: string | null
  on_time_delivery_pct: number | null   // 0-100
  avg_quality_rating: number | null     // 1.0-5.0
  rera_complaints_count: number
  rera_violations_count: number
  total_projects_count: number
  completed_projects: number
  active_projects: number
  avg_roi_pct: number | null
  developer_score: number | null        // 0-100
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  developer_id: string
  name: string
  slug: string
  rera_project_id: string | null
  area: string
  subarea: string | null
  latitude: number | null
  longitude: number | null
  status: ProjectStatus
  handover_status: HandoverStatus
  unit_types: UnitType[]
  total_units: number
  total_floors: number | null
  launch_date: string | null            // ISO date
  original_handover_date: string | null
  current_handover_date: string | null
  handover_delay_days: number
  launch_psf: number | null             // AED per sqft
  current_psf: number | null
  min_price: number | null              // AED
  max_price: number | null
  units_sold: number
  sellthrough_pct: number               // 0-100
  resale_premium_pct: number
  score: number                         // 0-100
  score_breakdown: ScoreBreakdown | null
  score_updated_at: string | null
  description: string | null
  amenities: string[]
  images: string[]
  brochure_url: string | null
  is_featured: boolean
  is_verified: boolean
  created_at: string
  updated_at: string
  // Joined
  developer?: Developer
  payment_plans?: PaymentPlan[]
  psf_history?: PsfDataPoint[]
}

export interface PsfDataPoint {
  id: string
  project_id: string
  recorded_date: string               // ISO date
  psf: number                         // AED per sqft
  source: 'dld' | 'property_finder' | 'bayut' | 'manual'
  sample_size: number
}

export interface PaymentPlan {
  id: string
  project_id: string
  name: string
  description: string | null
  down_payment_pct: number
  construction_pct: number
  handover_pct: number
  post_handover_pct: number
  post_handover_months: number
  monthly_pct: number
  is_active: boolean
}

export interface DldTransaction {
  id: string
  project_id: string | null
  dld_transaction_id: string
  transaction_date: string
  transaction_type: string | null
  area_name: string
  building_name: string
  unit_number: string | null
  floor_number: number | null
  actual_area_sqft: number | null
  transaction_value: number           // AED
  psf: number | null
  is_off_plan: boolean
}

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  company: string | null
  subscription_tier: SubscriptionTier
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_ends_at: string | null
  seats_limit: number
  created_at: string
}

export interface WatchlistEntry {
  id: string
  user_id: string
  project_id: string
  created_at: string
  project?: Project
}

export interface AlertPreferences {
  id: string
  user_id: string
  score_drop_threshold: number
  score_rise_threshold: number
  psf_change_threshold: number
  notify_new_launches: boolean
  notify_handover_delays: boolean
  notify_sellthrough_stall: boolean
  email_alerts: boolean
  weekly_digest: boolean
}

export interface AlertLogEntry {
  id: string
  user_id: string
  project_id: string | null
  alert_type: AlertType
  title: string
  body: string | null
  metadata: Record<string, unknown> | null
  is_read: boolean
  sent_at: string
  project?: Project
}

// ─────────────────────────────────────────────
// COMPUTED / DERIVED TYPES
// ─────────────────────────────────────────────
export interface ScoreBreakdown {
  sellthrough: number       // 0-40
  psf_delta: number         // 0-30
  developer: number         // 0-20
  handover: number          // 0-10
  total: number             // 0-100
}

export interface IrrResult {
  plan_id: string
  plan_name: string
  estimated_irr_pct: number
  total_invested: number    // AED
  exit_value: number        // AED
  net_gain: number          // AED
  hold_years: number
}

export interface IrrInputs {
  unit_price_aed: number
  area_sqft: number
  exit_psf_aed: number
  hold_years: number
  payment_plan: PaymentPlan
}

export interface ProjectFilters {
  areas: string[]
  statuses: ProjectStatus[]
  handover_statuses: HandoverStatus[]
  unit_types: UnitType[]
  min_score: number
  max_score: number
  min_psf: number
  max_psf: number
  developer_ids: string[]
  search: string
}

export interface MarketSummary {
  total_projects: number
  avg_psf: number
  avg_sellthrough_pct: number
  launches_this_week: number
  top_area_by_psf_growth: string
  top_area_by_sellthrough: string
}
