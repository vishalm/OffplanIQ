import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatAed,
  formatPsf,
  formatPct,
  formatHandoverDate,
  timeAgo,
  psfDeltaPct,
  sellthroughPct,
  clamp,
  toSlug,
  fuzzyMatchBuilding,
  daysAgo,
  today,
  daysBetween,
} from '@offplaniq/shared'

// ─────────────────────────────────────────────
// formatAed
// ─────────────────────────────────────────────
describe('formatAed', () => {
  it('formats millions with 2 decimals', () => {
    expect(formatAed(1_500_000)).toBe('AED 1.50M')
    expect(formatAed(2_345_678)).toBe('AED 2.35M')
    expect(formatAed(1_000_000)).toBe('AED 1.00M')
    expect(formatAed(10_000_000)).toBe('AED 10.00M')
  })

  it('formats thousands with K suffix', () => {
    expect(formatAed(750_000)).toBe('AED 750K')
    expect(formatAed(1_000)).toBe('AED 1K')
    expect(formatAed(999_999)).toBe('AED 1000K')
  })

  it('formats small amounts with locale', () => {
    const result = formatAed(500)
    expect(result).toContain('AED')
    expect(result).toContain('500')
  })

  it('handles zero', () => {
    const result = formatAed(0)
    expect(result).toContain('AED')
  })
})

// ─────────────────────────────────────────────
// formatPsf
// ─────────────────────────────────────────────
describe('formatPsf', () => {
  it('formats PSF with /sqft suffix', () => {
    const result = formatPsf(2340)
    expect(result).toContain('AED')
    expect(result).toContain('/sqft')
    expect(result).toContain('2')
  })

  it('formats large PSF values', () => {
    const result = formatPsf(4500)
    expect(result).toContain('4')
    expect(result).toContain('/sqft')
  })
})

// ─────────────────────────────────────────────
// formatPct
// ─────────────────────────────────────────────
describe('formatPct', () => {
  it('adds + sign for positive', () => {
    expect(formatPct(12.4)).toBe('+12.4%')
  })

  it('no + sign for negative', () => {
    expect(formatPct(-5.3)).toBe('-5.3%')
  })

  it('no + sign for zero', () => {
    expect(formatPct(0)).toBe('0.0%')
  })

  it('respects decimal places', () => {
    expect(formatPct(12.456, 2)).toBe('+12.46%')
    expect(formatPct(12.456, 0)).toBe('+12%')
  })
})

// ─────────────────────────────────────────────
// formatHandoverDate
// ─────────────────────────────────────────────
describe('formatHandoverDate', () => {
  it('returns dash for null', () => {
    expect(formatHandoverDate(null)).toBe('—')
  })

  it('formats ISO date to month year', () => {
    const result = formatHandoverDate('2026-12-01')
    expect(result).toContain('Dec')
    expect(result).toContain('2026')
  })
})

// ─────────────────────────────────────────────
// timeAgo
// ─────────────────────────────────────────────
describe('timeAgo', () => {
  it('returns "just now" for very recent', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now')
  })

  it('returns minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(d)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    const d = new Date(Date.now() - 3 * 3_600_000).toISOString()
    expect(timeAgo(d)).toBe('3h ago')
  })

  it('returns days ago', () => {
    const d = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(timeAgo(d)).toBe('2d ago')
  })
})

// ─────────────────────────────────────────────
// psfDeltaPct
// ─────────────────────────────────────────────
describe('psfDeltaPct', () => {
  it('computes positive delta', () => {
    expect(psfDeltaPct(2200, 2000)).toBe(10.0)
  })

  it('computes negative delta', () => {
    expect(psfDeltaPct(1800, 2000)).toBe(-10.0)
  })

  it('returns 0 for zero previous', () => {
    expect(psfDeltaPct(2000, 0)).toBe(0)
  })

  it('returns 0 for equal values', () => {
    expect(psfDeltaPct(2000, 2000)).toBe(0)
  })
})

// ─────────────────────────────────────────────
// sellthroughPct
// ─────────────────────────────────────────────
describe('sellthroughPct', () => {
  it('computes percentage correctly', () => {
    expect(sellthroughPct(75, 100)).toBe(75)
    expect(sellthroughPct(150, 200)).toBe(75)
  })

  it('returns 0 for zero total units', () => {
    expect(sellthroughPct(50, 0)).toBe(0)
  })

  it('handles 100% sellthrough', () => {
    expect(sellthroughPct(100, 100)).toBe(100)
  })

  it('rounds to integer', () => {
    expect(sellthroughPct(1, 3)).toBe(33) // 33.33 → 33
  })
})

// ─────────────────────────────────────────────
// clamp
// ─────────────────────────────────────────────
describe('clamp', () => {
  it('clamps below minimum', () => {
    expect(clamp(-5, 0, 100)).toBe(0)
  })

  it('clamps above maximum', () => {
    expect(clamp(150, 0, 100)).toBe(100)
  })

  it('passes through values in range', () => {
    expect(clamp(50, 0, 100)).toBe(50)
  })

  it('handles edge values', () => {
    expect(clamp(0, 0, 100)).toBe(0)
    expect(clamp(100, 0, 100)).toBe(100)
  })
})

// ─────────────────────────────────────────────
// toSlug
// ─────────────────────────────────────────────
describe('toSlug', () => {
  it('converts to lowercase with hyphens', () => {
    expect(toSlug('Binghatti Skyrise')).toBe('binghatti-skyrise')
  })

  it('removes special characters', () => {
    expect(toSlug("Emaar's Creek @ Phase 2")).toBe('emaars-creek-phase-2')
  })

  it('handles multiple spaces', () => {
    expect(toSlug('Dubai   Hills  Estate')).toBe('dubai-hills-estate')
  })

  it('trims whitespace', () => {
    expect(toSlug('  Sobha Hartland  ')).toBe('sobha-hartland')
  })
})

// ─────────────────────────────────────────────
// fuzzyMatchBuilding
// ─────────────────────────────────────────────
describe('fuzzyMatchBuilding', () => {
  it('matches exact names', () => {
    expect(fuzzyMatchBuilding('Binghatti Skyrise', 'Binghatti Skyrise')).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(fuzzyMatchBuilding('BINGHATTI SKYRISE', 'binghatti skyrise')).toBe(true)
  })

  it('matches when one contains the other', () => {
    expect(fuzzyMatchBuilding('Binghatti Skyrise Tower', 'Binghatti Skyrise')).toBe(true)
    expect(fuzzyMatchBuilding('Binghatti Skyrise', 'Binghatti Skyrise Tower')).toBe(true)
  })

  it('matches on significant word overlap', () => {
    expect(fuzzyMatchBuilding('Binghatti Skyrise Tower A', 'Binghatti Skyrise')).toBe(true)
  })

  it('rejects clearly different buildings', () => {
    expect(fuzzyMatchBuilding('Emaar Creek Harbour', 'Sobha Hartland')).toBe(false)
  })

  it('ignores short words (≤2 chars)', () => {
    expect(fuzzyMatchBuilding('By Binghatti Skyrise', 'Binghatti Skyrise Tower')).toBe(true)
  })
})

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────
describe('daysAgo', () => {
  it('returns ISO date string', () => {
    const result = daysAgo(7)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('daysAgo(0) equals today()', () => {
    expect(daysAgo(0)).toBe(today())
  })
})

describe('today', () => {
  it('returns ISO date string for today', () => {
    const result = today()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result).toBe(new Date().toISOString().split('T')[0])
  })
})

describe('daysBetween', () => {
  it('computes positive difference', () => {
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7)
  })

  it('is absolute (order independent)', () => {
    expect(daysBetween('2026-01-08', '2026-01-01')).toBe(7)
  })

  it('returns 0 for same date', () => {
    expect(daysBetween('2026-04-07', '2026-04-07')).toBe(0)
  })
})
