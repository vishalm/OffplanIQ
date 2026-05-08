'use client'

import { useState, useRef, useEffect } from 'react'

interface Source {
  id: string
  title: string | null
  url: string
  doc_type: string
  similarity: number
}

type IngestPreview = {
  phase: 'preview'
  source: 'url' | 'file' | 'text'
  summary: string
  auto_written: number
  written: { developers_created: number; projects_upserted: number; errors: string[] }
  preview: Array<{
    name: string
    area: string | null
    city: string | null
    developer_name: string | null
    total_units: number | null
    min_price_aed: number | null
    starting_psf_aed: number | null
    handover_quarter: string | null
    confidence: number
  }>
  skipped: number
  threshold: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  ingest?: IngestPreview              // attached when this message reports an ingest result
}

function newMessageId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function pluralise(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural
}

// Quick-and-dirty URL detector. We trigger ingest when the entire user input
// is a URL (or a URL + minimal "ingest this please"-style framing). Single-
// URL inputs are the dominant case; multiple-URL inputs go through normal chat.
function detectIngestUrl(text: string): string | null {
  const trimmed = text.trim()
  const m = /^(https?:\/\/[^\s]+)$/.exec(trimmed)
  if (m) return m[1]
  // Allow "ingest <url>" / "scrape <url>"
  const m2 = /^(?:ingest|scrape|fetch|read|absorb|pull)\s+(https?:\/\/[^\s]+)$/i.exec(trimmed)
  return m2 ? m2[1] : null
}

// projectData prop kept for backwards compat with the existing GlobalChat
// caller; the new server-grounded path doesn't use it.
interface Props {
  projectData?: string
}

type WindowSize = 'normal' | 'expanded' | 'minimised'

const WINDOW_DIMS: Record<WindowSize, { w: string; h: string }> = {
  normal:    { w: 'w-[400px]',  h: 'h-[560px]' },
  expanded:  { w: 'w-[640px]',  h: 'h-[80vh]'  },
  minimised: { w: 'w-[260px]',  h: 'h-[44px]'  },
}

export function AiChat(_props: Readonly<Props>) {
  const [open, setOpen] = useState(false)
  const [size, setSize] = useState<WindowSize>('normal')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')

    // URL-only inputs become an ingest, not a chat. The user gets a single
    // preview card with auto-written rows + manual-confirm rows.
    const ingestUrl = detectIngestUrl(userMsg)
    if (ingestUrl) {
      setMessages(prev => [...prev, { id: newMessageId(), role: 'user', content: userMsg }])
      await runIngest({ url: ingestUrl })
      return
    }

    const next: Message[] = [...messages, { id: newMessageId(), role: 'user', content: userMsg }]
    setMessages(next)
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const json = await res.json()
      const reply: string = json.reply ?? 'No reply.'
      const sources: Source[] = Array.isArray(json.sources) ? json.sources : []
      setMessages(prev => [...prev, { id: newMessageId(), role: 'assistant', content: reply, sources }])
    } catch (err) {
      console.warn('AiChat handleSend error:', err)
      setMessages(prev => [...prev, { id: newMessageId(), role: 'assistant', content: 'The assistant is unreachable. Try again in a moment.' }])
    } finally {
      setLoading(false)
    }
  }


  // Send something to /api/ingest. Body is either { url }, { text }, or a
  // multipart with a file. The response renders as one assistant message with
  // an `IngestPreview` card.
  async function runIngest(body: { url?: string; text?: string } | FormData) {
    setLoading(true)
    try {
      const isForm = body instanceof FormData
      const res = await fetch('/api/ingest', {
        method: 'POST',
        ...(isForm ? {} : { headers: { 'Content-Type': 'application/json' } }),
        body: isForm ? body : JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.phase !== 'preview') {
        const msg = json.error ?? `Ingest failed (${res.status}).`
        setMessages(prev => [...prev, { id: newMessageId(), role: 'assistant', content: msg }])
        return
      }
      const ingest: IngestPreview = json
      const projectsLabel = pluralise(ingest.auto_written, 'project', 'projects')
      const devsLabel = pluralise(ingest.written.developers_created, 'developer', 'developers')
      const previewLabel = pluralise(ingest.preview.length, 'project', 'projects')
      const lines: string[] = [
        ingest.summary,
        '',
        `Auto-written: ${ingest.auto_written} ${projectsLabel}`
          + (ingest.written.developers_created ? ` · ${ingest.written.developers_created} new ${devsLabel}` : ''),
        ingest.preview.length
          ? `Needs your confirmation: ${ingest.preview.length} ${previewLabel} (low confidence)`
          : '',
        ingest.skipped ? `Skipped: ${ingest.skipped} (below threshold)` : '',
      ].filter(Boolean)

      setMessages(prev => [...prev, {
        id: newMessageId(),
        role: 'assistant',
        content: lines.join('\n'),
        ingest,
      }])
    } catch (err) {
      console.warn('AiChat runIngest error:', err)
      setMessages(prev => [...prev, {
        id: newMessageId(), role: 'assistant',
        content: 'The ingest service is unreachable. Try again in a moment.',
      }])
    } finally {
      setLoading(false)
    }
  }


  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMessages(prev => [...prev, {
      id: newMessageId(), role: 'user',
      content: `📎 Uploaded ${file.name} (${Math.round(file.size / 1024)} KB)`,
    }])
    const fd = new FormData()
    fd.append('file', file)
    await runIngest(fd)
  }


  async function confirmIngestPreview(messageId: string, accepted: IngestPreview['preview']) {
    if (!accepted.length) return
    setLoading(true)
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send back as the same `ExtractedProject` shape — the preview rows
        // are already in that shape (sans amenities/etc., which the route
        // tolerates as missing).
        body: JSON.stringify({ confirm: { projects: accepted } }),
      })
      const json = await res.json()
      let msg: string
      if (res.ok && json.phase === 'written') {
        const label = pluralise(json.projects_upserted, 'project', 'projects')
        msg = `Wrote ${json.projects_upserted} ${label}.`
      } else {
        msg = `Confirm-write failed: ${json.error ?? res.status}`
      }
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, ingest: { ...m.ingest!, preview: [] }, content: m.content + '\n\n' + msg }
          : m,
      ))
    } catch (err) {
      console.warn('confirmIngestPreview error:', err)
    } finally {
      setLoading(false)
    }
  }

  const suggestions = [
    'Best projects to invest in Dubai?',
    'Compare Business Bay vs Downtown',
    'Which developer has the best track record?',
    'Projects under AED 1M?',
    'Highest PSF growth areas?',
    'Delayed projects to avoid?',
  ]

  return (
    <>
      <button onClick={() => setOpen(!open)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-50 group"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        )}
        {!open && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
        )}
      </button>

      {open && (
        <div
          className={`fixed bottom-24 right-6 ${WINDOW_DIMS[size].w} ${WINDOW_DIMS[size].h} bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden transition-[width,height] duration-200`}
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.05)' }}
        >

          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 truncate">OffplanIQ Assistant</p>
              {size !== 'minimised' && (
                <p className="text-[11px] text-gray-400 truncate">Grounded in your project data · UAE off-plan only</p>
              )}
            </div>
            {/* Window controls */}
            <div className="flex items-center gap-0.5 shrink-0">
              {size === 'minimised' ? (
                <button
                  type="button"
                  onClick={() => setSize('normal')}
                  aria-label="Restore"
                  className="w-7 h-7 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 flex items-center justify-center transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSize('minimised')}
                  aria-label="Minimise"
                  className="w-7 h-7 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 flex items-center justify-center transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                  </svg>
                </button>
              )}
              {size !== 'minimised' && (
                <button
                  type="button"
                  onClick={() => setSize(size === 'expanded' ? 'normal' : 'expanded')}
                  aria-label={size === 'expanded' ? 'Shrink' : 'Expand'}
                  className="w-7 h-7 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 flex items-center justify-center transition"
                >
                  {size === 'expanded' ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    </svg>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-7 h-7 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 flex items-center justify-center transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {size !== 'minimised' && (
          <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div>
                <p className="text-[13px] text-gray-500 mb-4">Ask me anything about UAE off-plan projects, areas, developers, or investment analysis. I only answer from live data — no general knowledge or speculation.</p>
                <div className="space-y-1.5">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => setInput(s)}
                      className="w-full text-left text-[12px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
                {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                  <div className="mt-1.5 max-w-[85%] text-[11px] text-gray-500">
                    <p className="font-medium text-gray-600 mb-1">Sources</p>
                    <ol className="space-y-0.5 list-decimal list-inside">
                      {m.sources.map((s, idx) => (
                        <li key={s.id} className="truncate">
                          <a href={s.url} target="_blank" rel="noreferrer noopener"
                            className="text-blue-600 hover:underline">
                            [{idx + 1}] {s.title || new URL(s.url).hostname}
                          </a>
                          <span className="text-gray-400 ml-1">· {s.doc_type}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {m.role === 'assistant' && m.ingest && m.ingest.preview.length > 0 && (
                  <IngestPreviewCard
                    msgId={m.id}
                    preview={m.ingest.preview}
                    onConfirm={(approved) => confirmIngestPreview(m.id, approved)}
                    busy={loading}
                  />
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-100">
            <form onSubmit={e => { e.preventDefault(); handleSend() }} className="flex items-center gap-2">
              {/* Attachment — hidden input, button triggers it. CSV/TXT/JSON
                  are accepted out of the box; the API also tolerates anything
                  else readable as text. */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.json,.md,.tsv,text/plain,text/csv,application/json"
                onChange={handleFileSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                aria-label="Attach file"
                title="Attach a CSV / JSON / text file to ingest into your project catalogue"
                className="w-9 h-9 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-500 hover:text-gray-900 flex items-center justify-center shrink-0 disabled:opacity-50 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <input value={input} onChange={e => setInput(e.target.value)}
                placeholder="Ask, or paste a URL to ingest…"
                className="flex-1 text-[13px] border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                disabled={loading}
              />
              <button type="submit" disabled={loading || !input.trim()}
                aria-label="Send"
                className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white flex items-center justify-center transition-colors shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </form>
            {/* Sample-template helper. Lets a user grab the exact CSV shape the
                ingest expects, so they can pre-format their data and get
                clean, high-confidence extractions. */}
            <p className="mt-1.5 text-[10.5px] text-gray-400">
              Drop a CSV/JSON, paste a URL, or type a question.
              {' '}
              <a href="/api/ingest" download className="text-blue-600 hover:underline">
                Download sample CSV →
              </a>
            </p>
          </div>
          </>
          )}
        </div>
      )}
    </>
  )
}


// ─── Ingest preview card ─────────────────────────────────────
// Renders the LLM's lower-confidence extractions as checkboxes so the user
// can pick which rows actually get written. High-confidence rows already
// auto-wrote on the server before this card was rendered.

interface IngestPreviewCardProps {
  msgId: string
  preview: IngestPreview['preview']
  onConfirm: (approved: IngestPreview['preview']) => void
  busy: boolean
}

function IngestPreviewCard({ preview, onConfirm, busy }: Readonly<IngestPreviewCardProps>) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(preview.map((_, i) => i)),
  )

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function approve() {
    const approved = preview.filter((_, i) => selected.has(i))
    if (approved.length) onConfirm(approved)
  }

  return (
    <div className="mt-2 max-w-[100%] w-full bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
        Confirm to write ({preview.length})
      </p>
      <ul className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
        {preview.map((p, i) => {
          const checked = selected.has(i)
          const subtitle = [p.area, p.city, p.developer_name].filter(Boolean).join(' · ')
          const conf = Math.round(p.confidence * 100)
          return (
            <li key={`${p.name}-${i}`} className="flex items-start gap-2 text-[12px] leading-snug">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(i)}
                aria-label={`Include ${p.name}`}
                className="mt-0.5 accent-blue-600"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{p.name}</p>
                {subtitle && <p className="text-gray-500 truncate">{subtitle}</p>}
              </div>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                conf >= 50 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {conf}%
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={busy || selected.size === 0}
          className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-200 disabled:text-gray-400 transition"
        >
          Write {selected.size} to catalogue
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          disabled={busy}
          className="text-[11.5px] text-gray-500 hover:text-gray-900 transition"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
