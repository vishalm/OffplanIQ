// apps/web/lib/facets.ts
// Algolia-style faceting helpers. Every filter on /search is derived from the
// data, not from a hardcoded list. Add a new attribute and a facet appears
// automatically.

export type FilterOption = { value: string; label: string; count: number }

/** Count distinct string values, return sorted-by-count options. */
export function stringFacet<T extends Record<string, any>>(
  rows: T[],
  pick: (row: T) => string | null | undefined,
): FilterOption[] {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const v = pick(r)
    if (v == null || v === '') continue
    counts[v] = (counts[v] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count)
}

/** Count values inside an array column (e.g. unit_types: ['1br','2br']). */
export function arrayFacet<T extends Record<string, any>>(
  rows: T[],
  pick: (row: T) => string[] | null | undefined,
): FilterOption[] {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const arr = pick(r)
    if (!arr) continue
    for (const v of arr) {
      if (v == null || v === '') continue
      counts[v] = (counts[v] ?? 0) + 1
    }
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, label: humanizeUnitType(value), count }))
    .sort((a, b) => b.count - a.count)
}

function humanizeUnitType(v: string): string {
  if (v === 'studio')    return 'Studio'
  if (/^\d+br$/i.test(v)) return v.replace(/br/i, ' BR').toUpperCase()
  return v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Auto-bucket numeric values into N range filters using quantiles.
 * Used for price / PSF / score so users don't see empty buckets.
 *
 * Returns ranges as `{ value: "lo-hi", label: "1.2M – 2.4M", count }`.
 * Always 4 buckets when there's enough variance; degrades to fewer for thin data.
 */
export function numericRangeFacet<T extends Record<string, any>>(
  rows: T[],
  pick: (row: T) => number | null | undefined,
  format: (n: number) => string,
  bucketCount = 4,
): FilterOption[] {
  const values = rows
    .map(pick)
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b)

  if (values.length === 0) return []
  if (values.length < bucketCount * 2) {
    // Not enough data to make N buckets meaningful — emit a single "any" range.
    return [{
      value: `${values[0]}-${values[values.length - 1]}`,
      label: `${format(values[0])} – ${format(values[values.length - 1])}`,
      count: values.length,
    }]
  }

  const edges: number[] = [values[0]]
  for (let i = 1; i < bucketCount; i++) {
    const idx = Math.floor((i / bucketCount) * values.length)
    edges.push(values[idx])
  }
  edges.push(values[values.length - 1])

  // Dedupe consecutive equal edges to avoid 0-width buckets.
  const dedup = edges.filter((v, i) => i === 0 || v !== edges[i - 1])

  const buckets: FilterOption[] = []
  for (let i = 0; i < dedup.length - 1; i++) {
    const lo = dedup[i]
    const hi = dedup[i + 1]
    const inclusiveHi = i === dedup.length - 2 ? hi : hi - 1
    const count = values.filter(v => v >= lo && v <= inclusiveHi).length
    if (count === 0) continue
    buckets.push({
      value: `${lo}-${inclusiveHi}`,
      label: `${format(lo)} – ${format(hi)}`,
      count,
    })
  }
  return buckets
}

/** Apply all active filters to a row set. Used for both the table and for
 *  computing faceted counts (each facet is computed against rows filtered by
 *  *every other* active filter — the Algolia "selected disjunctive" pattern). */
export type ActiveFilters = {
  city?: string
  area?: string
  developer?: string
  status?: string          // handover_status
  unit_type?: string
  price?: string           // "lo-hi"
  psf?: string             // "lo-hi"
  minScore?: string        // "55", "70", "85", or "0" (means <55)
  q?: string               // free-text
}

function inRange(val: number | null | undefined, range: string | undefined): boolean {
  if (!range) return true
  if (val == null) return false
  const [lo, hi] = range.split('-').map(Number)
  return val >= lo && val <= hi
}

function matchesScoreBand(score: number | null | undefined, band: string | undefined): boolean {
  if (!band) return true
  if (score == null) return false
  const min = parseInt(band, 10)
  return min === 0 ? score < 55 : score >= min
}

export function applyFilters<T extends Record<string, any>>(
  rows: T[],
  f: ActiveFilters,
  resolveCity: (row: T) => string,
): T[] {
  let out = rows
  if (f.city)        out = out.filter(p => resolveCity(p) === f.city)
  if (f.area)        out = out.filter(p => p.area === f.area)
  if (f.developer)   out = out.filter(p => p.developer?.name === f.developer)
  if (f.status)      out = out.filter(p => p.handover_status === f.status)
  if (f.unit_type)   out = out.filter(p => Array.isArray(p.unit_types) && p.unit_types.includes(f.unit_type))
  if (f.price)       out = out.filter(p => inRange(p.min_price, f.price))
  if (f.psf)         out = out.filter(p => inRange(p.current_psf, f.psf))
  if (f.minScore)    out = out.filter(p => matchesScoreBand(p.score, f.minScore))
  if (f.q) {
    const q = f.q.toLowerCase()
    out = out.filter(p =>
      p.name?.toLowerCase().includes(q) || p.developer?.name?.toLowerCase().includes(q)
    )
  }
  return out
}

/** Compute counts for facet `key` against rows filtered by every OTHER active
 *  filter — so picking "Dubai" updates the developer counts but doesn't zero
 *  out the city facet itself. */
export function disjunctiveFacet<T extends Record<string, any>>(
  rows: T[],
  active: ActiveFilters,
  exclude: keyof ActiveFilters,
  resolveCity: (row: T) => string,
  pick: (row: T) => string | null | undefined,
  isArray = false,
): FilterOption[] {
  const minus: ActiveFilters = { ...active }
  delete minus[exclude]
  const filtered = applyFilters(rows, minus, resolveCity)
  return isArray
    ? arrayFacet(filtered, pick as any)
    : stringFacet(filtered, pick)
}

export function disjunctiveRangeFacet<T extends Record<string, any>>(
  rows: T[],
  active: ActiveFilters,
  exclude: keyof ActiveFilters,
  resolveCity: (row: T) => string,
  pick: (row: T) => number | null | undefined,
  format: (n: number) => string,
): FilterOption[] {
  const minus: ActiveFilters = { ...active }
  delete minus[exclude]
  const filtered = applyFilters(rows, minus, resolveCity)
  return numericRangeFacet(filtered, pick, format)
}
