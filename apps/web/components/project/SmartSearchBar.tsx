'use client'

// apps/web/components/project/SmartSearchBar.tsx
//
// The natural-language search bar that sits above the faceted filter sidebar.
// Submitting POSTs to /api/search/nl, which returns a {params} object the
// client merges into the URL — letting the existing /search page server
// component re-render with those filters applied.
//
// The bar also surfaces "what we understood" pills so users can see why
// their query mapped the way it did, and clear individual filters.

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const EXAMPLES = [
  'Highest-velocity Dubai projects under 2M handing over before Q3 2027',
  'Best 1BR by a top-quartile developer in JVC',
  'Sobha towers in Business Bay near handover',
  'Ras Al Khaimah villas above 60 score',
]

export function SmartSearchBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [explained, setExplained] = useState<Record<string, string> | null>(null)

  async function run(query: string) {
    const q = query.trim()
    if (!q || busy) return
    setBusy(true)
    setExplained(null)
    try {
      const res = await fetch('/api/search/nl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const json = await res.json()
      if (!res.ok) {
        applyParams({ q })
        return
      }
      applyParams(json.params || { q })
      setExplained(json.params || null)
    } catch {
      applyParams({ q })
    } finally {
      setBusy(false)
    }
  }

  function applyParams(params: Record<string, string>) {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    router.push(`/search${sp.toString() ? `?${sp.toString()}` : ''}`)
  }

  function clearAll() {
    setValue('')
    setExplained(null)
    router.push('/search')
  }

  const activeKeys = Array.from(searchParams?.keys() ?? [])

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 mb-5 shadow-sm">
      <form onSubmit={e => { e.preventDefault(); run(value) }} className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 11a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Describe what you want — “Dubai 2BR under 2M, top developer, near handover”"
          disabled={busy}
          className="flex-1 bg-transparent outline-none text-[14px] text-gray-900 placeholder:text-gray-400 px-1 disabled:opacity-50"
        />
        {activeKeys.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="hidden sm:inline-block text-[12px] text-gray-500 hover:text-gray-900 px-2 py-1 transition"
          >
            Clear all
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="shrink-0 h-9 px-4 rounded-lg bg-gray-900 hover:bg-gray-700 disabled:bg-gray-200 text-white disabled:text-gray-400 disabled:cursor-not-allowed text-[13px] font-medium flex items-center gap-1.5 transition"
        >
          {busy ? (
            <>
              <span className="block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>Working</span>
            </>
          ) : (
            <>
              <span>Smart search</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </form>

      {!explained && value === '' && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-widest text-gray-400 mr-1">Try</span>
          {EXAMPLES.map(s => (
            <button
              key={s}
              onClick={() => { setValue(s); run(s) }}
              disabled={busy}
              className="text-[11.5px] text-gray-600 bg-gray-50 border border-gray-200 hover:border-gray-300 hover:bg-white hover:text-gray-900 px-2.5 py-1 rounded-full transition disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {explained && Object.keys(explained).length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-widest text-gray-400 mr-1">Understood as</span>
          {Object.entries(explained).map(([k, v]) => (
            <span key={k} className="text-[11.5px] text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
              <span className="font-medium">{k}</span>
              <span className="text-blue-400 mx-1">·</span>
              <span>{prettyVal(k, v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function prettyVal(key: string, val: string): string {
  if (key === 'price' || key === 'psf') {
    const [lo, hi] = val.split('-').map(Number)
    return `${formatRange(lo, key === 'price')} – ${formatRange(hi, key === 'price')}`
  }
  return val
}

function formatRange(n: number, isAed: boolean): string {
  if (!Number.isFinite(n)) return String(n)
  const prefix = isAed ? 'AED ' : ''
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${prefix}${Math.round(n / 1_000)}K`
  return `${prefix}${n}`
}
