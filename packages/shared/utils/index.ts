// packages/shared/utils/index.ts
// Pure utility functions — no external dependencies, no side effects.
// Safe to use in web app, edge functions, and scraper (via ts-node).

// ─────────────────────────────────────────────
// FORMATTING
// ─────────────────────────────────────────────

/** Format AED integer to display string: 1500000 → "AED 1.50M" */
export function formatAed(amount: number): string {
  if (amount >= 1_000_000) return `AED ${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 1_000)     return `AED ${Math.round(amount / 1_000)}K`
  return `AED ${amount.toLocaleString('en-AE')}`
}

/** Format PSF integer: 2340 → "AED 2,340/sqft" */
export function formatPsf(psf: number): string {
  return `AED ${psf.toLocaleString('en-AE')}/sqft`
}

/** Format percentage with sign: 12.4 → "+12.4%" */
export function formatPct(pct: number, decimals = 1): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(decimals)}%`
}

/** Format a date string to UAE locale: "2026-12-01" → "Dec 2026" */
export function formatHandoverDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString('en-AE', {
    month: 'short', year: 'numeric', timeZone: 'Asia/Dubai',
  })
}

/** Format a datetime to "2 hours ago", "3 days ago" etc. */
export function timeAgo(isoDatetime: string): string {
  const diff = Date.now() - new Date(isoDatetime).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (days > 0)  return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins > 0)  return `${mins}m ago`
  return 'just now'
}

// ─────────────────────────────────────────────
// MATHS
// ─────────────────────────────────────────────

/** PSF delta % between two values */
export function psfDeltaPct(current: number, previous: number): number {
  if (!previous) return 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

/** Sell-through % from units sold / total units */
export function sellthroughPct(unitsSold: number, totalUnits: number): number {
  if (!totalUnits) return 0
  return Math.round((unitsSold / totalUnits) * 100)
}

/** Clamp a number between min and max */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

// ─────────────────────────────────────────────
// STRINGS
// ─────────────────────────────────────────────

/** Convert a project name to a URL slug: "Binghatti Skyrise" → "binghatti-skyrise" */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** Fuzzy match a DLD building name to a project name (Levenshtein-free simple version) */
export function fuzzyMatchBuilding(dldBuilding: string, projectName: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, ' ')

  const a = normalize(dldBuilding)
  const b = normalize(projectName)

  // Exact match
  if (a === b) return true

  // One contains the other
  if (a.includes(b) || b.includes(a)) return true

  // First 3 significant words match
  const wordsA = a.split(' ').filter(w => w.length > 2).slice(0, 3)
  const wordsB = b.split(' ').filter(w => w.length > 2).slice(0, 3)
  const matches = wordsA.filter(w => wordsB.includes(w)).length
  return matches >= Math.min(2, Math.min(wordsA.length, wordsB.length))
}

// ─────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────

/** ISO date string for N days ago */
export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

/** ISO date string for today */
export function today(): string {
  return new Date().toISOString().split('T')[0]
}

/** Number of days between two ISO date strings */
export function daysBetween(a: string, b: string): number {
  return Math.abs(
    Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000)
  )
}
