'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Props {
  scoreBuckets: { label: string; count: number; color: string }[]
  psfByArea: { name: string; psf: number; score: number }[]
  // totalUnits intentionally optional — we don't always have an inventory source.
  cityData: { city: string; count: number; avgScore: number; avgPsf: number; totalSold?: number; totalUnits?: number }[]
}

export function AnalyticsCharts({ scoreBuckets, psfByArea, cityData }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const allCities = cityData.map(c => c)

  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr] mb-6">

      {/* Score distribution pie */}
      <div className="card p-5 bg-white shadow-sm">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Score Distribution</p>
        <div className="grid gap-5">
          <div className="mx-auto">
            {mounted ? (
              <PieChart width={220} height={220} id="score-distribution-chart">
                <Pie data={scoreBuckets} dataKey="count" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4}>
                  {scoreBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Pie>
              </PieChart>
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-full bg-slate-100">
                <span className="text-[12px] text-slate-400">Rendering chart...</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 text-[11px] text-slate-600 sm:grid-cols-2">
            {scoreBuckets.map(b => (
              <div key={b.label} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-slate-700">{b.label}</p>
                  <p className="text-[12px] font-semibold text-slate-900 tabular-nums">{b.count}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        {/* PSF by area bar chart */}
        <div className="card p-5 bg-white shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Avg PSF by Area</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={psfByArea.slice(0, 8)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#999' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#999' }} axisLine={false} tickLine={false} width={45} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }}
                formatter={(value: number) => [`AED ${value.toLocaleString()}`, 'Avg PSF']} />
              <Bar dataKey="psf" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* City breakdown */}
        <div className="card p-5 bg-white shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">By City</p>
          <div className="space-y-3">
            {allCities.map(c => {
              const maxCount = Math.max(...allCities.map(x => x.count), 1)
              return (
                <div key={c.city}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-semibold text-slate-900">{c.city}</span>
                    <span className="text-[11px] text-slate-400">{c.count} projects</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
                      style={{ width: `${(c.count / maxCount) * 100}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1 text-[10px] text-slate-400">
                    {c.avgScore > 0 ? <span>Score {c.avgScore}</span> : <span className="text-slate-300">No score</span>}
                    {c.avgPsf > 0 ? <span>PSF AED {c.avgPsf.toLocaleString()}</span> : <span className="text-slate-300">No PSF</span>}
                    {(c.totalSold ?? 0) > 0 ? <span>{c.totalSold!.toLocaleString()} sales</span> : <span className="text-slate-300">No sales</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
