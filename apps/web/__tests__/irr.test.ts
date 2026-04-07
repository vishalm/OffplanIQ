import { describe, it, expect } from 'vitest'
import {
  calculateIrr,
  comparePaymentPlans,
  buildSensitivityTable,
  formatAed,
  formatIrr,
} from '../lib/irr/calculator'
import type { PaymentPlan, IrrInputs } from '@offplaniq/shared'

const makePlan = (overrides: Partial<PaymentPlan> = {}): PaymentPlan => ({
  id: 'plan-1',
  project_id: 'proj-1',
  name: 'Standard 60/40',
  description: null,
  down_payment_pct: 20,
  construction_pct: 40,
  handover_pct: 40,
  post_handover_pct: 0,
  post_handover_months: 0,
  monthly_pct: 0,
  is_active: true,
  ...overrides,
})

// ─────────────────────────────────────────────
// calculateIrr
// ─────────────────────────────────────────────
describe('calculateIrr', () => {
  it('computes positive IRR when exit value > unit price', () => {
    const result = calculateIrr({
      unit_price_aed: 1_500_000,
      area_sqft: 750,
      exit_psf_aed: 2500, // exit value = 1,875,000
      hold_years: 3,
      payment_plan: makePlan(),
    })
    expect(result.exit_value).toBe(1_875_000)
    expect(result.net_gain).toBe(375_000)
    expect(result.estimated_irr_pct).toBeGreaterThan(0)
  })

  it('computes negative IRR when exit value < unit price', () => {
    const result = calculateIrr({
      unit_price_aed: 1_500_000,
      area_sqft: 750,
      exit_psf_aed: 1800, // exit = 1,350,000
      hold_years: 3,
      payment_plan: makePlan(),
    })
    expect(result.net_gain).toBeLessThan(0)
    expect(result.estimated_irr_pct).toBeLessThan(0)
  })

  it('uses minimum 10% cash at risk', () => {
    const lowDownPlan = makePlan({ down_payment_pct: 1, construction_pct: 1 })
    const result = calculateIrr({
      unit_price_aed: 1_000_000,
      area_sqft: 500,
      exit_psf_aed: 2400,
      hold_years: 3,
      payment_plan: lowDownPlan,
    })
    // cash_at_risk should be 10% (min), not 2%
    expect(result.total_invested).toBe(100_000)
  })

  it('lower down payment = higher IRR for same property', () => {
    const inputs = {
      unit_price_aed: 1_500_000,
      area_sqft: 750,
      exit_psf_aed: 2500,
      hold_years: 3,
    }
    const highDown = calculateIrr({ ...inputs, payment_plan: makePlan({ down_payment_pct: 40, construction_pct: 40 }) })
    const lowDown = calculateIrr({ ...inputs, payment_plan: makePlan({ down_payment_pct: 10, construction_pct: 20 }) })
    expect(lowDown.estimated_irr_pct).toBeGreaterThan(highDown.estimated_irr_pct)
  })

  it('longer hold = lower annualised IRR', () => {
    const base = {
      unit_price_aed: 1_500_000,
      area_sqft: 750,
      exit_psf_aed: 2500,
      payment_plan: makePlan(),
    }
    const short = calculateIrr({ ...base, hold_years: 2 })
    const long = calculateIrr({ ...base, hold_years: 5 })
    expect(short.estimated_irr_pct).toBeGreaterThan(long.estimated_irr_pct)
  })

  it('returns rounded values', () => {
    const result = calculateIrr({
      unit_price_aed: 1_234_567,
      area_sqft: 617,
      exit_psf_aed: 2345,
      hold_years: 3,
      payment_plan: makePlan(),
    })
    expect(result.total_invested).toBe(Math.round(result.total_invested))
    expect(result.exit_value).toBe(Math.round(result.exit_value))
    expect(result.net_gain).toBe(Math.round(result.net_gain))
    // IRR rounded to 1 decimal
    expect(result.estimated_irr_pct).toBe(Math.round(result.estimated_irr_pct * 10) / 10)
  })

  it('preserves plan metadata in result', () => {
    const plan = makePlan({ id: 'abc', name: 'Golden Plan' })
    const result = calculateIrr({
      unit_price_aed: 1_000_000,
      area_sqft: 500,
      exit_psf_aed: 2200,
      hold_years: 3,
      payment_plan: plan,
    })
    expect(result.plan_id).toBe('abc')
    expect(result.plan_name).toBe('Golden Plan')
    expect(result.hold_years).toBe(3)
  })
})

// ─────────────────────────────────────────────
// comparePaymentPlans
// ─────────────────────────────────────────────
describe('comparePaymentPlans', () => {
  it('sorts by IRR descending', () => {
    const plans = [
      makePlan({ id: 'a', name: 'High DP', down_payment_pct: 50, construction_pct: 30 }),
      makePlan({ id: 'b', name: 'Low DP', down_payment_pct: 10, construction_pct: 20 }),
      makePlan({ id: 'c', name: 'Mid DP', down_payment_pct: 25, construction_pct: 25 }),
    ]
    const results = comparePaymentPlans(plans, 1_500_000, 750, 2500, 3)
    expect(results[0].plan_id).toBe('b') // lowest down payment = highest IRR
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].estimated_irr_pct).toBeGreaterThanOrEqual(results[i].estimated_irr_pct)
    }
  })

  it('filters out inactive plans', () => {
    const plans = [
      makePlan({ id: 'active', is_active: true }),
      makePlan({ id: 'inactive', is_active: false }),
    ]
    const results = comparePaymentPlans(plans, 1_000_000, 500, 2200, 3)
    expect(results).toHaveLength(1)
    expect(results[0].plan_id).toBe('active')
  })

  it('returns empty array for no active plans', () => {
    const results = comparePaymentPlans([], 1_000_000, 500, 2200, 3)
    expect(results).toEqual([])
  })
})

// ─────────────────────────────────────────────
// buildSensitivityTable
// ─────────────────────────────────────────────
describe('buildSensitivityTable', () => {
  it('returns 8 scenarios', () => {
    const table = buildSensitivityTable(makePlan(), 1_500_000, 750, 2000)
    expect(table).toHaveLength(8)
  })

  it('has increasing exit PSF values', () => {
    const table = buildSensitivityTable(makePlan(), 1_500_000, 750, 2000)
    for (let i = 1; i < table.length; i++) {
      expect(table[i].exit_psf).toBeGreaterThan(table[i - 1].exit_psf)
    }
  })

  it('base case (0% delta) uses current PSF', () => {
    const table = buildSensitivityTable(makePlan(), 1_500_000, 750, 2000)
    const baseCase = table.find(row => row.exit_psf === 2000)
    expect(baseCase).toBeDefined()
  })

  it('higher exit PSF = higher IRR', () => {
    const table = buildSensitivityTable(makePlan(), 1_500_000, 750, 2000)
    for (let i = 1; i < table.length; i++) {
      expect(table[i].irr_pct).toBeGreaterThanOrEqual(table[i - 1].irr_pct)
    }
  })
})

// ─────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────
describe('formatAed (IRR module)', () => {
  it('formats millions', () => {
    expect(formatAed(1_500_000)).toBe('AED 1.50M')
    expect(formatAed(2_300_000)).toBe('AED 2.30M')
  })

  it('formats thousands', () => {
    expect(formatAed(750_000)).toBe('AED 750K')
  })

  it('formats small amounts', () => {
    expect(formatAed(500)).toContain('500')
  })
})

describe('formatIrr', () => {
  it('formats positive IRR with + sign', () => {
    expect(formatIrr(12.5)).toBe('+12.5% IRR (est.)')
  })

  it('formats negative IRR without + sign', () => {
    expect(formatIrr(-3.2)).toBe('-3.2% IRR (est.)')
  })

  it('formats zero', () => {
    expect(formatIrr(0)).toBe('+0.0% IRR (est.)')
  })
})
