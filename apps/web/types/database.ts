// apps/web/types/database.ts
//
// Supabase Database type — enables full type safety on all queries.
//
// HOW TO REGENERATE (after every migration):
//   supabase gen types typescript --project-id YOUR_PROJECT_ID > apps/web/types/database.ts
//
// This version is hand-written to match 001_initial_schema.sql + 002_cron_and_rpc.sql.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type ProjectStatus    = 'pre_launch' | 'active' | 'sold_out' | 'completed' | 'delayed' | 'cancelled'
export type HandoverStatus   = 'on_track' | 'at_risk' | 'delayed' | 'completed'
export type UnitType         = 'studio' | '1br' | '2br' | '3br' | '4br' | 'penthouse' | 'villa' | 'townhouse'
export type AlertType        = 'score_drop' | 'score_rise' | 'new_launch' | 'handover_delay' | 'psf_spike' | 'psf_drop' | 'sellthrough_stall' | 'developer_flag'
export type SubscriptionTier = 'free' | 'investor' | 'agency'

export interface Database {
  public: {
    Tables: {
      developers: {
        Row: {
          id: string
          name: string
          slug: string
          rera_developer_id: string | null
          founded_year: number | null
          hq_location: string | null
          website_url: string | null
          logo_url: string | null
          on_time_delivery_pct: number | null
          avg_quality_rating: number | null
          rera_complaints_count: number
          rera_violations_count: number
          total_projects_count: number
          completed_projects: number
          active_projects: number
          avg_roi_pct: number | null
          developer_score: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['developers']['Row']> & {
          name: string
          slug: string
        }
        Update: Partial<Database['public']['Tables']['developers']['Row']>
        Relationships: [
          {
            foreignKeyName: 'projects_developer_id_fkey'
            columns: ['id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['developer_id']
          }
        ]
      }

      projects: {
        Row: {
          id: string
          developer_id: string
          name: string
          slug: string
          rera_project_id: string | null
          property_finder_id: string | null
          bayut_id: string | null
          area: string
          subarea: string | null
          latitude: number | null
          longitude: number | null
          google_maps_url: string | null
          status: ProjectStatus
          handover_status: HandoverStatus
          unit_types: UnitType[]
          total_units: number
          total_floors: number | null
          launch_date: string | null
          original_handover_date: string | null
          current_handover_date: string | null
          handover_delay_days: number
          launch_psf: number | null
          current_psf: number | null
          min_price: number | null
          max_price: number | null
          units_sold: number
          sellthrough_pct: number
          resale_premium_pct: number
          score: number
          score_breakdown: Json | null
          score_updated_at: string | null
          description: string | null
          amenities: string[]
          images: string[]
          brochure_url: string | null
          is_featured: boolean
          is_verified: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['projects']['Row']> & {
          developer_id: string
          name: string
          slug: string
          area: string
          total_units: number
        }
        Update: Partial<Database['public']['Tables']['projects']['Row']>
        Relationships: [
          {
            foreignKeyName: 'projects_developer_id_fkey'
            columns: ['developer_id']
            isOneToOne: false
            referencedRelation: 'developers'
            referencedColumns: ['id']
          }
        ]
      }

      psf_history: {
        Row: {
          id: string
          project_id: string
          recorded_date: string
          psf: number
          source: 'dld' | 'property_finder' | 'bayut' | 'manual'
          sample_size: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['psf_history']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['psf_history']['Row']>
        Relationships: [
          {
            foreignKeyName: 'psf_history_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }

      payment_plans: {
        Row: {
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
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['payment_plans']['Row']> & {
          project_id: string
          name: string
          down_payment_pct: number
        }
        Update: Partial<Database['public']['Tables']['payment_plans']['Row']>
        Relationships: [
          {
            foreignKeyName: 'payment_plans_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }

      dld_transactions: {
        Row: {
          id: string
          project_id: string | null
          dld_transaction_id: string
          transaction_date: string
          transaction_type: string | null
          property_type: string | null
          area_name: string
          building_name: string
          unit_number: string | null
          floor_number: number | null
          actual_area_sqft: number | null
          transaction_value: number
          psf: number | null
          is_off_plan: boolean
          source_url: string | null
          scraped_at: string
        }
        Insert: Partial<Database['public']['Tables']['dld_transactions']['Row']> & {
          dld_transaction_id: string
          transaction_date: string
          area_name: string
          building_name: string
          transaction_value: number
        }
        Update: Partial<Database['public']['Tables']['dld_transactions']['Row']>
        Relationships: [
          {
            foreignKeyName: 'dld_transactions_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }

      user_profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          company: string | null
          phone: string | null
          subscription_tier: SubscriptionTier
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_ends_at: string | null
          seats_limit: number
          agency_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['user_profiles']['Row']> & {
          id: string
          email: string
        }
        Update: Partial<Database['public']['Tables']['user_profiles']['Row']>
        Relationships: []
      }

      watchlist: {
        Row: {
          id: string
          user_id: string
          project_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['watchlist']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['watchlist']['Row']>
        Relationships: [
          {
            foreignKeyName: 'watchlist_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'watchlist_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }

      alert_preferences: {
        Row: {
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
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['alert_preferences']['Row']> & {
          user_id: string
        }
        Update: Partial<Database['public']['Tables']['alert_preferences']['Row']>
        Relationships: [
          {
            foreignKeyName: 'alert_preferences_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          }
        ]
      }

      alerts_log: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          alert_type: AlertType
          title: string
          body: string | null
          metadata: Json | null
          is_read: boolean
          sent_at: string
        }
        Insert: Partial<Database['public']['Tables']['alerts_log']['Row']> & {
          user_id: string
          alert_type: AlertType
          title: string
        }
        Update: Partial<Database['public']['Tables']['alerts_log']['Row']>
        Relationships: [
          {
            foreignKeyName: 'alerts_log_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'alerts_log_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }

      score_snapshots: {
        Row: {
          id: string
          project_id: string
          score_date: string
          score: number
          breakdown: Json | null
        }
        Insert: Omit<Database['public']['Tables']['score_snapshots']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['score_snapshots']['Row']>
        Relationships: [
          {
            foreignKeyName: 'score_snapshots_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
    }

    Views: {
      top_projects_public: {
        Row: {
          id: string
          name: string
          slug: string
          area: string
          status: ProjectStatus
          handover_status: HandoverStatus
          total_units: number
          units_sold: number
          sellthrough_pct: number
          launch_psf: number | null
          current_psf: number | null
          score: number
          score_breakdown: Json | null
          current_handover_date: string | null
          handover_delay_days: number
          is_featured: boolean
          is_verified: boolean
          developer_name: string
          developer_slug: string
          developer_score: number | null
        }
        Relationships: []
      }
      project_psf_momentum: {
        Row: {
          project_id: string
          current_psf: number
          old_psf: number | null
          delta_pct_6m: number | null
        }
        Relationships: []
      }
    }

    Functions: {
      get_market_summary: {
        Args: Record<string, never>
        Returns: Json
      }
    }

    Enums: {
      project_status: ProjectStatus
      handover_status: HandoverStatus
      unit_type: UnitType
      alert_type: AlertType
      subscription_tier: SubscriptionTier
    }

    CompositeTypes: {
      [_ in never]: never
    }
  }
}
