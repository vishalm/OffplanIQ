'use client'

// apps/web/components/ai/LandingPrompt.tsx
// The single full-bleed prompt input that owns the landing page hero.
// Submitting POSTs to /api/threads:
//   - signed-in: server creates a thread, persists the first user message,
//                returns { thread_id }; we navigate to /ask/[id].
//   - anon:      server returns 401; we redirect to /auth/login with the
//                prompt preserved as ?seed=... so the input is hydrated
//                after login.

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export function LandingPrompt() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const seed = searchParams?.get('seed') ?? ''

  const [value, setValue] = useState(seed)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus on mount so visitors can just start typing.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-grow textarea up to ~5 lines.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [value])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const prompt = value.trim()
    if (!prompt || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (res.status === 401) {
        router.push(`/auth/login?seed=${encodeURIComponent(prompt)}`)
        return
      }
      const json = await res.json()
      if (!res.ok || !json.thread_id) {
        throw new Error(json?.error || 'Could not start thread.')
      }
      router.push(`/ask/${json.thread_id}`)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
      setSubmitting(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative mx-auto max-w-2xl flex items-end gap-2 p-2 pl-5 bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:border-blue-400 focus-within:shadow-md transition"
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about projects, prices, developers, IRR…"
        rows={1}
        disabled={submitting}
        className="flex-1 bg-transparent outline-none resize-none text-[15px] leading-7 py-2 max-h-[180px] text-gray-900 placeholder:text-gray-400 disabled:opacity-50"
        aria-label="Ask about UAE off-plan property"
      />
      <button
        type="submit"
        disabled={submitting || !value.trim()}
        className="shrink-0 h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition"
        aria-label="Send"
      >
        {submitting ? (
          <span className="block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        )}
      </button>
      {error && (
        <span className="absolute -bottom-7 left-0 right-0 text-center text-[12px] text-red-500">{error}</span>
      )}
    </form>
  )
}
