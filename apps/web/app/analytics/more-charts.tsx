'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'

interface Props {
  sellthroughData: { range: string; count: number }[]
  priceData: { range: string; count: number }[]
  handoverHealth: { onTrack: number; atRisk: number; delayed: number }
}

const COLORS = ['#16a34a', '#22c55e', '#ca8a04', '#ea580c', '#dc2626']

export function MoreCharts({ sellthroughData, priceData, handoverHealth }: Readonly<Props>) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Buckets are derived from current_handover_date proximity vs today (we
  // don't have original_handover_date for true delay tracking, so the
  // taxonomy is timing-based rather than status-based).
  const healthData = [
    { name: '12+ months out', value: handoverHealth.onTrack, color: '#22c55e' },
    { name: 'Within 12 months', value: handoverHealth.atRisk, color: '#f59e0b' },
    { name: 'Past handover date', value: handoverHealth.delayed, color: '#ef4444' },
  ].filter(d => d.value > 0)

  const total = healthData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="grid gap-5 lg:grid-cols-3">

      {/* Sell-through distribution */}
      <div className="card p-5 bg-white shadow-sm">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Sell-through Distribution</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={sellthroughData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }} />
            <Bar dataKey="count" name="Projects" radius={[6, 6, 0, 0]}>
              {sellthroughData.map((d, i) => <Cell key={d.range} fill={COLORS[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Price entry points */}
      <div className="card p-5 bg-white shadow-sm">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Entry Price (AED)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={priceData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }} />
            <Bar dataKey="count" name="Projects" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Handover health donut */}
      <div className="card p-5 bg-white shadow-sm">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Handover Health</p>
        <div className="grid gap-4">
          <div className="mx-auto">
            {mounted ? (
              <PieChart width={220} height={220} id="handover-health-chart">
                <Pie data={healthData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4}>
                  {healthData.map(d => <Cell key={d.name} fill={d.color} />)}
                </Pie>
              </PieChart>
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-full bg-slate-100">
                <span className="text-[12px] text-slate-400">Rendering chart...</span>
              </div>
            )}
          </div>
          <div className="grid w-full grid-cols-1 gap-2 text-[11px] text-slate-600 sm:grid-cols-2">
            {healthData.map(d => (
              <div key={d.name} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-slate-700">{d.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-slate-900 tabular-nums">{d.value}</span>
                    <span className="text-[11px] text-slate-500">{Math.round((d.value / total) * 100)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
