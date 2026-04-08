'use client'

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Props {
  scoreBuckets: { label: string; count: number; color: string }[]
  psfByArea: { name: string; psf: number; score: number }[]
  cityData: { city: string; count: number; avgScore: number; avgPsf: number; totalUnits: number }[]
}

export function AnalyticsCharts({ scoreBuckets, psfByArea, cityData }: Props) {
  return (
    <div className="grid grid-cols-3 gap-5 mb-6">

      {/* Score distribution pie */}
      <div className="card p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Score Distribution</p>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={scoreBuckets} dataKey="count" cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={2}>
                {scoreBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {scoreBuckets.map(b => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                <span className="text-[11px] text-gray-600">{b.label}</span>
                <span className="text-[11px] font-bold text-gray-900 ml-auto tabular-nums">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PSF by area bar chart */}
      <div className="card p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Avg PSF by Area</p>
        <ResponsiveContainer width="100%" height={160}>
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
      <div className="card p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">By City</p>
        <div className="space-y-3">
          {cityData.sort((a, b) => b.count - a.count).map(c => {
            const maxCount = Math.max(...cityData.map(x => x.count))
            return (
              <div key={c.city}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-semibold text-gray-900">{c.city}</span>
                  <span className="text-[11px] text-gray-400">{c.count} projects</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
                    style={{ width: `${(c.count / maxCount) * 100}%` }} />
                </div>
                <div className="flex gap-4 mt-1 text-[10px] text-gray-400">
                  <span>Score {c.avgScore}</span>
                  <span>PSF AED {c.avgPsf.toLocaleString()}</span>
                  <span>{c.totalUnits.toLocaleString()} units</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
