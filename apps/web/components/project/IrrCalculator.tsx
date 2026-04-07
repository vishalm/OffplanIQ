'use client'

import { useState, useMemo } from 'react'
import { comparePaymentPlans, formatAed, buildSensitivityTable } from '@/lib/irr/calculator'
import type { PaymentPlan, Project } from '@offplaniq/shared'

interface Props {
  project: Pick<Project, 'current_psf' | 'min_price' | 'max_price'>
  paymentPlans: PaymentPlan[]
}

export function IrrCalculator({ project, paymentPlans }: Props) {
  const defaultPrice = project.min_price ?? 1_500_000
  const defaultPsf = project.current_psf ?? 2000

  const [unitPrice, setUnitPrice] = useState(defaultPrice)
  const [exitPsf, setExitPsf] = useState(Math.round(defaultPsf * 1.15))
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
            <input type="range" min={500000} max={5000000} step={50000} value={unitPrice}
              onChange={e => setUnitPrice(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-blue-600 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>AED 500K</span><span>AED 5M</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600">What you think PSF will be when you sell</label>
              <span className="text-sm font-bold text-gray-900 tabular-nums">AED {exitPsf.toLocaleString()}/sqft</span>
            </div>
            <input type="range" min={1000} max={5000} step={50} value={exitPsf}
              onChange={e => setExitPsf(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-blue-600 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>AED 1,000</span>
              <span className="text-blue-500 font-medium">Current: AED {(project.current_psf ?? 0).toLocaleString()}</span>
              <span>AED 5,000</span>
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
