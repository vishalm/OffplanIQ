'use client'

// apps/web/components/admin/CopilotPanel.tsx
//
// Conversational ops console. Each user turn POSTs to /api/admin/copilot,
// the server-side LLM plans + executes a sequence of operations from the
// canonical registry, and the reply summarises what happened. Tool
// invocations render inline as small cards so the admin sees exactly what
// fired and what each returned.

import { useEffect, useRef, useState } from 'react'

interface ProviderInfo {
  name:                 string
  chat_model:           string
  embedding_model:      string | null
  embeddings_available: boolean
}

interface ToolInvocation {
  name:           string
  args:           string
  result_preview: string
}

interface Turn {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  pending?:  boolean
  tools?:    ToolInvocation[]
  error?:    string
}

const SUGGESTIONS = [
  'Snapshot platform stats',
  'Scrape Expo City and rerun scores',
  'Pull the last 7 days of DLD, refresh PSF, then recalc scores',
  'Detect new launches and recompute saved-search deltas',
  'How many active projects do we have, and what changed today?',
]

export function CopilotPanel({
  adminEmail, provider, onJobFired,
}: {
  adminEmail: string
  provider:   ProviderInfo
  onJobFired: () => void
}) {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = inputRef.current; if (!el) return
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [input])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, busy])

  async function ask(message: string) {
    const trimmed = message.trim()
    if (!trimmed || busy) return
    setBusy(true); setError(null); setInput('')

    const userTurn: Turn = { id: `u-${Date.now()}`, role: 'user', content: trimmed }
    const pendingTurn: Turn = { id: `a-${Date.now()}`, role: 'assistant', content: '', pending: true }
    setTurns(prev => [...prev, userTurn, pendingTurn])

    // Build a compact history (last 10 user/assistant turns) to send back.
    const history = [...turns, userTurn]
      .filter(t => !t.pending)
      .slice(-10)
      .map(t => ({ role: t.role, content: t.content }))

    try {
      const res = await fetch('/api/admin/copilot', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: trimmed, history: history.slice(0, -1) }),   // exclude the just-sent message
      })
      const json = await res.json()
      if (!res.ok) {
        const msg = json?.message || json?.error || 'Copilot failed.'
        setTurns(prev => prev.map(t => t.id === pendingTurn.id ? { ...t, pending: false, error: msg } : t))
        setError(msg)
      } else {
        setTurns(prev => prev.map(t => t.id === pendingTurn.id ? {
          ...t,
          pending: false,
          content: json.reply || '',
          tools:   json.tool_invocations ?? [],
        } : t))
        if ((json.tool_invocations ?? []).length > 0) onJobFired()
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Network error.'
      setTurns(prev => prev.map(t => t.id === pendingTurn.id ? { ...t, pending: false, error: msg } : t))
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-[78vh] min-h-[560px]">
      <header className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-gray-900">Operations Copilot</p>
          <p className="text-[11.5px] text-gray-500 truncate">
            {provider.name} · {provider.chat_model}{provider.embeddings_available ? ` · embeds: ${provider.embedding_model}` : ' · no embeddings'}
          </p>
        </div>
        <span className="text-[11px] text-gray-400 hidden sm:inline truncate max-w-[180px]">{adminEmail}</span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {turns.length === 0 && (
          <div>
            <p className="text-[13px] text-gray-700 leading-relaxed mb-3">
              Tell me what you need. I can scrape new data, recompute scores, detect launches, send alerts,
              and report platform stats. I'll plan multi-step jobs in order and ask before any destructive action.
            </p>
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">Try one</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={busy}
                  className="text-[12px] text-gray-700 bg-gray-50 border border-gray-200 hover:border-gray-300 hover:bg-white hover:text-gray-900 px-3 py-1.5 rounded-full transition disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map(t => <TurnBubble key={t.id} turn={t} />)}
      </div>

      <form
        onSubmit={e => { e.preventDefault(); ask(input) }}
        className="border-t border-gray-100 p-3"
      >
        <div className="relative flex items-end gap-2 p-2 pl-4 bg-white border border-gray-200 rounded-xl focus-within:border-blue-400 focus-within:shadow-sm transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={busy ? 'Working…' : 'Ask the Copilot to run, recompute, or report'}
            rows={1}
            disabled={busy}
            className="flex-1 bg-transparent outline-none resize-none text-[13.5px] leading-6 py-1.5 max-h-[180px] text-gray-900 placeholder:text-gray-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="shrink-0 h-8 w-8 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition"
          >
            {busy ? (
              <span className="block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        {error && <p className="mt-2 text-[11.5px] text-red-500">{error}</p>}
      </form>
    </div>
  )
}


function TurnBubble({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md text-[13px] leading-relaxed bg-blue-600 text-white whitespace-pre-wrap">
          {turn.content}
        </div>
      </div>
    )
  }

  if (turn.pending) {
    return (
      <div className="flex flex-col items-start gap-2">
        <div className="bg-gray-100 px-3.5 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-2">
          <span className="block h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="block h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '120ms' }} />
          <span className="block h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '240ms' }} />
          <span className="text-[12px] text-gray-500 ml-1">Planning + running ops…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {turn.error ? (
        <div className="max-w-[90%] px-3.5 py-2.5 rounded-2xl rounded-bl-md text-[13px] leading-relaxed bg-red-50 text-red-700 border border-red-100 whitespace-pre-wrap">
          {turn.error}
        </div>
      ) : (
        <div className="max-w-[90%] px-3.5 py-2 rounded-2xl rounded-bl-md text-[13px] leading-relaxed bg-gray-100 text-gray-800 whitespace-pre-wrap">
          {turn.content || '(no reply)'}
        </div>
      )}
      {turn.tools && turn.tools.length > 0 && (
        <div className="w-full max-w-[90%] space-y-1.5">
          {turn.tools.map((t, i) => <ToolPill key={i} t={t} />)}
        </div>
      )}
    </div>
  )
}

function ToolPill({ t }: { t: ToolInvocation }) {
  const opId = t.name.startsWith('op_') ? t.name.slice(3) : t.name
  return (
    <details className="bg-blue-50/60 border border-blue-100 rounded-lg text-[12px]">
      <summary className="px-3 py-1.5 cursor-pointer flex items-center gap-2">
        <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className="font-medium text-blue-900">{opId}</span>
        <span className="text-blue-500/70 truncate flex-1">{t.result_preview}</span>
      </summary>
      <pre className="px-3 pb-2 text-[11px] text-gray-700 whitespace-pre-wrap break-all">
        {`args: ${t.args || '{}'}\nresult: ${t.result_preview}`}
      </pre>
    </details>
  )
}
