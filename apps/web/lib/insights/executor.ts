// apps/web/lib/insights/executor.ts
// Executes a validated QueryPlan against Supabase.
//
// Strategy: pull the rows the plan describes via the Supabase query builder
// (filters + ordering + limit translate cleanly), then handle group_by /
// aggregations in JS. Our dataset is small (<2K projects, <10K updates) so
// in-memory aggregation is fast AND we avoid the entire SQL injection
// surface — the LLM never gets to write SQL that touches the DB.

import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { tableByName } from './schema'
import type { QueryPlan } from './plan'

type Row = Record<string, any>

export interface ExecutionResult {
  columns: string[]
  rows:    Array<Array<string | number | boolean | null>>
  /** Server-computed truths the model can quote when summarising. */
  totals: { rowCount: number; truncated: boolean }
}

const FETCH_CAP = 5_000   // never load more than this from Supabase, regardless of plan.limit

export async function executePlan(plan: QueryPlan): Promise<ExecutionResult> {
  const supabase = createServiceClient() as any
  const table = tableByName(plan.table)
  if (!table) throw new Error(`Unknown table ${plan.table}`)

  const selectClause = buildSelectClause(plan, table)
  let q = supabase.from(plan.table).select(selectClause)

  for (const f of plan.filters) {
    q = applyFilter(q, f)
  }

  // For aggregations / group-by we need to load enough rows to aggregate
  // accurately, so cap at FETCH_CAP. For non-aggregated queries we load
  // exactly the requested page after the LLM's order_by.
  const fetchLimit = (plan.aggregations.length > 0 || plan.group_by.length > 0)
    ? FETCH_CAP
    : Math.min(plan.limit, FETCH_CAP)

  // Apply order_by only if the column is a base column (not an aggregation alias) AND
  // we're not aggregating. Otherwise we'll sort post-aggregation in JS.
  if (plan.aggregations.length === 0 && plan.group_by.length === 0) {
    for (const o of plan.order_by) {
      if (!o.column.includes('.')) q = q.order(o.column, { ascending: o.direction === 'asc', nullsFirst: false })
    }
  }
  q = q.limit(fetchLimit)

  const { data, error } = await q
  if (error) throw new Error(`Supabase query failed: ${error.message}`)

  const flat: Row[] = (data ?? []).map(flattenRow)

  // No grouping/aggregation → return rows as-is (already filtered + ordered + limited).
  if (plan.group_by.length === 0 && plan.aggregations.length === 0) {
    const cols = pickColumns(plan)
    return materialise(flat, cols, plan)
  }

  // Group + aggregate in memory.
  const aggregated = aggregate(flat, plan)
  // Order over the aggregated set (alias-aware).
  const ordered = orderRows(aggregated, plan)
  const truncated = ordered.length > plan.limit
  const trimmed = ordered.slice(0, plan.limit)
  const cols = [...plan.group_by, ...plan.aggregations.map(a => a.alias)]
  return {
    columns: cols,
    rows: trimmed.map(r => cols.map(c => normaliseCell(r[c]))),
    totals: { rowCount: ordered.length, truncated },
  }
}

// ─── Supabase query builder helpers ─────────────────────────

function buildSelectClause(plan: QueryPlan, table: { joins?: Array<{ name: string; target: string; expose: string[] }> }): string {
  // Always pull every column the plan references at any level so we can flatten
  // join.col into top-level keys for in-memory grouping.
  const baseCols = new Set<string>()
  const joinCols = new Map<string, Set<string>>()
  // Aggregation aliases ("active_projects", "avg_sellthrough") look like bare
  // column refs but only exist post-aggregation in JS. Never send them to
  // PostgREST or the query crashes with "column ... does not exist".
  const aggAliases = new Set(plan.aggregations.map(a => a.alias))

  const note = (ref: string) => {
    if (ref === '*' || !ref)        return
    if (aggAliases.has(ref))        return    // alias, not a column
    if (ref.includes('.')) {
      const [j, c] = ref.split('.')
      if (!joinCols.has(j)) joinCols.set(j, new Set())
      joinCols.get(j)!.add(c)
    } else {
      baseCols.add(ref)
    }
  }
  plan.select.forEach(note)
  plan.filters.forEach(f => note(f.column))
  plan.group_by.forEach(note)
  plan.order_by.forEach(o => note(o.column))
  plan.aggregations.forEach(a => { if (a.column !== '*') note(a.column) })
  // Always include slug + name so links render.
  if ((table.joins ?? []).length === 0) {
    baseCols.add('name')
    baseCols.add('slug')
  }

  let clause = baseCols.size > 0 ? Array.from(baseCols).join(',') : '*'
  for (const [joinName, cols] of joinCols.entries()) {
    const joinDef = (table.joins ?? []).find(j => j.name === joinName)
    if (!joinDef) continue
    // postgrest embedded select: developer:developer_id(name,slug)
    const fkColumn = `${joinName}_id`
    clause += `,${joinName}:${fkColumn}(${Array.from(cols).join(',')})`
  }
  return clause
}

function applyFilter(q: any, f: { column: string; op: string; value?: unknown }): any {
  const col = f.column.replace(/\./g, '.')   // postgrest accepts "join.col" path filters
  switch (f.op) {
    case 'eq':          return q.eq(col, f.value)
    case 'neq':         return q.neq(col, f.value)
    case 'gt':          return q.gt(col, f.value)
    case 'gte':         return q.gte(col, f.value)
    case 'lt':          return q.lt(col, f.value)
    case 'lte':         return q.lte(col, f.value)
    case 'ilike':       return q.ilike(col, String(f.value).includes('%') ? f.value : `%${f.value}%`)
    case 'in':          return q.in(col, Array.isArray(f.value) ? f.value : [f.value])
    case 'is_null':     return q.is(col, null)
    case 'is_not_null': return q.not(col, 'is', null)
    default:            return q
  }
}

// ─── Row processing ─────────────────────────────────────────

function flattenRow(row: Row): Row {
  // Postgrest embeds joins as nested objects: { name, developer: { name, tier } }
  // Flatten "developer.name" → "developer.name" key so grouping/aggregation
  // works uniformly with the LLM's column refs.
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Row)) {
        out[`${k}.${k2}`] = v2
      }
    } else {
      out[k] = v
    }
  }
  return out
}

function pickColumns(plan: QueryPlan): string[] {
  if (plan.select.length > 0) return plan.select
  // Sensible defaults per table.
  if (plan.table === 'projects')        return ['name','area','city','score','min_price','current_psf','sellthrough_pct','current_handover_date']
  if (plan.table === 'developers')      return ['name','tier','developer_score','total_projects_count','active_projects','hq_location']
  if (plan.table === 'project_updates') return ['change_type','field','before_value','after_value','delta_pct','detected_at','project.name']
  return []
}

function materialise(rows: Row[], cols: string[], plan: QueryPlan): ExecutionResult {
  // Apply order_by in JS for join-paths the SQL builder skipped.
  const ordered = orderRows(rows, plan)
  const trimmed = ordered.slice(0, plan.limit)
  return {
    columns: cols,
    rows: trimmed.map(r => cols.map(c => normaliseCell(r[c]))),
    totals: { rowCount: ordered.length, truncated: ordered.length > plan.limit },
  }
}

function aggregate(rows: Row[], plan: QueryPlan): Row[] {
  const buckets = new Map<string, { keyVals: Row; rows: Row[] }>()
  const groupCols = plan.group_by.length > 0 ? plan.group_by : ['__total__']

  for (const r of rows) {
    const keyVals: Row = {}
    if (plan.group_by.length === 0) {
      keyVals.__total__ = 'all'
    } else {
      for (const g of plan.group_by) keyVals[g] = r[g] ?? null
    }
    const key = groupCols.map(g => String(keyVals[g] ?? '∅')).join('|')
    const bucket = buckets.get(key)
    if (bucket) bucket.rows.push(r)
    else buckets.set(key, { keyVals, rows: [r] })
  }

  const out: Row[] = []
  for (const { keyVals, rows: bucketRows } of buckets.values()) {
    const aggValues: Row = { ...keyVals }
    for (const a of plan.aggregations) {
      const vals = a.column === '*'
        ? bucketRows.map(() => 1)
        : bucketRows.map(r => r[a.column]).filter(v => v != null && (typeof v === 'number' || !Number.isNaN(Number(v)))).map(Number)
      switch (a.fn) {
        case 'count': aggValues[a.alias] = a.column === '*' ? bucketRows.length : vals.length;                  break
        case 'sum':   aggValues[a.alias] = vals.reduce((s, v) => s + v, 0);                                       break
        case 'avg':   aggValues[a.alias] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null; break
        case 'min':   aggValues[a.alias] = vals.length > 0 ? Math.min(...vals) : null;                            break
        case 'max':   aggValues[a.alias] = vals.length > 0 ? Math.max(...vals) : null;                            break
      }
      // Round averages to 1 decimal for cleaner display.
      if (a.fn === 'avg' && typeof aggValues[a.alias] === 'number') {
        aggValues[a.alias] = Math.round(aggValues[a.alias] * 10) / 10
      }
    }
    out.push(aggValues)
  }
  return out
}

function orderRows(rows: Row[], plan: QueryPlan): Row[] {
  if (plan.order_by.length === 0) return rows
  const sorted = [...rows]
  sorted.sort((a, b) => {
    for (const o of plan.order_by) {
      const av = a[o.column]
      const bv = b[o.column]
      const cmp = compareValues(av, bv)
      if (cmp !== 0) return o.direction === 'asc' ? cmp : -cmp
    }
    return 0
  })
  return sorted
}

function compareValues(a: any, b: any): number {
  if (a == null && b == null) return 0
  if (a == null) return 1   // nulls last on asc, first on desc (we flip via direction)
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function normaliseCell(v: unknown): string | number | boolean | null {
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  return JSON.stringify(v)
}
