'use client'
// apps/web/components/project/IrrCalculator.tsx
//
// THE KILLER FEATURE — fully interactive, no backend calls.
// Investors drag sliders and IRR updates instantly.
//
// Props:
//   project: Project (for current_psf, area_sqft defaults)
//   paymentPlans: PaymentPlan[]
//
// State:
//   unitPrice: number (AED)
//   exitPsf: number (AED/sqft)
//   selectedPlanId: string
//   holdYears: number

import { useState, useMemo } from 'react'
import { comparePaymentPlans, formatAed, formatIrr, buildSensitivityTable } from '@/lib/irr/calculator'
import type { PaymentPlan, Project } from '@offplaniq/shared'

interface Props {
  project: Pick<Project, 'current_psf' | 'min_price' | 'max_price'>
  paymentPlans: PaymentPlan[]
}

export function IrrCalculator({ project, paymentPlans }: Props) {
  const defaultPrice = project.min_price ?? 1_500_000
  const defaultPsf   = project.current_psf ?? 2000

  const [unitPrice,     setUnitPrice]     = useState(defaultPrice)
  const [exitPsf,       setExitPsf]       = useState(Math.round(defaultPsf * 1.15)) // +15% default
  const [holdYears,     setHoldYears]     = useState(3)
  const [selectedPlanId, setSelectedPlanId] = useState(paymentPlans[0]?.id ?? '')

  // Derived: sqft from price/PSF
  const areaSqft = useMemo(
    () => (project.current_psf && project.current_psf > 0 ? unitPrice / project.current_psf : 800),
    [unitPrice, project.current_psf]
  )

  const results = useMemo(
    () => comparePaymentPlans(paymentPlans, unitPrice, areaSqft, exitPsf, holdYears),
    [paymentPlans, unitPrice, areaSqft, exitPsf, holdYears]
  )

  const selectedPlan = paymentPlans.find(p => p.id === selectedPlanId)
  const sensitivityRows = useMemo(
    () => selectedPlan
      ? buildSensitivityTable(selectedPlan, unitPrice, areaSqft, project.current_psf ?? 2000)
      : [],
    [selectedPlan, unitPrice, areaSqft, project.current_psf]
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-5">
        Payment plan IRR calculator
      </p>

      {/* Sliders */}
      <div className="space-y-4 mb-6">
        <SliderRow
          label="Unit price"
          value={unitPrice}
          min={500_000}
          max={5_000_000}
          step={50_000}
          display={formatAed(unitPrice)}
          onChange={setUnitPrice}
        />
        <SliderRow
          label="Exit PSF target"
          value={exitPsf}
          min={1000}
          max={5000}
          step={50}
          display={`AED ${exitPsf.toLocaleString()}/sqft`}
          onChange={setExitPsf}
        />
        <SliderRow
          label="Hold period"
          value={holdYears}
          min={1}
          max={7}
          step={1}
          display={`${holdYears} year${holdYears > 1 ? 's' : ''}`}
          onChange={setHoldYears}
        />
      </div>

      {/* Plan comparison */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {results.map((result) => {
          const plan = paymentPlans.find(p => p.id === result.plan_id)
          const isSelected = result.plan_id === selectedPlanId
          const isPositive = result.estimated_irr_pct > 0

          return (
            <button
              key={result.plan_id}
              onClick={() => setSelectedPlanId(result.plan_id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                isSelected
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-medium text-gray-900 mb-1">{result.plan_name}</p>
              <p className="text-xs text-gray-400 mb-3">
                {plan?.down_payment_pct}% down · {plan?.handover_pct}% handover
              </p>
              <p className={`text-lg font-medium ${isPositive ? 'text-green-700' : 'text-red-600'}`}>
                {formatIrr(result.estimated_irr_pct)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {formatAed(result.net_gain)} net gain
              </p>
            </button>
          )
        })}
      </div>

      {/* Sensitivity table */}
      {sensitivityRows.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Sensitivity — IRR at different exit PSF levels
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">Exit PSF</th>
                  <th className="text-right py-2 font-medium">IRR (est.)</th>
                  <th className="text-right py-2 font-medium">Net gain</th>
                </tr>
              </thead>
              <tbody>
                {sensitivityRows.map((row) => (
                  <tr
                    key={row.exit_psf}
                    className={`border-b border-gray-50 ${row.exit_psf === exitPsf ? 'bg-blue-50' : ''}`}
                  >
                    <td className="py-2 text-gray-700">AED {row.exit_psf.toLocaleString()}</td>
                    <td className={`py-2 text-right font-medium ${row.irr_pct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {row.irr_pct > 0 ? '+' : ''}{row.irr_pct.toFixed(1)}%
                    </td>
                    <td className={`py-2 text-right ${row.gain_aed >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatAed(row.gain_aed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            * Estimated IRR on cash invested during construction. Not financial advice.
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Slider sub-component
// ─────────────────────────────────────────────
function SliderRow({
  label, value, min, max, step, display, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-500 w-32 flex-shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-gray-900"
      />
      <span className="text-sm font-medium text-gray-900 w-32 text-right">{display}</span>
    </div>
  )
}
