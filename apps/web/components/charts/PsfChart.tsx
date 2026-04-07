'use client'
// apps/web/components/charts/PsfChart.tsx
// Recharts line chart for PSF history

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface DataPoint {
  recorded_date: string
  psf: number
  source: string
}

export function PsfChart({ data }: { data: DataPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-40 flex items-center justify-center">
        <p className="text-sm text-gray-400">No PSF history yet</p>
      </div>
    )
  }

  const sorted = [...data]
    .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
    .map(d => ({
      date: format(parseISO(d.recorded_date), 'MMM yy'),
      psf: d.psf,
    }))

  const minPsf = Math.min(...sorted.map(d => d.psf))
  const maxPsf = Math.max(...sorted.map(d => d.psf))
  const padding = Math.round((maxPsf - minPsf) * 0.15) || 100

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={sorted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[minPsf - padding, maxPsf + padding]}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v.toLocaleString()}`}
          width={56}
        />
        <Tooltip
          formatter={(value: number) => [`AED ${value.toLocaleString()}`, 'PSF']}
          labelStyle={{ fontSize: 12, color: '#6b7280' }}
          contentStyle={{
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            fontSize: 12,
            boxShadow: 'none',
          }}
        />
        <Line
          type="monotone"
          dataKey="psf"
          stroke="#111827"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
