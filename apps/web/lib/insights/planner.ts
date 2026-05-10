// apps/web/lib/insights/planner.ts
// Calls Azure OpenAI with the schema and a strict JSON contract to translate
// a natural-language question into a validated QueryPlan. Two passes:
//   1. JSON-mode call → raw plan
//   2. Zod parse + reference validation → safe plan
// If validation fails, we feed the errors back to the model for one repair
// attempt before giving up. This is the difference between "demo-grade
// text-to-SQL" and "actually works on hard questions."

import 'server-only'
import { azureChat, ChatMessage } from '@/lib/azure-openai'
import { schemaForPrompt } from './schema'
import { QueryPlan, QueryPlanSchema, validatePlanReferences } from './plan'

const SYSTEM = String.raw`You are OffplanIQ Insights, a query planner for UAE off-plan property data.

Your job: convert a user question into a STRICT JSON QueryPlan that our executor can run safely. You never write raw SQL the database executes — you write a plan, and we render an SQL string for human display.

CONTRACT (return JSON only, no prose):
{
  "table":        "<one of: projects | developers | project_updates>",
  "joins":        ["<join name>", ...],
  "select":       ["<col>" | "<join>.<col>", ...],
  "filters":      [{ "column": "<col|join.col>", "op": "eq|neq|gt|gte|lt|lte|ilike|in|is_null|is_not_null", "value": <string|number|boolean|array> }],
  "group_by":     ["<col|join.col>", ...],
  "aggregations": [{ "fn": "count|sum|avg|min|max", "column": "<col|*>", "alias": "<lowercase_id>" }],
  "order_by":     [{ "column": "<col|alias>", "direction": "asc|desc" }],
  "limit":        <integer 1..500>,
  "chart_hint":   "table|bar|line|kpi|pie|donut|heatmap|scatter",
  "sql":          "<SQL string for display>",
  "narrative":    "<1-sentence plain-English description of what this plan answers>"
}

RULES:
- Only reference tables and columns from the schema below. Anything else fails validation.
- "ilike" auto-wraps the value with % wildcards on both sides; do NOT add them yourself.
- When the user says "top X by Y" use order_by + limit, NOT a filter.
- When the user asks for averages, totals, or counts across a category, USE group_by + aggregations.
- For "how many", emit a single aggregation { fn: "count", column: "*", alias: "n" } and chart_hint "kpi".
- For comparisons across a categorical axis, use chart_hint "bar".
- For trends over time, group_by a date column truncated implicitly (we only support raw date grouping today; prefer table chart for time data).
- Default limit is 50 unless the user asks for more.
- For "active" projects, filter status with op="in" and value=["active","pre_launch"].
- Currency is always AED. Areas are sub-communities; cities are emirates.
- Do not use placeholders. Generate concrete values.
- Always populate "sql" with a readable SQL representation that matches the plan exactly.

CRITICAL FIELD-PLACEMENT RULES (these are the most-broken parts):
- "select" contains ONLY bare column refs ("score", "developer.tier"). NEVER put function calls (count(*), avg(x), sum(x)), aliases ("x AS y"), or aggregation expressions in "select".
- "select" must NOT include any column name that also appears in an "aggregations" alias — that produces duplicates.
- Aggregation aliases live in "aggregations[].alias", and they appear in the output AUTOMATICALLY in addition to "group_by" columns. So:
    GROUP BY developer.tier
    aggregations: count(*) AS active_projects, avg(sellthrough_pct) AS avg_sellthrough
    → set "select": []   (or omit the field entirely). The result columns will be developer.tier, active_projects, avg_sellthrough.
- To sort by an aggregation, reference its ALIAS in order_by: { "column": "active_projects", "direction": "desc" }. Do NOT write order_by: "count(*)".
- "joins" lists join NAMES, not column refs. Example: ["developer"], not ["developer.tier"].

EXAMPLE for "pie chart of cities vs property count":
{
  "table": "projects",
  "joins": [],
  "select": [],
  "filters": [{ "column": "city", "op": "is_not_null" }],
  "group_by": ["city"],
  "aggregations": [{ "fn": "count", "column": "*", "alias": "n" }],
  "order_by": [{ "column": "n", "direction": "desc" }],
  "limit": 50,
  "chart_hint": "pie",
  "sql": "SELECT city, COUNT(*) AS n FROM projects WHERE city IS NOT NULL GROUP BY city ORDER BY n DESC LIMIT 50",
  "narrative": "Number of projects per emirate."
}

EXAMPLE for "active projects per developer tier with average sell-through":
{
  "table": "projects",
  "joins": ["developer"],
  "select": [],
  "filters": [{ "column": "status", "op": "in", "value": ["active","pre_launch"] }],
  "group_by": ["developer.tier"],
  "aggregations": [
    { "fn": "count", "column": "*",                "alias": "active_projects" },
    { "fn": "avg",   "column": "sellthrough_pct",  "alias": "avg_sellthrough" }
  ],
  "order_by": [{ "column": "active_projects", "direction": "desc" }],
  "limit": 50,
  "chart_hint": "bar",
  "sql": "SELECT d.tier, COUNT(*) AS active_projects, AVG(p.sellthrough_pct) AS avg_sellthrough\\nFROM projects p JOIN developers d ON d.id = p.developer_id\\nWHERE p.status IN ('active','pre_launch')\\nGROUP BY d.tier\\nORDER BY active_projects DESC\\nLIMIT 50",
  "narrative": "Active project count and average sell-through grouped by developer tier."
}

SCHEMA:
${schemaForPrompt()}

Return ONLY the JSON object. No markdown fences, no explanation.`

export interface PlanningOutcome {
  plan?: QueryPlan
  raw?:  string
  error?: string
}

export async function planFromQuestion(question: string): Promise<PlanningOutcome> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user',   content: question.slice(0, 2000) },
  ]
  let raw = ''
  try {
    raw = await azureChat(messages, { response_format: 'json_object', max_completion_tokens: 1200 })
  } catch (err: any) {
    return { error: err?.message || 'planning_failed' }
  }
  const first = parsePlan(raw)
  if (first.plan) return first

  // One repair pass with the error feedback.
  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: 'assistant', content: raw },
    { role: 'user', content: `Your plan was rejected. Issues:\n${first.error}\n\nReturn a corrected JSON QueryPlan that obeys the schema. Same contract, JSON only.` },
  ]
  let raw2 = ''
  try {
    raw2 = await azureChat(repairMessages, { response_format: 'json_object', max_completion_tokens: 1200 })
  } catch (err: any) {
    return { raw, error: err?.message || 'planning_repair_failed' }
  }
  const second = parsePlan(raw2)
  if (second.plan) return { plan: second.plan, raw: raw2 }
  return { raw: raw2, error: second.error || 'plan_invalid' }
}

function parsePlan(raw: string): PlanningOutcome {
  let json: unknown
  try { json = JSON.parse(raw) } catch { return { raw, error: 'Model returned non-JSON.' } }

  // Permissive pre-pass: salvage common shapes the model loves to emit but
  // our strict ColumnRef regex would reject. Without this we'd fail valid
  // intent over surface syntax — text-to-SQL has to be forgiving.
  const cleaned = normaliseLooseShapes(json)

  const parsed = QueryPlanSchema.safeParse(cleaned)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n')
    return { raw, error: `Plan failed schema validation:\n${issues}` }
  }
  const refErrors = validatePlanReferences(parsed.data)
  if (refErrors.length > 0) {
    const issues = refErrors.map(e => `- ${e.field}: ${e.message}`).join('\n')
    return { raw, error: `Plan references unknown things:\n${issues}` }
  }
  return { plan: parsed.data, raw }
}

/**
 * Repair common LLM output drift before strict validation.
 *
 * Handles:
 *   - select: ["count(*)"]                       → aggregations: [{fn:'count',column:'*',alias:'n'}]
 *   - select: ["avg(score)"]                     → aggregations: [{fn:'avg',column:'score',alias:'avg_score'}]
 *   - select: ["x AS y"] / ["x as y"]            → select: ["x"]  (we ignore the alias for bare columns)
 *   - joins:  ["developer.tier"]                 → joins: ["developer"]  (the model confused refs with names)
 *   - order_by entry where column was "count(*)" → matches the aggregation we just hoisted
 *   - aggregations rows where column has an alias suffix → strip the suffix
 *
 * Returns a NEW object; never mutates the input.
 */

type AggregationLite = { fn: string; column: string; alias: string }

const AGG_RE     = /^(count|sum|avg|min|max)\s*\(\s*(\*|[a-z_][a-z0-9_.]*)\s*\)$/i
const ALIAS_RE   = /^([a-z_][a-z0-9_.]*)\s+as\s+([a-z_][a-z0-9_]*)$/i
const COL_AS_RE  = /^([a-z_][a-z0-9_.]*|\*)\s+as\s+([a-z_][a-z0-9_]*)$/i
// Mirrors plan.ts ColumnRef. Used to gate pre-pass output so we never push
// surface-junk through to Zod (where a single bad entry kills the plan).
const COL_REF_RE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i

function normaliseLooseShapes(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const obj = { ...(input as Record<string, unknown>) }

  obj.joins = normaliseJoins(obj.joins)

  const aggregations: AggregationLite[] = Array.isArray(obj.aggregations)
    ? (obj.aggregations as AggregationLite[]).map(a => ({ ...a }))
    : []

  const aliasMap = new Map<string, string>()
  if (Array.isArray(obj.select)) {
    obj.select = normaliseSelect(obj.select, obj.group_by, aggregations, aliasMap)
  }

  // group_by must be valid column refs. Drop anything that isn't — the LLM
  // sometimes emits "city name" or "by city" here.
  if (Array.isArray(obj.group_by)) {
    obj.group_by = (obj.group_by as unknown[])
      .filter((g): g is string => typeof g === 'string' && COL_REF_RE.test(g.trim()))
      .map(g => g.trim())
  }

  if (aggregations.length > 0) obj.aggregations = aggregations

  if (Array.isArray(obj.order_by)) {
    obj.order_by = normaliseOrderBy(obj.order_by, aliasMap, aggregations)
    if (aggregations.length > 0) obj.aggregations = aggregations
  }

  if (Array.isArray(obj.aggregations)) {
    obj.aggregations = (obj.aggregations as AggregationLite[]).map(repairAggregationRow)
  }

  return obj
}


function normaliseJoins(joins: unknown): unknown {
  if (!Array.isArray(joins)) return joins
  const seen = new Set<string>()
  const out: string[] = []
  for (const j of joins) {
    if (typeof j !== 'string') continue
    const head = j.split('.')[0]
    if (head && !seen.has(head)) { seen.add(head); out.push(head) }
  }
  return out
}


function normaliseSelect(
  raw: unknown,
  groupBy: unknown,
  aggregations: AggregationLite[],
  aliasMap: Map<string, string>,
): string[] {
  const cleaned: string[] = []
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue

    const aliased = ALIAS_RE.exec(trimmed)
    if (aliased) { cleaned.push(aliased[1]); continue }

    const fnMatch = AGG_RE.exec(trimmed)
    if (fnMatch) {
      const alias = hoistAggregation(fnMatch[1].toLowerCase(), fnMatch[2], aggregations)
      aliasMap.set(trimmed, alias)
      continue
    }

    // Fail-soft: only keep entries that are real column refs. Drop labels,
    // unparenthesised function names ("count"), or anything with spaces. A
    // dropped junk entry is far better than rejecting the whole plan.
    if (COL_REF_RE.test(trimmed)) cleaned.push(trimmed)
  }
  // Drop entries that:
  //   - duplicate a group_by column (already in the result by construction)
  //   - match an aggregation alias (alias only exists post-aggregate; sending
  //     it to PostgREST throws "column does not exist")
  const groupSet = new Set(Array.isArray(groupBy) ? (groupBy as string[]) : [])
  const aliasSet = new Set(aggregations.map(a => a.alias))
  return cleaned.filter(s => !groupSet.has(s) && !aliasSet.has(s))
}


function normaliseOrderBy(
  raw: unknown[],
  aliasMap: Map<string, string>,
  aggregations: AggregationLite[],
): unknown[] {
  const aliasNames = new Set(aggregations.map(a => a.alias))
  const out: unknown[] = []
  for (const o of raw) {
    if (!o || typeof o !== 'object' || typeof (o as any).column !== 'string') continue
    const colTrimmed = (o as any).column.trim()
    const mapped = aliasMap.get(colTrimmed)
    if (mapped) { out.push({ ...o, column: mapped }); continue }
    const fn = AGG_RE.exec(colTrimmed)
    if (fn) {
      const alias = hoistAggregation(fn[1].toLowerCase(), fn[2], aggregations)
      out.push({ ...o, column: alias })
      continue
    }
    // Drop entries whose column is junk (label, has spaces, etc.) — orderless
    // is better than a 422.
    if (aliasNames.has(colTrimmed) || COL_REF_RE.test(colTrimmed)) {
      out.push({ ...o, column: colTrimmed })
    }
  }
  return out
}


function repairAggregationRow(a: unknown): unknown {
  if (!a || typeof a !== 'object') return a
  const out: AggregationLite = { ...(a as AggregationLite) }
  if (typeof out.column === 'string') {
    const m = COL_AS_RE.exec(out.column.trim())
    if (m) {
      out.column = m[1]
      if (!out.alias) out.alias = m[2]
    }
  }
  if (!out.alias && typeof out.fn === 'string' && typeof out.column === 'string') {
    out.alias = autoAlias(out.fn, out.column, [])
  }
  return out
}


/** Push (fn, column) into `aggregations` with a fresh alias if not already there.
 *  Returns the alias to use (existing or newly minted). */
function hoistAggregation(fn: string, column: string, aggregations: AggregationLite[]): string {
  const existing = aggregations.find(a => a.fn === fn && a.column === column)
  if (existing) return existing.alias
  const alias = autoAlias(fn, column, aggregations)
  aggregations.push({ fn, column, alias })
  return alias
}


function autoAlias(fn: string, column: string, existing: Array<{ alias: string }>): string {
  const base = baseAlias(fn, column)
  const taken = new Set(existing.map(a => a.alias))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}


function baseAlias(fn: string, column: string): string {
  if (column === '*') {
    return fn === 'count' ? 'n' : fn
  }
  return `${fn}_${column.replaceAll('.', '_')}`
}
