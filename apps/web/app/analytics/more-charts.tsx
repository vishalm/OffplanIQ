'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, PieChart, Pie, Cell } from 'recharts'

interface Props {
  devData: { name: string; score: number; onTime: number; complaints: number }[]
  sellthroughData: { range: string; count: number }[]
  priceData: { range: string; count: number }[]
  handoverHealth: { onTrack: number; atRisk: number; delayed: number }
}

const COLORS = ['#16a34a', '#22c55e', '#ca8a04', '#ea580c', '#dc2626']

export function MoreCharts({ devData, sellthroughData, priceData, handoverHealth }: Props) {
  const healthData = [
    { name: 'On Track', value: handoverHealth.onTrack, color: '#22c55e' },
    { name: 'At Risk', value: handoverHealth.atRisk, color: '#f59e0b' },
    { name: 'Delayed', value: handoverHealth.delayed, color: '#ef4444' },
  ].filter(d => d.value > 0)

  const total = healthData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="grid grid-cols-4 gap-5 mb-6">

      {/* Developer scores bar */}
      <div className="card p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Developer Scores</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={devData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9, fill: '#999' }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#666' }} axisLine={false} tickLine={false} width={75} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }} />
            <Bar dataKey="score" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sell-through distribution */}
      <div className="card p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Sell-through Distribution</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={sellthroughData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="range" tick={{ fontSize: 9, fill: '#999' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#999' }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }} />
            <Bar dataKey="count" name="Projects" radius={[4, 4, 0, 0]}>
              {sellthroughData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Price entry points */}
      <div className="card p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Entry Price (AED)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={priceData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="range" tick={{ fontSize: 9, fill: '#999' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#999' }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }} />
            <Bar dataKey="count" name="Projects" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Handover health donut */}
      <div className="card p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Handover Health</p>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={120} height={120}>
            <PieChart>
              <Pie data={healthData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3}>
                {healthData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {healthData.map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-[12px] text-gray-600">{d.name}</span>
                <span className="text-[12px] font-bold text-gray-900 ml-auto tabular-nums">{d.value}</span>
                <span className="text-[10px] text-gray-400 tabular-nums">{Math.round((d.value / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
