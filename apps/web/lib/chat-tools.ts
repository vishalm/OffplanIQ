// apps/web/lib/chat-tools.ts
// Server-only tool registry the chat agent can call.
//
// Each tool exposes:
//   - schema:   the JSON schema sent to Azure OpenAI as part of `tools[]`
//   - execute:  async runner that takes parsed args, runs the query, and
//               returns a JSON-serialisable result the model gets back.
//
// We deliberately keep results SMALL (default limit 10, capped 25) so the
// model isn't tempted to dump the whole catalogue into its context.

import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'
import { calculateIrr } from '@/lib/irr/calculator'
import type { IrrInputs } from '@offplaniq/shared'
import { azureEmbed, azureEmbeddingsConfigured } from '@/lib/azure-openai'

export type ToolSchema = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ToolCallResult = {
  ok: boolean
  data?: unknown
  error?: string
}

// ─── Schemas ────────────────────────────────────────────────
export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'search_projects',
      description:
        'Search the project catalogue with structured filters. Returns up to 25 matching projects ranked by score. Use this when the user asks for projects matching specific criteria (city, area, price, unit type, handover date, developer).',
      parameters: {
        type: 'object',
        properties: {
          city:           { type: 'string', description: "Emirate, e.g. 'Dubai', 'Abu Dhabi'." },
          area:           { type: 'string', description: "Sub-community substring, e.g. 'JVC', 'Business Bay'. Case-insensitive prefix match." },
          min_price_aed:  { type: 'integer', description: 'Minimum unit starting price in AED.' },
          max_price_aed:  { type: 'integer', description: 'Maximum unit starting price in AED.' },
          unit_types:     {
            type: 'array',
            items: { type: 'string', enum: ['studio','1br','2br','3br','4br','5br','penthouse','villa','townhouse','duplex'] },
            description: 'One or more unit types — project must offer at least one of these.',
          },
          handover_before: { type: 'string', description: "ISO date 'YYYY-MM-DD'. Only projects handing over on/before this date." },
          handover_after:  { type: 'string', description: "ISO date 'YYYY-MM-DD'. Only projects handing over on/after this date." },
          min_score:      { type: 'integer', description: '0-100. Filter projects with score >= this.' },
          developer_slug: { type: 'string', description: "Developer slug, e.g. 'emaar-properties'." },
          sort_by:        { type: 'string', enum: ['score','min_price','current_psf','handover_date'], description: 'Sort field.' },
          limit:          { type: 'integer', description: 'Max results, default 10, capped 25.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_projects',
      description: 'Side-by-side comparison of two or more projects by slug. Returns key metrics for each so the model can highlight differences.',
      parameters: {
        type: 'object',
        properties: {
          slugs: { type: 'array', items: { type: 'string' }, description: 'Project slugs to compare (2-5).' },
        },
        required: ['slugs'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_similar_projects',
      description: 'Given a seed project slug, return projects with similar characteristics (area, price band, score) plus brochures whose embeddings are nearest to the seed project. Useful when the user asks "what else is like X?".',
      parameters: {
        type: 'object',
        properties: {
          slug:  { type: 'string', description: 'Seed project slug.' },
          limit: { type: 'integer', description: 'Max results, default 5.' },
        },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_irr',
      description: 'Estimate annualised IRR for a project under a given exit PSF and hold period using the project\'s primary payment plan. Returns IRR percent and underlying assumptions.',
      parameters: {
        type: 'object',
        properties: {
          slug:          { type: 'string', description: 'Project slug.' },
          exit_psf_aed:  { type: 'integer', description: 'Assumed PSF at exit (AED/sqft).' },
          hold_years:    { type: 'number', description: 'Hold period in years (e.g. 3, 5).' },
          area_sqft:     { type: 'number', description: 'Optional: assumed unit size in sqft. Defaults to 800.' },
        },
        required: ['slug', 'exit_psf_aed', 'hold_years'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recent_updates',
      description: "List the most recent project updates (launches, price changes, handover changes). Use when the user asks 'what's new' or 'what changed'.",
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max results, default 10, capped 25.' },
          change_type: { type: 'string', enum: ['launch','price_change','handover_change','units_change','description_change','amenities_change','plan_change'] },
        },
      },
    },
  },
]


// ─── Executors ──────────────────────────────────────────────
type Args = Record<string, any>

type Executor = (args: Args) => Promise<ToolCallResult>

export const TOOL_EXECUTORS: Record<string, Executor> = {
  search_projects:        execSearchProjects,
  compare_projects:       execCompareProjects,
  find_similar_projects:  execFindSimilar,
  compute_irr:            execComputeIrr,
  recent_updates:         execRecentUpdates,
}


function clampLimit(value: unknown, fallback = 10, max = 25): number {
  const n = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback
  return Math.max(1, Math.min(n, max))
}


async function execSearchProjects(args: Args): Promise<ToolCallResult> {
  // Cast: `city` and `project_updates` aren't in database.types.ts until the
  // new migrations apply and types are regenerated.
  const supabase = createServiceClient() as any
  const limit = clampLimit(args.limit)
  const sortBy = ['score','min_price','current_psf','handover_date'].includes(args.sort_by) ? args.sort_by : 'score'
  const sortColumn = sortBy === 'handover_date' ? 'current_handover_date' : sortBy

  let q = supabase
    .from('projects')
    .select('name, slug, area, city, status, total_units, units_sold, sellthrough_pct, current_psf, min_price, max_price, score, current_handover_date, developer:developer_id(name, slug)')
    .in('status', ['active','pre_launch'])

  if (args.city)            q = q.ilike('city', `${args.city}%`)
  if (args.area)            q = q.ilike('area', `%${args.area}%`)
  if (Number.isFinite(args.min_price_aed)) q = q.gte('min_price', Math.floor(args.min_price_aed))
  if (Number.isFinite(args.max_price_aed)) q = q.lte('min_price', Math.floor(args.max_price_aed))
  if (Array.isArray(args.unit_types) && args.unit_types.length > 0) q = q.overlaps('unit_types', args.unit_types)
  if (args.handover_before) q = q.lte('current_handover_date', String(args.handover_before))
  if (args.handover_after)  q = q.gte('current_handover_date', String(args.handover_after))
  if (Number.isFinite(args.min_score)) q = q.gte('score', Math.floor(args.min_score))
  if (args.developer_slug)  q = q.eq('developer.slug', String(args.developer_slug))

  const { data, error } = await q.order(sortColumn, { ascending: sortBy === 'min_price', nullsFirst: false }).limit(limit)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { count: (data ?? []).length, projects: data ?? [] } }
}


async function execCompareProjects(args: Args): Promise<ToolCallResult> {
  const slugs = Array.isArray(args.slugs) ? args.slugs.slice(0, 5).map(String) : []
  if (slugs.length < 1) return { ok: false, error: 'Need at least one slug.' }
  const supabase = createServiceClient() as any
  const { data, error } = await supabase
    .from('projects')
    .select('name, slug, area, city, total_units, units_sold, sellthrough_pct, current_psf, launch_psf, min_price, max_price, score, current_handover_date, handover_status, developer:developer_id(name)')
    .in('slug', slugs)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { projects: data ?? [] } }
}


async function execFindSimilar(args: Args): Promise<ToolCallResult> {
  const slug = String(args.slug || '').trim()
  if (!slug) return { ok: false, error: 'slug required' }
  const limit = clampLimit(args.limit, 5, 15)

  const supabase = createServiceClient() as any
  const { data: seedRow } = await supabase
    .from('projects')
    .select('id, area, city, min_price, score, description')
    .eq('slug', slug).maybeSingle()
  if (!seedRow) return { ok: false, error: 'project not found' }

  // Same area + similar price band + similar score band, excluding the seed.
  const priceBandMin = (seedRow.min_price ?? 0) * 0.7
  const priceBandMax = (seedRow.min_price ?? 0) * 1.3
  let q = supabase
    .from('projects')
    .select('name, slug, area, city, min_price, current_psf, score, current_handover_date, developer:developer_id(name)')
    .neq('id', seedRow.id)
    .in('status', ['active','pre_launch'])
    .ilike('area', `%${seedRow.area ?? ''}%`)
  if (priceBandMin > 0) q = q.gte('min_price', Math.floor(priceBandMin))
  if (priceBandMax > 0) q = q.lte('min_price', Math.floor(priceBandMax))

  const { data: bySql, error } = await q.order('score', { ascending: false, nullsFirst: false }).limit(limit)
  if (error) return { ok: false, error: error.message }

  // Optional vector layer: if we have an embedding deployment + seed description,
  // surface the top-3 brochure chunks closest to the seed to enrich the answer.
  let nearestDocs: any[] = []
  if (azureEmbeddingsConfigured() && seedRow.description) {
    try {
      const v = await azureEmbed(seedRow.description.slice(0, 4000))
      const { data: hits } = await supabase.rpc('search_document_chunks', {
        query_embedding: v,
        match_count: 3,
        similarity_threshold: 0.3,
      })
      nearestDocs = hits ?? []
    } catch { /* best-effort */ }
  }
  return { ok: true, data: { projects: bySql ?? [], nearest_documents: nearestDocs } }
}


async function execComputeIrr(args: Args): Promise<ToolCallResult> {
  const slug = String(args.slug || '').trim()
  const exitPsf = Number(args.exit_psf_aed)
  const holdYears = Number(args.hold_years)
  const areaSqft = Number.isFinite(Number(args.area_sqft)) ? Number(args.area_sqft) : 800
  if (!slug || !Number.isFinite(exitPsf) || !Number.isFinite(holdYears)) {
    return { ok: false, error: 'slug, exit_psf_aed, hold_years all required' }
  }

  const supabase = createServiceClient() as any
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slug, min_price, current_psf, launch_psf')
    .eq('slug', slug).maybeSingle()
  if (!project) return { ok: false, error: 'project not found' }

  const { data: plans } = await supabase
    .from('payment_plans')
    .select('id, name, down_payment_pct, construction_pct, handover_pct, post_handover_pct, post_handover_months')
    .eq('project_id', project.id)
    .order('down_payment_pct', { ascending: true })
    .limit(1)

  const plan = plans?.[0] ?? {
    id: 'default',
    name: 'Standard 20/50/30',
    down_payment_pct: 20,
    construction_pct: 50,
    handover_pct: 30,
    post_handover_pct: 0,
    post_handover_months: 0,
  }

  const inputs: IrrInputs = {
    unit_price_aed: project.min_price ?? 1_000_000,
    area_sqft: areaSqft,
    exit_psf_aed: exitPsf,
    hold_years: holdYears,
    payment_plan: plan,
  }
  const result = calculateIrr(inputs)
  return {
    ok: true,
    data: {
      project: { name: project.name, slug: project.slug, min_price: project.min_price, current_psf: project.current_psf },
      assumptions: { exit_psf_aed: exitPsf, hold_years: holdYears, area_sqft: areaSqft, payment_plan: plan },
      result,
    },
  }
}


async function execRecentUpdates(args: Args): Promise<ToolCallResult> {
  const limit = clampLimit(args.limit, 10, 25)
  const supabase = createServiceClient() as any
  if (args.change_type) {
    const { data, error } = await supabase
      .from('project_updates')
      .select('change_type, field, before_value, after_value, delta_pct, detected_at, project:project_id(name, slug)')
      .eq('change_type', String(args.change_type))
      .order('detected_at', { ascending: false })
      .limit(limit)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { updates: data ?? [] } }
  }
  const { data, error } = await supabase.rpc('recent_project_updates', { limit_count: limit })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { updates: data ?? [] } }
}
