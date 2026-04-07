// OffplanIQ — Project Scoring Algorithm
// 
// THE SCORE IS THE PRODUCT.
// Every subscriber decision, alert, and digest is built on this number.
// Keep it simple, transparent, and explainable to investors.
//
// Score: 0–100 integer
// Breakdown: 4 weighted components
//
// ┌─────────────────────────────────────────────────┐
// │  Component          Weight   Signal               │
// │  ─────────────────────────────────────────────── │
// │  Sell-through        40pts   Demand proof         │
// │  PSF delta (6m)      30pts   Price momentum       │
// │  Developer score     20pts   Execution trust      │
// │  Handover track      10pts   Delivery risk        │
// └─────────────────────────────────────────────────┘

import type { Project, PsfDataPoint, ScoreBreakdown } from '@offplaniq/shared'

// ─────────────────────────────────────────────
// COMPONENT 1: Sell-through (0–40 pts)
// How much of the project has sold = demand signal
// ─────────────────────────────────────────────
export function scoreSellthrough(sellthrough_pct: number): number {
  // Linear: 0% sold = 0pts, 100% sold = 40pts
  // But we cap momentum — 90%+ is near sellout, score 40
  if (sellthrough_pct >= 90) return 40
  if (sellthrough_pct >= 75) return 36
  if (sellthrough_pct >= 60) return 30
  if (sellthrough_pct >= 45) return 24
  if (sellthrough_pct >= 30) return 16
  if (sellthrough_pct >= 15) return 10
  return Math.floor((sellthrough_pct / 15) * 10)
}

// ─────────────────────────────────────────────
// COMPONENT 2: PSF delta over 6 months (0–30 pts)
// Rising PSF = appreciation momentum = good investment signal
// ─────────────────────────────────────────────
export function scorePsfDelta(psfHistory: PsfDataPoint[]): number {
  if (psfHistory.length < 2) return 15  // no data = neutral score

  const sorted = [...psfHistory].sort(
    (a, b) => new Date(a.recorded_date).getTime() - new Date(b.recorded_date).getTime()
  )

  // Get 6-month-ago PSF (or earliest available)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const historical = sorted.filter(p => new Date(p.recorded_date) <= sixMonthsAgo)
  const basePsf = historical.length > 0
    ? historical[historical.length - 1].psf
    : sorted[0].psf

  const latestPsf = sorted[sorted.length - 1].psf
  const deltaPct = ((latestPsf - basePsf) / basePsf) * 100

  // Scoring table
  if (deltaPct >= 20)  return 30
  if (deltaPct >= 15)  return 27
  if (deltaPct >= 10)  return 24
  if (deltaPct >= 7)   return 21
  if (deltaPct >= 5)   return 18
  if (deltaPct >= 3)   return 15
  if (deltaPct >= 0)   return 12
  if (deltaPct >= -3)  return 8
  if (deltaPct >= -7)  return 4
  return 0  // > -7% decline = 0pts
}

// ─────────────────────────────────────────────
// COMPONENT 3: Developer score contribution (0–20 pts)
// Developer's historical performance reduces/adds confidence
// ─────────────────────────────────────────────
export function scoreDeveloper(developerScore: number | null): number {
  if (developerScore === null) return 10  // unknown = neutral
  // Developer score is 0-100, map to 0-20
  return Math.round((developerScore / 100) * 20)
}

// ─────────────────────────────────────────────
// COMPONENT 4: Handover track record (0–10 pts)
// Is this project on time? Delays kill investor ROI.
// ─────────────────────────────────────────────
export function scoreHandover(
  handoverStatus: Project['handover_status'],
  delayDays: number
): number {
  switch (handoverStatus) {
    case 'on_track':  return 10
    case 'completed': return 10
    case 'at_risk':   return 6
    case 'delayed':
      if (delayDays <= 90)  return 4
      if (delayDays <= 180) return 2
      return 0
    default: return 5
  }
}

// ─────────────────────────────────────────────
// MASTER SCORE CALCULATOR
// Call this after each scraper run per project
// ─────────────────────────────────────────────
export function calculateProjectScore(
  project: Pick<Project, 'sellthrough_pct' | 'handover_status' | 'handover_delay_days'>,
  psfHistory: PsfDataPoint[],
  developerScore: number | null
): ScoreBreakdown {
  const sellthrough = scoreSellthrough(project.sellthrough_pct)
  const psf_delta   = scorePsfDelta(psfHistory)
  const developer   = scoreDeveloper(developerScore)
  const handover    = scoreHandover(project.handover_status, project.handover_delay_days)
  const total       = sellthrough + psf_delta + developer + handover

  return { sellthrough, psf_delta, developer, handover, total }
}

// ─────────────────────────────────────────────
// SCORE LABEL HELPERS (for UI display)
// ─────────────────────────────────────────────
export type ScoreLabel = 'excellent' | 'good' | 'watch' | 'caution' | 'avoid'

export function getScoreLabel(score: number): ScoreLabel {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 55) return 'watch'
  if (score >= 40) return 'caution'
  return 'avoid'
}

export function getScoreColor(score: number): string {
  const label = getScoreLabel(score)
  const colors: Record<ScoreLabel, string> = {
    excellent: 'text-green-700 bg-green-50',
    good:      'text-green-600 bg-green-50',
    watch:     'text-amber-700 bg-amber-50',
    caution:   'text-orange-700 bg-orange-50',
    avoid:     'text-red-700 bg-red-50',
  }
  return colors[label]
}
