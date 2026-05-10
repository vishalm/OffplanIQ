'use client'

// apps/web/components/insights/InsightCard.tsx
// Renders one Q&A turn: question header, summary, and tabs for
// Result / SQL / Plan. The Result tab picks a renderer based on chart_hint.

import { useState } from 'react'
import { Markdown } from '@/components/ai/Markdown'
import { ResultTable } from './ResultTable'
import { ResultChart } from './ResultChart'

export interface InsightTurn {
  id:        string
  question:  string
  pending?:  boolean
  error?:    string
  summary?:  string
  sql?:      string
  plan?:     any
  columns?:  string[]
  rows?:     Array<Array<string | number | boolean | null>>
  chart_hint?: 'table' | 'bar' | 'line' | 'kpi' | 'pie' | 'donut' | 'heatmap' | 'scatter'
  totals?:   { rowCount: number; truncated: boolean }
}

type Tab = 'result' | 'sql' | 'plan'

export function InsightCard({ turn }: { turn: InsightTurn }) {
  const [tab, setTab] = useState<Tab>('result')

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-[14px] text-gray-900 font-medium leading-snug">{turn.question}</p>
        </div>
      </div>

      {turn.pending && (
        <div className="px-5 py-8 flex items-center gap-3">
          <span className="block h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-[13px] text-gray-500">Planning your query and running it against the database…</p>
        </div>
      )}

      {turn.error && (
        <div className="px-5 py-5 bg-red-50/40 border-t border-red-100">
          <p className="text-[12.5px] font-medium text-red-700 mb-1">Could not answer this question</p>
          <p className="text-[12.5px] text-red-600 whitespace-pre-wrap">{turn.error}</p>
          <p className="text-[11px] text-gray-500 mt-2">
            Try rephrasing — name specific columns (price, score, sell-through) or specific tables (projects, developers, updates).
          </p>
        </div>
      )}

      {!turn.pending && !turn.error && (
        <>
          {turn.summary && (
            <div className="px-5 py-4 bg-blue-50/40 border-b border-blue-100">
              <Markdown className="text-[13px]">{turn.summary}</Markdown>
              {turn.totals && (
                <p className="text-[11px] text-gray-500 mt-2">
                  {turn.totals.rowCount.toLocaleString()} row{turn.totals.rowCount === 1 ? '' : 's'}
                  {turn.totals.truncated ? ` (showing first ${turn.rows?.length ?? 0})` : ''}
                </p>
              )}
            </div>
          )}

          <div className="px-5 pt-3 flex items-center gap-1 border-b border-gray-100">
            <TabButton active={tab === 'result'} onClick={() => setTab('result')} label="Result" />
            <TabButton active={tab === 'sql'}    onClick={() => setTab('sql')}    label="SQL" />
            <TabButton active={tab === 'plan'}   onClick={() => setTab('plan')}   label="Plan" />
            <span className="ml-auto text-[11px] text-gray-400 mb-2">{turn.columns?.length ?? 0} cols · {turn.rows?.length ?? 0} rows</span>
          </div>

          <div className="px-5 py-4">
            {tab === 'result' && (
              <Result columns={turn.columns ?? []} rows={turn.rows ?? []} hint={turn.chart_hint ?? 'table'} />
            )}
            {tab === 'sql'   && <SqlBlock sql={turn.sql ?? ''} />}
            {tab === 'plan'  && <PlanBlock plan={turn.plan} />}
          </div>
        </>
      )}
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-[12.5px] px-3 py-1.5 rounded-md font-medium transition ${
        active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}

function Result({ columns, rows, hint }: { columns: string[]; rows: any[][]; hint: string }) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-gray-500 py-4">No rows matched.</p>
  }
  if (hint === 'kpi' && rows.length === 1) {
    return <KpiResult columns={columns} row={rows[0]} />
  }
  if (hint === 'bar' || hint === 'line' || hint === 'pie' || hint === 'donut') {
    return (
      <div className="space-y-4">
        <ResultChart columns={columns} rows={rows} hint={hint as any} />
        <details className="text-[12px] text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">Show as table</summary>
          <div className="mt-3"><ResultTable columns={columns} rows={rows} /></div>
        </details>
      </div>
    )
  }
  return <ResultTable columns={columns} rows={rows} />
}

function KpiResult({ columns, row }: { columns: string[]; row: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {columns.map((c, i) => (
        <div key={c} className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">{formatCell(row[i])}</p>
          <p className="text-[10.5px] uppercase tracking-widest text-gray-400 mt-1">{c}</p>
        </div>
      ))}
    </div>
  )
}

function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute top-2 right-2 text-[11px] text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 transition"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="bg-gray-900 text-gray-100 text-[12px] leading-relaxed rounded-lg p-4 overflow-x-auto whitespace-pre">{sql || '/* no SQL */'}</pre>
      <p className="mt-2 text-[11px] text-gray-400">
        For display only — we run the structured plan, not this string. Read-only by construction.
      </p>
    </div>
  )
}

function PlanBlock({ plan }: { plan: any }) {
  if (!plan) return <p className="text-[12.5px] text-gray-500">No plan attached.</p>
  return (
    <pre className="bg-gray-50 border border-gray-200 text-[11.5px] leading-relaxed rounded-lg p-4 overflow-x-auto text-gray-800 whitespace-pre">
      {JSON.stringify(plan, null, 2)}
    </pre>
  )
}

function formatCell(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (Math.abs(v) >= 1_000)     return v.toLocaleString()
    return String(v)
  }
  return String(v)
}
