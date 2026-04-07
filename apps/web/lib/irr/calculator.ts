// OffplanIQ — IRR Calculator
//
// THE MOST IMPORTANT FEATURE FOR CONVERSION.
// An investor managing a AED 1.5M purchase will pay AED 750/mo
// just to see this number update in real time.
//
// Approach: simplified IRR (not full XIRR) — good enough for off-plan
// Full XIRR would require exact cashflow dates, which we don't have.
// We use annualised ROI on down payment as a proxy. Clearly labelled as estimate.

import type { IrrInputs, IrrResult, PaymentPlan } from '@offplaniq/shared'

// ─────────────────────────────────────────────
// CORE IRR CALCULATION
// Returns estimated annualised return on cash invested
// ─────────────────────────────────────────────
export function calculateIrr(inputs: IrrInputs): IrrResult {
  const { unit_price_aed, area_sqft, exit_psf_aed, hold_years, payment_plan } = inputs

  // Exit value at target PSF
  const exit_value = area_sqft * exit_psf_aed

  // Total cash invested during construction (opportunity cost basis)
  // For IRR purposes: use down payment + construction payments as "invested"
  // Post-handover payments discounted — investor hasn't paid them yet
  const cash_at_risk_pct = (payment_plan.down_payment_pct + payment_plan.construction_pct) / 100
  const total_invested = unit_price_aed * Math.max(cash_at_risk_pct, 0.1) // min 10%

  const net_gain = exit_value - unit_price_aed
  const total_return_pct = net_gain / total_invested

  // Annualised: (1 + total_return)^(1/years) - 1
  const annualised_irr = (Math.pow(1 + total_return_pct, 1 / hold_years) - 1) * 100

  return {
    plan_id: payment_plan.id,
    plan_name: payment_plan.name,
    estimated_irr_pct: Math.round(annualised_irr * 10) / 10,
    total_invested: Math.round(total_invested),
    exit_value: Math.round(exit_value),
    net_gain: Math.round(net_gain),
    hold_years,
  }
}

// ─────────────────────────────────────────────
// COMPARE MULTIPLE PLANS
// Returns sorted results, best IRR first
// ─────────────────────────────────────────────
export function comparePaymentPlans(
  plans: PaymentPlan[],
  unit_price_aed: number,
  area_sqft: number,
  exit_psf_aed: number,
  hold_years: number = 3
): IrrResult[] {
  return plans
    .filter(p => p.is_active)
    .map(plan =>
      calculateIrr({ unit_price_aed, area_sqft, exit_psf_aed, hold_years, payment_plan: plan })
    )
    .sort((a, b) => b.estimated_irr_pct - a.estimated_irr_pct)
}

// ─────────────────────────────────────────────
// DISPLAY HELPERS
// ─────────────────────────────────────────────
export function formatAed(amount: number): string {
  if (amount >= 1_000_000) {
    return `AED ${(amount / 1_000_000).toFixed(2)}M`
  }
  if (amount >= 1_000) {
    return `AED ${Math.round(amount / 1_000)}K`
  }
  return `AED ${amount.toLocaleString()}`
}

export function formatIrr(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}% IRR (est.)`
}

// ─────────────────────────────────────────────
// SENSITIVITY TABLE
// Used for the "what if" table on the project detail page
// Shows IRR at different exit PSF levels
// ─────────────────────────────────────────────
export function buildSensitivityTable(
  plan: PaymentPlan,
  unit_price_aed: number,
  area_sqft: number,
  current_psf: number
): { exit_psf: number; irr_pct: number; gain_aed: number }[] {
  const deltas = [-10, -5, 0, 5, 10, 15, 20, 30]

  return deltas.map(deltaPct => {
    const exit_psf = Math.round(current_psf * (1 + deltaPct / 100))
    const result = calculateIrr({ unit_price_aed, area_sqft, exit_psf_aed: exit_psf, hold_years: 3, payment_plan: plan })
    return {
      exit_psf,
      irr_pct: result.estimated_irr_pct,
      gain_aed: result.net_gain,
    }
  })
}
