'use client'

import { useState, useMemo } from 'react'
import { comparePaymentPlans, formatAed, buildSensitivityTable } from '@/lib/irr/calculator'
import type { PaymentPlan, Project } from '@offplaniq/shared'

interface Props {
  project: Pick<Project, 'current_psf' | 'min_price' | 'max_price'>
  paymentPlans: PaymentPlan[]
}

// Default plans when project has none
const DEFAULT_PLANS: PaymentPlan[] = [
  { id: 'default-60-40', project_id: '', name: '60/40 Standard', description: null, down_payment_pct: 20, construction_pct: 40, handover_pct: 40, post_handover_pct: 0, post_handover_months: 0, monthly_pct: 0, is_active: true },
  { id: 'default-80-20', project_id: '', name: '80/20 Plan', description: null, down_payment_pct: 20, construction_pct: 60, handover_pct: 20, post_handover_pct: 0, post_handover_months: 0, monthly_pct: 0, is_active: true },
  { id: 'default-post', project_id: '', name: 'Post-Handover 30/70', description: null, down_payment_pct: 10, construction_pct: 20, handover_pct: 0, post_handover_pct: 70, post_handover_months: 36, monthly_pct: 0, is_active: true },
]

export function IrrCalculator({ project, paymentPlans: rawPlans }: Props) {
  const paymentPlans = rawPlans.length > 0 ? rawPlans : DEFAULT_PLANS
  const currentPsf = project.current_psf ?? 2000

  // Dynamic boundaries based on project data
  const priceMin = Math.max(100000, Math.round((project.min_price ?? 500000) * 0.5 / 50000) * 50000)
  const priceMax = Math.round(Math.max((project.max_price ?? 5000000) * 1.5, (project.min_price ?? 1500000) * 3) / 100000) * 100000
  const priceStep = priceMax <= 2000000 ? 25000 : priceMax <= 10000000 ? 50000 : 100000
  const defaultPrice = project.min_price ?? Math.round((priceMin + priceMax) / 2 / priceStep) * priceStep

  const psfMin = Math.max(500, Math.round(currentPsf * 0.5 / 50) * 50)
  const psfMax = Math.round(currentPsf * 2 / 50) * 50
  const psfStep = psfMax <= 3000 ? 25 : 50

  const [unitPrice, setUnitPrice] = useState(defaultPrice)
  const [exitPsf, setExitPsf] = useState(Math.round(currentPsf * 1.15 / psfStep) * psfStep)
  const [holdYears, setHoldYears] = useState(3)
  const [selectedPlanId, setSelectedPlanId] = useState(paymentPlans[0]?.id ?? '')

  const areaSqft = useMemo(
    () => (project.current_psf && project.current_psf > 0 ? unitPrice / project.current_psf : 800),
    [unitPrice, project.current_psf]
  )

  const results = useMemo(
    () => comparePaymentPlans(paymentPlans, unitPrice, areaSqft, exitPsf, holdYears),
    [paymentPlans, unitPrice, areaSqft, exitPsf, holdYears]
  )

  const selectedResult = results.find(r => r.plan_id === selectedPlanId) || results[0]
  const selectedPlan = paymentPlans.find(p => p.id === selectedPlanId)

  const sensitivityRows = useMemo(
    () => selectedPlan ? buildSensitivityTable(selectedPlan, unitPrice, areaSqft, project.current_psf ?? 2000) : [],
    [selectedPlan, unitPrice, areaSqft, project.current_psf]
  )

  const irrPositive = selectedResult && selectedResult.estimated_irr_pct > 0

  return (
    <div className="card p-6 mb-5">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-5">IRR Calculator</p>

      {/* Top: Big IRR result + sliders side by side */}
      <div className="grid grid-cols-[200px_1fr] gap-8 mb-6">
        {/* Big IRR number */}
        <div className="flex flex-col items-center justify-center rounded-2xl p-5" style={{ background: irrPositive ? '#f0fdf4' : '#fef2f2' }}>
          <p className={`text-4xl font-bold tabular-nums ${irrPositive ? 'text-green-600' : 'text-red-500'}`}>
            {selectedResult ? `${selectedResult.estimated_irr_pct > 0 ? '+' : ''}${selectedResult.estimated_irr_pct}%` : '-'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Estimated annual IRR</p>
          {selectedResult && (
            <p className={`text-sm font-semibold mt-2 ${selectedResult.net_gain >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatAed(selectedResult.net_gain)} net gain
            </p>
          )}
          <p className="text-[10px] text-gray-400 mt-1">on {formatAed(selectedResult?.total_invested ?? 0)} invested</p>
        </div>

        {/* Sliders */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600">What you'd pay for a unit</label>
              <span className="text-sm font-bold text-gray-900 tabular-nums">{formatAed(unitPrice)}</span>
            </div>
            <input type="range" min={priceMin} max={priceMax} step={priceStep} value={unitPrice}
              onChange={e => setUnitPrice(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-blue-600 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>{formatAed(priceMin)}</span>
              {project.min_price && <span className="text-blue-500 font-medium">From {formatAed(project.min_price)}</span>}
              <span>{formatAed(priceMax)}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600">What you think PSF will be when you sell</label>
              <span className="text-sm font-bold text-gray-900 tabular-nums">AED {exitPsf.toLocaleString()}/sqft</span>
            </div>
            <input type="range" min={psfMin} max={psfMax} step={psfStep} value={exitPsf}
              onChange={e => setExitPsf(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-blue-600 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>AED {psfMin.toLocaleString()}</span>
              <span className="text-blue-500 font-medium">Current: AED {currentPsf.toLocaleString()}</span>
              <span>AED {psfMax.toLocaleString()}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600">How long you'd hold before selling</label>
              <span className="text-sm font-bold text-gray-900">{holdYears} year{holdYears > 1 ? 's' : ''}</span>
            </div>
            <input type="range" min={1} max={7} step={1} value={holdYears}
              onChange={e => setHoldYears(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-blue-600 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>1 year</span><span>7 years</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment plan cards */}
      {results.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Compare payment plans</p>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {results.map(result => {
              const plan = paymentPlans.find(p => p.id === result.plan_id)
              const selected = result.plan_id === selectedPlanId
              const positive = result.estimated_irr_pct > 0
              return (
                <button key={result.plan_id} onClick={() => setSelectedPlanId(result.plan_id)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    selected ? 'border-blue-500 bg-blue-50/50' : 'border-transparent bg-gray-50 hover:bg-gray-100'
                  }`}>
                  <p className="text-[13px] font-semibold text-gray-900">{result.plan_name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{plan?.down_payment_pct}% down + {plan?.construction_pct}% construction</p>
                  <p className={`text-xl font-bold mt-2 tabular-nums ${positive ? 'text-green-600' : 'text-red-500'}`}>
                    {positive ? '+' : ''}{result.estimated_irr_pct}% IRR
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{formatAed(result.net_gain)} gain</p>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Sensitivity */}
      {sensitivityRows.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">What if PSF changes?</p>
          <div className="grid grid-cols-8 gap-1.5">
            {sensitivityRows.map(row => {
              const isActive = row.exit_psf === exitPsf
              const positive = row.irr_pct >= 0
              return (
                <div key={row.exit_psf} className={`text-center p-2.5 rounded-lg ${isActive ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-gray-50'}`}>
                  <p className="text-[10px] text-gray-400">AED {row.exit_psf.toLocaleString()}</p>
                  <p className={`text-sm font-bold tabular-nums ${positive ? 'text-green-600' : 'text-red-500'}`}>
                    {positive ? '+' : ''}{row.irr_pct}%
                  </p>
                  <p className="text-[10px] text-gray-400">{formatAed(row.gain_aed)}</p>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">Estimated returns on cash invested during construction. Not financial advice.</p>
        </>
      )}
    </div>
  )
}
