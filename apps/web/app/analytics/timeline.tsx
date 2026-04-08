'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Project {
  name: string; slug: string; score: number; delayed: boolean; area: string; developer: string; units: number
}

interface Props {
  timeline: { year: string; months: { month: string; projects: Project[] }[] }[]
  launchTimeline: { quarter: string; count: number }[]
}

export function TimelineDrilldown({ timeline, launchTimeline }: Props) {
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [view, setView] = useState<'handover' | 'launches'>('handover')

  const yearData = timeline.find(t => t.year === selectedYear)
  const monthData = yearData?.months.find(m => m.month === selectedMonth)

  return (
    <div className="card p-5 mb-6">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Project Timeline</p>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => { setView('handover'); setSelectedYear(null); setSelectedMonth(null) }}
            className={`text-[11px] font-medium px-3 py-1 rounded-md transition-colors ${view === 'handover' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            Handovers
          </button>
          <button onClick={() => { setView('launches'); setSelectedYear(null); setSelectedMonth(null) }}
            className={`text-[11px] font-medium px-3 py-1 rounded-md transition-colors ${view === 'launches' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            Launches
          </button>
        </div>
      </div>

      {view === 'launches' && (
        <div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={launchTimeline} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }} />
              <Bar dataKey="count" name="Launches" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === 'handover' && !selectedYear && (
        <div>
          {/* Year overview */}
          <div className="grid grid-cols-4 gap-3">
            {timeline.map(t => {
              const totalProjects = t.months.reduce((s, m) => s + m.projects.length, 0)
              const delayed = t.months.reduce((s, m) => s + m.projects.filter(p => p.delayed).length, 0)
              const totalUnits = t.months.reduce((s, m) => s + m.projects.reduce((us, p) => us + p.units, 0), 0)
              return (
                <button key={t.year} onClick={() => setSelectedYear(t.year)}
                  className="text-left p-4 rounded-xl bg-gray-50 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all">
                  <p className="text-2xl font-bold text-gray-900">{t.year}</p>
                  <p className="text-[13px] font-semibold text-gray-700 mt-1">{totalProjects} handovers</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{totalUnits.toLocaleString()} units</p>
                  {delayed > 0 && (
                    <p className="text-[11px] text-red-500 font-medium mt-1">{delayed} delayed</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {view === 'handover' && selectedYear && !selectedMonth && (
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setSelectedYear(null)} className="text-[12px] text-blue-600 hover:underline">All years</button>
            <span className="text-gray-300">/</span>
            <span className="text-[12px] font-semibold text-gray-900">{selectedYear}</span>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-6 gap-3">
            {yearData?.months.map(m => {
              const delayed = m.projects.filter(p => p.delayed).length
              return (
                <button key={m.month} onClick={() => setSelectedMonth(m.month)}
                  className="text-left p-3 rounded-xl bg-gray-50 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all">
                  <p className="text-[13px] font-bold text-gray-900">{m.month}</p>
                  <p className="text-xl font-bold text-gray-700 tabular-nums">{m.projects.length}</p>
                  <p className="text-[10px] text-gray-400">handovers</p>
                  {delayed > 0 && <p className="text-[10px] text-red-500 font-medium mt-0.5">{delayed} delayed</p>}
                </button>
              )
            })}
            {yearData?.months.length === 0 && <p className="text-[12px] text-gray-400 col-span-6">No handovers scheduled</p>}
          </div>
        </div>
      )}

      {view === 'handover' && selectedYear && selectedMonth && monthData && (
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => { setSelectedYear(null); setSelectedMonth(null) }} className="text-[12px] text-blue-600 hover:underline">All years</button>
            <span className="text-gray-300">/</span>
            <button onClick={() => setSelectedMonth(null)} className="text-[12px] text-blue-600 hover:underline">{selectedYear}</button>
            <span className="text-gray-300">/</span>
            <span className="text-[12px] font-semibold text-gray-900">{selectedMonth} {selectedYear}</span>
            <span className="text-[11px] text-gray-400 ml-2">{monthData.projects.length} projects</span>
          </div>

          {/* Project list */}
          <div className="space-y-1.5">
            {monthData.projects.map(p => (
              <Link key={p.slug} href={`/projects/${p.slug}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <span className={`w-2 h-2 rounded-full shrink-0 ${p.delayed ? 'bg-red-500' : 'bg-green-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900">{p.name}</p>
                  <p className="text-[11px] text-gray-400">{p.developer} · {p.area} · {p.units.toLocaleString()} units</p>
                </div>
                <div className="flex items-center gap-3">
                  {p.delayed && <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Delayed</span>}
                  <span className={`text-[13px] font-bold tabular-nums ${p.score >= 70 ? 'text-green-600' : p.score >= 55 ? 'text-amber-600' : 'text-red-500'}`}>
                    {p.score}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
