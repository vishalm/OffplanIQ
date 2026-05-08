'use client'

// apps/web/components/ai/Conversation.tsx
// Phase 5.3 + 5.5 — renders the conversation history and runs the next
// assistant turn via POST /api/threads/:id. Tool results are rendered as
// inline cards (Phase 5.5) instead of raw JSON.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ToolResultCard } from '@/components/ai/ToolResultCard'

type Source = { id?: string; title: string | null; url: string; doc_type: string; similarity: number }

type Message = {
  id?: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string | null
  sources?: Source[] | null
  tool_name?: string | null
  tool_args?: any
  tool_result?: any
  iterations?: number | null
  created_at?: string
  pending?: boolean   // local-only: true while we wait for the assistant
}

interface Props {
  threadId: string
  threadTitle: string
  initialMessages: Message[]
}

export function Conversation({ threadId, threadTitle, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Auto-grow input.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [input])

  // Run the assistant turn for the trailing user message if there's no
  // assistant response after it (handles the post-create case where the
  // landing page persisted the user message but didn't run the model).
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last && last.role === 'user' && !sending) {
      runAssistant('')   // empty prompt = "use last user message in DB"
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  async function runAssistant(promptToAppend: string) {
    setSending(true)
    setError(null)

    // Optimistic UI: if we have a fresh user prompt, append it immediately.
    if (promptToAppend.trim()) {
      setMessages(prev => [...prev, { role: 'user', content: promptToAppend.trim() }])
    }
    setMessages(prev => [...prev, { role: 'assistant', content: '', pending: true }])

    try {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptToAppend }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'chat_failed')

      const toolMessages: Message[] = (json.tool_invocations ?? []).map((t: any) => ({
        role: 'tool' as const,
        tool_name: t.name,
        tool_args: t.args,
        tool_result: t.result,
        content: null,
      }))

      setMessages(prev => {
        const trimmed = prev.filter(m => !m.pending)
        return [
          ...trimmed,
          ...toolMessages,
          { role: 'assistant', content: json.reply || '', sources: json.sources ?? [], iterations: json.iterations ?? 0 },
        ]
      })
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
      setMessages(prev => prev.filter(m => !m.pending))
    } finally {
      setSending(false)
    }
  }


  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleSend() {
    const prompt = input.trim()
    if (!prompt || sending) return
    setInput('')
    await runAssistant(prompt)
  }


  return (
    <div className="flex flex-col h-screen">
      {/* header */}
      <header className="border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 shrink-0" aria-label="New conversation">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-[13px]">New</span>
          </Link>
          <span className="w-px h-4 bg-gray-200" />
          <h1 className="text-[14px] font-medium text-gray-900 truncate">{threadTitle}</h1>
        </div>
        <Link href="/search" className="text-[13px] text-gray-500 hover:text-gray-900 transition shrink-0">
          Browse all →
        </Link>
      </header>

      {/* conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {messages.map((m, i) => <MessageBubble key={m.id ?? i} m={m} />)}
          {sending && messages.every(m => !m.pending) && (
            <div className="flex justify-start">
              <ThinkingDots />
            </div>
          )}
        </div>
      </div>

      {/* input */}
      <div className="border-t border-gray-100 px-4 sm:px-6 py-4">
        <form
          onSubmit={e => { e.preventDefault(); handleSend() }}
          className="max-w-3xl mx-auto relative flex items-end gap-2 p-2 pl-5 bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:border-blue-400 focus-within:shadow-md transition"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={sending ? 'Working…' : 'Ask a follow-up'}
            rows={1}
            disabled={sending}
            className="flex-1 bg-transparent outline-none resize-none text-[14px] leading-6 py-2 max-h-[180px] text-gray-900 placeholder:text-gray-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="shrink-0 h-9 w-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
        </form>
        {error && <p className="max-w-3xl mx-auto mt-2 text-[12px] text-red-500">{error}</p>}
      </div>
    </div>
  )
}


function MessageBubble({ m }: { m: Message }) {
  if (m.role === 'tool') {
    return <ToolResultCard name={m.tool_name || 'tool'} args={m.tool_args} result={m.tool_result} />
  }

  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md text-[14px] leading-relaxed bg-blue-600 text-white whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    )
  }

  // assistant
  if (m.pending) {
    return <div className="flex justify-start"><ThinkingDots /></div>
  }
  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[90%] px-4 py-2.5 rounded-2xl rounded-bl-md text-[14px] leading-relaxed bg-gray-100 text-gray-800 whitespace-pre-wrap">
        {m.content || '(no reply)'}
      </div>
      {m.sources && m.sources.length > 0 && <SourcesList sources={m.sources} />}
    </div>
  )
}


function SourcesList({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-2 max-w-[90%] text-[12px] text-gray-500">
      <p className="font-medium text-gray-600 mb-1">Sources</p>
      <ol className="space-y-0.5 list-decimal list-inside">
        {sources.map((s, i) => (
          <li key={s.id ?? i} className="truncate">
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-blue-600 hover:underline"
            >
              [{i + 1}] {s.title || tryHostname(s.url)}
            </a>
            <span className="text-gray-400 ml-1">· {s.doc_type}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}


function ThinkingDots() {
  return (
    <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}


function tryHostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}
