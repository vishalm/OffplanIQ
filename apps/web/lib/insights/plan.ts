// apps/web/lib/insights/plan.ts
// QueryPlan: the strict structured representation the LLM emits and the
// executor consumes. Every field is validated server-side before any data
// is fetched — the LLM never gets to write SQL directly.

import { z } from 'zod'
import { ALLOWED_TABLES, tableByName } from './schema'

const FILTER_OPS = ['eq','neq','gt','gte','lt','lte','ilike','in','is_null','is_not_null'] as const
const AGG_FNS    = ['count','sum','avg','min','max'] as const
const CHART_HINTS = ['table','bar','line','kpi','pie','donut','heatmap','scatter'] as const

/** Reference to a column — either bare ("score") or via a join ("developer.tier_rank"). */
const ColumnRef = z.string().regex(/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i, {
  message: 'Column refs are <col> or <join>.<col>, lowercase identifiers only.',
})

const FilterSchema = z.object({
  column: ColumnRef,
  op:     z.enum(FILTER_OPS),
  value:  z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
})

const AggregationSchema = z.object({
  fn:     z.enum(AGG_FNS),
  column: z.union([ColumnRef, z.literal('*')]),
  alias:  z.string().regex(/^[a-z_][a-z0-9_]*$/i, { message: 'Alias must be a lowercase identifier.' }),
})

const OrderBySchema = z.object({
  column:    z.string().regex(/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i),
  direction: z.enum(['asc','desc']).default('desc'),
})

export const QueryPlanSchema = z.object({
  table:        z.string(),
  joins:        z.array(z.string()).optional().default([]),
  select:       z.array(ColumnRef).optional().default([]),
  filters:      z.array(FilterSchema).optional().default([]),
  group_by:     z.array(ColumnRef).optional().default([]),
  aggregations: z.array(AggregationSchema).optional().default([]),
  order_by:     z.array(OrderBySchema).optional().default([]),
  limit:        z.number().int().min(1).max(500).optional().default(100),
  chart_hint:   z.enum(CHART_HINTS).optional().default('table'),
  sql:          z.string().min(1),
  narrative:    z.string().min(1),
})

export type QueryPlan = z.infer<typeof QueryPlanSchema>

export interface PlanValidationError {
  field: string
  message: string
}

/**
 * Validate that every table/column referenced in the plan is on the allow-list.
 * Returns a list of issues; empty list means the plan is safe to execute.
 */
export function validatePlanReferences(plan: QueryPlan): PlanValidationError[] {
  const errors: PlanValidationError[] = []
  const baseTable = tableByName(plan.table)
  if (!baseTable) {
    errors.push({ field: 'table', message: `Unknown table "${plan.table}".` })
    return errors
  }

  const allowedJoins = new Set((baseTable.joins ?? []).map(j => j.name))
  for (const j of plan.joins) {
    if (!allowedJoins.has(j)) errors.push({ field: 'joins', message: `Join "${j}" is not declared on ${plan.table}.` })
  }

  const isKnownColumn = (ref: string): boolean => {
    if (ref === '*') return true
    if (!ref.includes('.')) {
      return baseTable.columns.some(c => c.name === ref)
    }
    const [joinName, col] = ref.split('.')
    const join = (baseTable.joins ?? []).find(j => j.name === joinName)
    if (!join) return false
    return join.expose.includes(col)
  }

  const checkRef = (ref: string, field: string) => {
    if (!isKnownColumn(ref)) errors.push({ field, message: `Unknown column "${ref}" on ${plan.table}.` })
  }

  for (const c of plan.select)            checkRef(c, 'select')
  for (const f of plan.filters)           checkRef(f.column, 'filters')
  for (const g of plan.group_by)          checkRef(g, 'group_by')
  for (const a of plan.aggregations) {
    if (a.column !== '*') checkRef(a.column, 'aggregations')
  }

  // Order-by may reference an aggregation alias OR a column.
  const aliases = new Set(plan.aggregations.map(a => a.alias))
  for (const o of plan.order_by) {
    if (!aliases.has(o.column) && !isKnownColumn(o.column)) {
      errors.push({ field: 'order_by', message: `Unknown column or alias "${o.column}".` })
    }
  }

  // If group_by is present, every selected column must either be in group_by or come from an aggregation.
  if (plan.group_by.length > 0 && plan.select.length > 0) {
    const groupSet = new Set(plan.group_by)
    for (const s of plan.select) {
      if (!groupSet.has(s)) {
        errors.push({ field: 'select', message: `Column "${s}" is selected but not grouped or aggregated.` })
      }
    }
  }

  return errors
}

/** Pretty-print a plan as SQL for display to the user. Never executed. */
export function planToSql(plan: QueryPlan): string {
  const selectExprs: string[] = []
  for (const c of plan.select) selectExprs.push(c)
  for (const a of plan.aggregations) selectExprs.push(`${a.fn.toUpperCase()}(${a.column}) AS ${a.alias}`)
  const select = selectExprs.length > 0 ? selectExprs.join(', ') : '*'

  const where = plan.filters.length > 0
    ? 'WHERE ' + plan.filters.map(f => filterToSql(f)).join(' AND ')
    : ''
  const groupBy = plan.group_by.length > 0 ? `GROUP BY ${plan.group_by.join(', ')}` : ''
  const orderBy = plan.order_by.length > 0
    ? 'ORDER BY ' + plan.order_by.map(o => `${o.column} ${o.direction.toUpperCase()}`).join(', ')
    : ''
  const limit = `LIMIT ${plan.limit}`
  return [`SELECT ${select}`, `FROM ${plan.table}`, where, groupBy, orderBy, limit].filter(Boolean).join('\n')
}

function filterToSql(f: { column: string; op: string; value?: unknown }): string {
  const col = f.column
  switch (f.op) {
    case 'eq':          return `${col} = ${quote(f.value)}`
    case 'neq':         return `${col} <> ${quote(f.value)}`
    case 'gt':          return `${col} > ${quote(f.value)}`
    case 'gte':         return `${col} >= ${quote(f.value)}`
    case 'lt':          return `${col} < ${quote(f.value)}`
    case 'lte':         return `${col} <= ${quote(f.value)}`
    case 'ilike':       return `${col} ILIKE ${quote(f.value)}`
    case 'in':          return `${col} IN (${Array.isArray(f.value) ? f.value.map(quote).join(', ') : quote(f.value)})`
    case 'is_null':     return `${col} IS NULL`
    case 'is_not_null': return `${col} IS NOT NULL`
    default:            return `/* unknown op ${f.op} */ TRUE`
  }
}

function quote(v: unknown): string {
  if (v == null) return 'NULL'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}
