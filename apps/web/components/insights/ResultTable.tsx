'use client'

// apps/web/components/insights/ResultTable.tsx
// Sortable, scrollable table for query results. Detects numeric columns
// and right-aligns + tabular-nums them. Long string columns truncate with
// a tooltip; clicking a slug-shaped value links to /projects/<slug>.

import { useMemo, useState } from 'react'
import Link from 'next/link'

type Cell = string | number | boolean | null

interface Props {
  columns: string[]
  rows:    Cell[][]
}

export function ResultTable({ columns, rows }: Props) {
  const [sortIdx, setSortIdx] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const numeric = useMemo(() =>
    columns.map((_, ci) => rows.every(r => r[ci] == null || typeof r[ci] === 'number' || (typeof r[ci] === 'string' && !Number.isNaN(Number(r[ci]))))),
    [columns, rows],
  )

  const sorted = useMemo(() => {
    if (sortIdx == null) return rows
    const out = [...rows]
    out.sort((a, b) => {
      const av = a[sortIdx], bv = b[sortIdx]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (numeric[sortIdx]) return (Number(av) - Number(bv)) * (sortDir === 'asc' ? 1 : -1)
      return String(av).localeCompare(String(bv)) * (sortDir === 'asc' ? 1 : -1)
    })
    return out
  }, [rows, sortIdx, sortDir, numeric])

  function toggleSort(i: number) {
    if (sortIdx === i) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortIdx(i); setSortDir('desc') }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((c, i) => (
              <th
                key={c}
                onClick={() => toggleSort(i)}
                className={`text-[11px] uppercase tracking-wider font-medium px-3 py-2 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 transition ${
                  numeric[i] ? 'text-right' : 'text-left'
                } text-gray-500`}
              >
                <span>{c}</span>
                {sortIdx === i && (
                  <span className="ml-1 text-gray-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, ri) => (
            <tr key={ri} className="border-t border-gray-100 hover:bg-gray-50/60 transition">
              {r.map((v, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 align-top ${numeric[ci] ? 'text-right tabular-nums text-gray-900' : 'text-gray-700'}`}
                >
                  {renderCell(v, columns[ci])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderCell(v: Cell, columnName: string): React.ReactNode {
  if (v == null || v === '') return <span className="text-gray-300">—</span>
  if (columnName === 'slug' && typeof v === 'string') {
    return <Link className="text-blue-600 hover:underline" href={`/projects/${v}`}>{v}</Link>
  }
  if (columnName === 'developer.slug' && typeof v === 'string') {
    return <span className="text-gray-700">{v}</span>
  }
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
    if (Math.abs(v) >= 1_000)     return v.toLocaleString()
    if (!Number.isInteger(v))     return v.toFixed(2)
    return v.toLocaleString()
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  const s = String(v)
  if (s.length > 80) return <span title={s}>{s.slice(0, 80)}…</span>
  return s
}
