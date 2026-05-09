'use client'

// apps/web/components/admin/OpsGrid.tsx
//
// Categorised one-click operations. Click a tile → POST /api/admin/ops →
// the JobLog refreshes via the parent's `onJobFired` callback. Destructive
// tiles require an in-place "click again to confirm" gesture so a slip can't
// fire emails.

import { useState } from 'react'
import type { OperationView } from '@/lib/admin/operations'

const CATEGORY_ORDER: OperationView['category'][] = ['Recompute', 'Scrape', 'Maintenance', 'Notify']

const CATEGORY_ACCENT: Record<OperationView['category'], string> = {
  Recompute:   'text-blue-700 bg-blue-50 border-blue-100',
  Scrape:      'text-emerald-700 bg-emerald-50 border-emerald-100',
  Notify:      'text-orange-700 bg-orange-50 border-orange-100',
  Maintenance: 'text-violet-700 bg-violet-50 border-violet-100',
}

export function OpsGrid({ operations, onJobFired }: { operations: OperationView[]; onJobFired: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ id: string; ok: boolean; message: string } | null>(null)

  async function fire(op: OperationView) {
    if (op.danger && confirmId !== op.id) {
      setConfirmId(op.id)
      // Auto-clear the confirm state after 5s.
      window.setTimeout(() => setConfirmId(c => (c === op.id ? null : c)), 5000)
      return
    }
    setConfirmId(null)
    setBusyId(op.id)
    setLastResult(null)
    try {
      const res = await fetch('/api/admin/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op_id: op.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setLastResult({ id: op.id, ok: false, message: json?.message || json?.error || 'failed' })
      } else {
        const job = json.job ?? {}
        setLastResult({
          id: op.id,
          ok: job.status === 'success',
          message: summariseResult(job),
        })
        onJobFired()
      }
    } catch (err: any) {
      setLastResult({ id: op.id, ok: false, message: err?.message || 'network error' })
    } finally {
      setBusyId(null)
    }
  }

  const grouped = CATEGORY_ORDER
    .map(cat => ({ cat, items: operations.filter(o => o.category === cat) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <p className="text-[13px] font-semibold text-gray-900">One-click operations</p>
        <span className="text-[11px] text-gray-400">· {operations.length}</span>
      </div>
      <div className="p-3 space-y-4">
        {grouped.map(g => (
          <div key={g.cat}>
            <p className={`text-[10.5px] uppercase tracking-widest font-medium px-2 py-0.5 rounded inline-block border mb-2 ${CATEGORY_ACCENT[g.cat]}`}>
              {g.cat}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {g.items.map(op => {
                const isBusy   = busyId === op.id
                const inConfirm = confirmId === op.id
                const result    = lastResult?.id === op.id ? lastResult : null
                return (
                  <button
                    key={op.id}
                    onClick={() => fire(op)}
                    disabled={isBusy}
                    title={op.description}
                    className={`text-left p-3 rounded-lg border transition group ${
                      inConfirm
                        ? 'border-red-300 bg-red-50'
                        : op.danger
                          ? 'border-orange-100 hover:border-orange-200 bg-white'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-start gap-2">
                      <KindIcon kind={op.kind} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium text-gray-900 leading-snug">
                          {op.label}
                          {op.danger && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-orange-600 font-semibold">Destructive</span>}
                        </p>
                        {inConfirm
                          ? <p className="text-[11px] text-red-600 mt-1 font-medium">Click again to confirm — this sends emails.</p>
                          : <p className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">{op.description}</p>}
                        {result && (
                          <p className={`text-[11px] mt-1.5 font-medium ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                            {result.ok ? '✓' : '✗'} {result.message}
                          </p>
                        )}
                      </div>
                      {isBusy && (
                        <span className="block h-3 w-3 mt-1 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


function summariseResult(job: any): string {
  if (job.status !== 'success') return job.error || 'failed'
  const out = job.output
  if (!out || typeof out !== 'object') return `done in ${job.duration_ms ?? '?'}ms`
  // Quote the most informative single number out of the result.
  for (const k of ['updated', 'count', 'total', 'inserted', 'queued']) {
    if (typeof out[k] === 'number') return `${k}: ${out[k].toLocaleString()} · ${job.duration_ms ?? '?'}ms`
    if (typeof out[k] === 'boolean' && out[k]) return `${k}: yes · ${job.duration_ms ?? '?'}ms`
  }
  return `done in ${job.duration_ms ?? '?'}ms`
}


function KindIcon({ kind }: { kind: string }) {
  const path = (() => {
    if (kind === 'edge')    return 'M13 10V3L4 14h7v7l9-11h-7z'
    if (kind === 'scraper') return 'M3 7h18M3 12h18M3 17h18'
    if (kind === 'sql')     return 'M4 6c0 1.105 3.582 2 8 2s8-.895 8-2M4 6c0-1.105 3.582-2 8-2s8 .895 8 2m0 0v12c0 1.105-3.582 2-8 2s-8-.895-8-2V6'
    return 'M21 21l-4.35-4.35M11 17a6 6 0 100-12 6 6 0 000 12z'
  })()
  return (
    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5 group-hover:text-gray-700 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}
