'use client'

// apps/web/components/insights/ResultChart.tsx
// Tiny, dependency-free SVG charts for insight results. We deliberately
// don't pull recharts here — three small chart types is less code than the
// recharts wrapper boilerplate, and they style perfectly to our palette.
//
// chart_hint contract:
//   - bar/line: first column is x-axis (categorical/date), one or more
//               numeric columns are series.
//   - pie/donut: first column is label, second column is value.

type Cell = string | number | boolean | null

interface Props {
  columns: string[]
  rows:    Cell[][]
  hint:    'bar' | 'line' | 'pie' | 'donut'
}

const PALETTE = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16']

export function ResultChart({ columns, rows, hint }: Props) {
  if (rows.length === 0) return <p className="text-[12.5px] text-gray-500">No rows.</p>

  if (hint === 'pie' || hint === 'donut') {
    return <PieChart columns={columns} rows={rows} donut={hint === 'donut'} />
  }
  if (hint === 'line') {
    return <LineChart columns={columns} rows={rows} />
  }
  return <BarChart columns={columns} rows={rows} />
}

// ─── Bar ────────────────────────────────────────────────────

function BarChart({ columns, rows }: { columns: string[]; rows: Cell[][] }) {
  const labelIdx = 0
  const seriesIdx = columns.findIndex((_, i) => i !== labelIdx && rows.every(r => r[i] == null || typeof r[i] === 'number'))
  if (seriesIdx === -1) return <Fallback message="Need at least one numeric column for a bar chart." />

  const labels = rows.map(r => String(r[labelIdx] ?? ''))
  const values = rows.map(r => Number(r[seriesIdx] ?? 0))
  const max = Math.max(1, ...values)

  // Compact horizontal bars — readable for 5..50 rows.
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[11px] uppercase tracking-widest text-gray-400">{columns[labelIdx]} · {columns[seriesIdx]}</p>
        <p className="text-[11px] text-gray-400 tabular-nums">max {fmtNum(max)}</p>
      </div>
      {rows.map((_, i) => {
        const pct = (values[i] / max) * 100
        return (
          <div key={i} className="flex items-center gap-3 group">
            <div className="w-32 shrink-0 text-[12px] text-gray-700 truncate" title={labels[i]}>{labels[i] || '—'}</div>
            <div className="flex-1 bg-gray-100 rounded h-6 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-blue-500 group-hover:bg-blue-600 transition"
                style={{ width: `${pct.toFixed(2)}%` }}
              />
            </div>
            <div className="w-20 shrink-0 text-right text-[12px] tabular-nums text-gray-900">{fmtNum(values[i])}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Line ───────────────────────────────────────────────────

function LineChart({ columns, rows }: { columns: string[]; rows: Cell[][] }) {
  const labelIdx = 0
  const numericIdxs = columns.map((_, i) => i).filter(i => i !== labelIdx && rows.every(r => r[i] == null || typeof r[i] === 'number'))
  if (numericIdxs.length === 0) return <Fallback message="Need at least one numeric column for a line chart." />

  const w = 720, h = 240, pad = 32
  const xs = rows.map((_, i) => pad + (i * (w - pad * 2)) / Math.max(1, rows.length - 1))
  const allValues = numericIdxs.flatMap(i => rows.map(r => Number(r[i] ?? 0)))
  const max = Math.max(1, ...allValues)
  const min = Math.min(0, ...allValues)
  const yScale = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        {/* axes */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" />
        <line x1={pad} y1={pad}     x2={pad}     y2={h - pad} stroke="#e5e7eb" />
        {/* y labels */}
        <text x={4} y={pad + 4} fontSize={10} fill="#9ca3af">{fmtNum(max)}</text>
        <text x={4} y={h - pad}  fontSize={10} fill="#9ca3af">{fmtNum(min)}</text>
        {numericIdxs.map((idx, sIdx) => {
          const color = PALETTE[sIdx % PALETTE.length]
          const path = rows.map((r, i) => {
            const v = Number(r[idx] ?? 0)
            return `${i === 0 ? 'M' : 'L'} ${xs[i]} ${yScale(v)}`
          }).join(' ')
          return (
            <g key={idx}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} />
              {rows.map((r, i) => (
                <circle key={i} cx={xs[i]} cy={yScale(Number(r[idx] ?? 0))} r={3} fill={color}>
                  <title>{`${columns[labelIdx]}: ${r[labelIdx]} · ${columns[idx]}: ${fmtNum(Number(r[idx] ?? 0))}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
        {/* x ticks (every nth) */}
        {rows.map((r, i) => {
          if (rows.length > 12 && i % Math.ceil(rows.length / 8) !== 0 && i !== rows.length - 1) return null
          return (
            <text key={i} x={xs[i]} y={h - pad + 14} fontSize={10} fill="#9ca3af" textAnchor="middle">
              {String(r[labelIdx] ?? '').slice(0, 10)}
            </text>
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-3 mt-2">
        {numericIdxs.map((idx, sIdx) => (
          <span key={idx} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PALETTE[sIdx % PALETTE.length] }} />
            {columns[idx]}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Pie / Donut ────────────────────────────────────────────

function PieChart({ columns, rows, donut }: { columns: string[]; rows: Cell[][]; donut: boolean }) {
  if (columns.length < 2) return <Fallback message="Pie needs a label and a value column." />
  const labels = rows.map(r => String(r[0] ?? ''))
  const values = rows.map(r => Math.max(0, Number(r[1] ?? 0)))
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0) return <Fallback message="No positive values to chart." />

  const cx = 110, cy = 110, r = 90, ir = donut ? 50 : 0
  let acc = 0
  const slices = values.map((v, i) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2
    acc += v
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2
    return { i, v, path: arcPath(cx, cy, r, ir, start, end), pct: (v / total) * 100 }
  })

  return (
    <div className="flex flex-col sm:flex-row items-start gap-5">
      <svg viewBox="0 0 220 220" className="w-[220px] h-[220px] shrink-0">
        {slices.map(s => (
          <path key={s.i} d={s.path} fill={PALETTE[s.i % PALETTE.length]}>
            <title>{`${labels[s.i]}: ${fmtNum(s.v)} (${s.pct.toFixed(1)}%)`}</title>
          </path>
        ))}
      </svg>
      <ul className="flex-1 space-y-1 text-[12.5px]">
        {slices.slice(0, 12).map(s => (
          <li key={s.i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[s.i % PALETTE.length] }} />
            <span className="text-gray-700 truncate flex-1">{labels[s.i] || '—'}</span>
            <span className="text-gray-900 tabular-nums">{fmtNum(s.v)}</span>
            <span className="text-gray-400 tabular-nums w-12 text-right">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
        {slices.length > 12 && <li className="text-gray-400 text-[11px]">+ {slices.length - 12} more…</li>}
      </ul>
    </div>
  )
}

function arcPath(cx: number, cy: number, r: number, ir: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
  if (ir <= 0) {
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
  }
  const xi0 = cx + ir * Math.cos(a0), yi0 = cy + ir * Math.sin(a0)
  const xi1 = cx + ir * Math.cos(a1), yi1 = cy + ir * Math.sin(a1)
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${ir} ${ir} 0 ${large} 0 ${xi0} ${yi0} Z`
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(v) >= 1_000)     return Math.round(v).toLocaleString()
  if (!Number.isInteger(v))     return v.toFixed(2)
  return v.toLocaleString()
}

function Fallback({ message }: { message: string }) {
  return <p className="text-[12.5px] text-gray-500 py-4">{message}</p>
}
