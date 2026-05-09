'use client'

// apps/web/components/insights/InsightsBoard.tsx
//
// The conversational text-to-SQL UI. Each user question becomes one
// InsightCard with three tabs: Result (chart or table), SQL, and Plan.
// We keep history client-side only — every question is a stateless POST.

import { useEffect, useRef, useState } from 'react'
import { InsightCard, type InsightTurn } from './InsightCard'

const SUGGESTIONS: Array<{ label: string; prompt: string }> = [
  { label: 'Top areas by avg score',         prompt: 'Top 15 Dubai areas ranked by average project score, with project count.' },
  { label: 'Active inventory by tier',       prompt: 'How many active projects per developer tier, with average sell-through?' },
  { label: 'Slipping handovers',             prompt: 'Active projects with handover delay greater than 90 days, sorted by delay descending.' },
  { label: 'PSF leaders',                    prompt: 'Top 20 active projects by current PSF, show name, area, developer and PSF.' },
  { label: 'Best value 1BR',                 prompt: 'Active 1BR projects under AED 1.5M with score above 60, sorted by score.' },
  { label: "What's launched recently",       prompt: 'Project_updates of type launch in the last 60 days, with project name and area.' },
  { label: 'Sobha vs Emaar headcount',       prompt: 'Active project count and average score for Emaar Properties and Sobha Realty.' },
  { label: 'Cheapest sub-2M studios',        prompt: 'Active studio projects under AED 2M sorted by min_price ascending, top 25.' },
]

export function InsightsBoard({ tier }: { tier: string }) {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<InsightTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const el = inputRef.current; if (!el) return
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [turns.length, busy])

  async function ask(q: string) {
    const question = q.trim()
    if (!question || busy) return
    setBusy(true); setError(null); setInput('')

    const pendingId = `t-${Date.now()}`
    setTurns(prev => [...prev, { id: pendingId, question, pending: true }])

    try {
      const res = await fetch('/api/insights/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const json = await res.json()
      if (!res.ok) {
        const msg = json?.message || json?.error || 'Query failed.'
        setTurns(prev => prev.map(t => t.id === pendingId ? { ...t, pending: false, error: msg } : t))
      } else {
        setTurns(prev => prev.map(t => t.id === pendingId ? {
          ...t,
          pending: false,
          summary:    json.summary,
          sql:        json.sql,
          plan:       json.plan,
          columns:    json.columns,
          rows:       json.rows,
          chart_hint: json.chart_hint,
          totals:     json.totals,
        } : t))
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error.'
      setTurns(prev => prev.map(t => t.id === pendingId ? { ...t, pending: false, error: msg } : t))
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); ask(input)
    }
  }

  const empty = turns.length === 0

  return (
    <div className="space-y-6">
      {empty && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-7">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M9 6h6M9 18h6M5 6.01M5 18.01" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-gray-900">Conversational SQL — over your live data</p>
              <p className="text-[13px] text-gray-500 mt-1">
                Ask the question; we generate a safe query plan, run it against your projects, developers, and update log,
                then show you the SQL we used and a chart of the answer. Read-only — nothing in your data ever changes.
              </p>
            </div>
          </div>
          <p className="text-[11px] uppercase tracking-widest text-gray-400 mt-5 mb-2">Try one</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s.prompt}
                onClick={() => ask(s.prompt)}
                disabled={busy}
                className="text-[12.5px] text-gray-700 bg-gray-50 border border-gray-200 hover:border-gray-300 hover:bg-white hover:text-gray-900 px-3.5 py-2 rounded-full transition disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {turns.map(t => <InsightCard key={t.id} turn={t} />)}
        <div ref={endRef} />
      </div>

      {error && !busy && (
        <p className="text-[12px] text-red-500 text-center">{error}</p>
      )}

      <form
        onSubmit={e => { e.preventDefault(); ask(input) }}
        className="sticky bottom-4 sm:bottom-6 z-10 mt-6 mx-auto max-w-3xl"
      >
        <div className="relative flex items-end gap-2 p-2 pl-5 bg-white border border-gray-200 rounded-2xl shadow-lg focus-within:border-blue-400 focus-within:shadow-xl transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={busy ? 'Running…' : empty ? 'Ask anything: averages, top-N, comparisons, recent moves…' : 'Ask another question'}
            rows={1}
            disabled={busy}
            className="flex-1 bg-transparent outline-none resize-none text-[14px] leading-7 py-2 max-h-[200px] text-gray-900 placeholder:text-gray-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Run query"
            className="shrink-0 h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition"
          >
            {busy ? (
              <span className="block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        {tier === 'free' && empty && (
          <p className="mt-2 text-center text-[11px] text-gray-400">
            Free plan: 30 questions per minute. Heavier aggregates may sample.
          </p>
        )}
      </form>
    </div>
  )
}
