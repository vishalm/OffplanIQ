import { describe, it, expect } from 'vitest'
import {
  scoreSellthrough,
  scorePsfDelta,
  scoreDeveloper,
  scoreHandover,
  calculateProjectScore,
  getScoreLabel,
  getScoreColor,
} from '../lib/scoring/algorithm'
import type { PsfDataPoint } from '@offplaniq/shared'

// ─────────────────────────────────────────────
// scoreSellthrough
// ─────────────────────────────────────────────
describe('scoreSellthrough', () => {
  it('returns 40 for 90%+ sell-through', () => {
    expect(scoreSellthrough(90)).toBe(40)
    expect(scoreSellthrough(100)).toBe(40)
    expect(scoreSellthrough(95)).toBe(40)
  })

  it('returns 36 for 75-89%', () => {
    expect(scoreSellthrough(75)).toBe(36)
    expect(scoreSellthrough(89)).toBe(36)
  })

  it('returns 30 for 60-74%', () => {
    expect(scoreSellthrough(60)).toBe(30)
    expect(scoreSellthrough(74)).toBe(30)
  })

  it('returns 24 for 45-59%', () => {
    expect(scoreSellthrough(45)).toBe(24)
    expect(scoreSellthrough(59)).toBe(24)
  })

  it('returns 16 for 30-44%', () => {
    expect(scoreSellthrough(30)).toBe(16)
    expect(scoreSellthrough(44)).toBe(16)
  })

  it('returns 10 for 15-29%', () => {
    expect(scoreSellthrough(15)).toBe(10)
    expect(scoreSellthrough(29)).toBe(10)
  })

  it('returns scaled score for 0-14%', () => {
    expect(scoreSellthrough(0)).toBe(0)
    expect(scoreSellthrough(7)).toBe(4) // floor(7/15 * 10) = 4
    expect(scoreSellthrough(14)).toBe(9) // floor(14/15 * 10) = 9
  })

  it('handles boundary at exactly 90', () => {
    expect(scoreSellthrough(89.9)).toBe(36) // < 90
  })
})

// ─────────────────────────────────────────────
// scorePsfDelta
// ─────────────────────────────────────────────
describe('scorePsfDelta', () => {
  const makePsfHistory = (entries: { daysAgo: number; psf: number }[]): PsfDataPoint[] =>
    entries.map((e, i) => {
      const d = new Date()
      d.setDate(d.getDate() - e.daysAgo)
      return {
        id: `psf-${i}`,
        project_id: 'proj-1',
        recorded_date: d.toISOString().split('T')[0],
        psf: e.psf,
        source: 'dld' as const,
        sample_size: 10,
      }
    })

  it('returns 15 (neutral) for fewer than 2 data points', () => {
    expect(scorePsfDelta([])).toBe(15)
    expect(scorePsfDelta(makePsfHistory([{ daysAgo: 10, psf: 2000 }]))).toBe(15)
  })

  it('scores 30 for +20% growth', () => {
    const history = makePsfHistory([
      { daysAgo: 200, psf: 1000 },
      { daysAgo: 1, psf: 1200 },
    ])
    expect(scorePsfDelta(history)).toBe(30)
  })

  it('scores 24 for +10% growth', () => {
    const history = makePsfHistory([
      { daysAgo: 200, psf: 1000 },
      { daysAgo: 1, psf: 1100 },
    ])
    expect(scorePsfDelta(history)).toBe(24)
  })

  it('scores 12 for 0% (flat)', () => {
    const history = makePsfHistory([
      { daysAgo: 200, psf: 1000 },
      { daysAgo: 1, psf: 1000 },
    ])
    expect(scorePsfDelta(history)).toBe(12)
  })

  it('scores 0 for severe decline (> -7%)', () => {
    const history = makePsfHistory([
      { daysAgo: 200, psf: 1000 },
      { daysAgo: 1, psf: 900 },
    ])
    expect(scorePsfDelta(history)).toBe(0)
  })

  it('uses earliest point if no data older than 6 months', () => {
    const history = makePsfHistory([
      { daysAgo: 90, psf: 1000 },
      { daysAgo: 1, psf: 1050 },
    ])
    // +5% → 18
    expect(scorePsfDelta(history)).toBe(18)
  })
})

// ─────────────────────────────────────────────
// scoreDeveloper
// ─────────────────────────────────────────────
describe('scoreDeveloper', () => {
  it('returns 10 (neutral) for null/unknown developer', () => {
    expect(scoreDeveloper(null)).toBe(10)
  })

  it('returns 20 for perfect score (100)', () => {
    expect(scoreDeveloper(100)).toBe(20)
  })

  it('returns 0 for zero developer score', () => {
    expect(scoreDeveloper(0)).toBe(0)
  })

  it('maps linearly: 50 → 10', () => {
    expect(scoreDeveloper(50)).toBe(10)
  })

  it('rounds correctly: 75 → 15', () => {
    expect(scoreDeveloper(75)).toBe(15)
  })
})

// ─────────────────────────────────────────────
// scoreHandover
// ─────────────────────────────────────────────
describe('scoreHandover', () => {
  it('returns 10 for on_track', () => {
    expect(scoreHandover('on_track', 0)).toBe(10)
  })

  it('returns 10 for completed', () => {
    expect(scoreHandover('completed', 0)).toBe(10)
  })

  it('returns 6 for at_risk', () => {
    expect(scoreHandover('at_risk', 0)).toBe(6)
  })

  it('returns 4 for delayed ≤90 days', () => {
    expect(scoreHandover('delayed', 30)).toBe(4)
    expect(scoreHandover('delayed', 90)).toBe(4)
  })

  it('returns 2 for delayed 91-180 days', () => {
    expect(scoreHandover('delayed', 91)).toBe(2)
    expect(scoreHandover('delayed', 180)).toBe(2)
  })

  it('returns 0 for delayed >180 days', () => {
    expect(scoreHandover('delayed', 181)).toBe(0)
    expect(scoreHandover('delayed', 365)).toBe(0)
  })

  it('returns 5 for unknown status', () => {
    expect(scoreHandover('unknown' as any, 0)).toBe(5)
  })
})

// ─────────────────────────────────────────────
// calculateProjectScore (integration)
// ─────────────────────────────────────────────
describe('calculateProjectScore', () => {
  it('computes a full breakdown summing to total', () => {
    const project = { sellthrough_pct: 80, handover_status: 'on_track' as const, handover_delay_days: 0 }
    const result = calculateProjectScore(project, [], 85)
    expect(result.total).toBe(result.sellthrough + result.psf_delta + result.developer + result.handover)
  })

  it('scores a strong project highly', () => {
    const project = { sellthrough_pct: 92, handover_status: 'on_track' as const, handover_delay_days: 0 }
    const result = calculateProjectScore(project, [], 90)
    // sellthrough: 40, psf_delta: 15 (neutral), developer: 18, handover: 10 = 83
    expect(result.total).toBe(83)
  })

  it('scores a weak project low', () => {
    const project = { sellthrough_pct: 10, handover_status: 'delayed' as const, handover_delay_days: 200 }
    const result = calculateProjectScore(project, [], 20)
    // sellthrough: 6, psf_delta: 15 (neutral), developer: 4, handover: 0 = 25
    expect(result.total).toBe(25)
  })
})

// ─────────────────────────────────────────────
// getScoreLabel & getScoreColor
// ─────────────────────────────────────────────
describe('getScoreLabel', () => {
  it('returns correct labels at thresholds', () => {
    expect(getScoreLabel(100)).toBe('excellent')
    expect(getScoreLabel(85)).toBe('excellent')
    expect(getScoreLabel(84)).toBe('good')
    expect(getScoreLabel(70)).toBe('good')
    expect(getScoreLabel(69)).toBe('watch')
    expect(getScoreLabel(55)).toBe('watch')
    expect(getScoreLabel(54)).toBe('caution')
    expect(getScoreLabel(40)).toBe('caution')
    expect(getScoreLabel(39)).toBe('avoid')
    expect(getScoreLabel(0)).toBe('avoid')
  })
})

describe('getScoreColor', () => {
  it('returns color string containing the right color', () => {
    expect(getScoreColor(90)).toContain('green')
    expect(getScoreColor(75)).toContain('green')
    expect(getScoreColor(60)).toContain('amber')
    expect(getScoreColor(45)).toContain('orange')
    expect(getScoreColor(20)).toContain('red')
  })
})
