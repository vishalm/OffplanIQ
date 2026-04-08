'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  projectData: string // JSON string of project summaries for context
}

export function AiChat({ projectData }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<any>(null)

  // Check Chrome AI availability
  useEffect(() => {
    async function check() {
      try {
        if ('ai' in window && 'languageModel' in (window as any).ai) {
          const caps = await (window as any).ai.languageModel.capabilities()
          setAiAvailable(caps.available === 'readily' || caps.available === 'after-download')
        } else {
          setAiAvailable(false)
        }
      } catch {
        setAiAvailable(false)
      }
    }
    check()
  }, [])

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function getSession() {
    if (sessionRef.current) return sessionRef.current

    const systemPrompt = `You are OffplanIQ Assistant, an expert on UAE off-plan real estate.
You have access to live project data. Answer questions about projects, developers, areas, PSF trends, scores, and investment analysis.
Be concise, data-driven, and specific. Use numbers from the data. Format with bullet points when listing.
When comparing projects, show a clear table-like format.

Current market data:
${projectData}`

    try {
      sessionRef.current = await (window as any).ai.languageModel.create({
        systemPrompt,
        temperature: 0.7,
        topK: 3,
      })
      return sessionRef.current
    } catch (e) {
      console.error('Failed to create AI session:', e)
      return null
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      if (aiAvailable) {
        // Use Chrome built-in AI
        const session = await getSession()
        if (session) {
          const response = await session.prompt(userMsg)
          setMessages(prev => [...prev, { role: 'assistant', content: response }])
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: getFallbackAnswer(userMsg, projectData) }])
        }
      } else {
        // Fallback: smart pattern matching on data
        setMessages(prev => [...prev, { role: 'assistant', content: getFallbackAnswer(userMsg, projectData) }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Try rephrasing your question.' }])
    }
    setLoading(false)
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
      {/* Floating chat button */}
      <button onClick={() => setOpen(!open)}
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

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 w-[400px] h-[560px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.05)' }}>

          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/>
              </svg>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-gray-900">OffplanIQ Assistant</p>
              <p className="text-[11px] text-gray-400">
                {aiAvailable ? 'Powered by Chrome AI' : 'Smart data analysis'}
                {aiAvailable && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 ml-1.5 align-middle" />}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div>
                <p className="text-[13px] text-gray-500 mb-4">Ask me anything about UAE off-plan projects, areas, developers, or investment analysis.</p>
                <div className="space-y-1.5">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => { setInput(s); }}
                      className="w-full text-left text-[12px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
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

          {/* Input */}
          <div className="p-3 border-t border-gray-100">
            <form onSubmit={e => { e.preventDefault(); handleSend() }} className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                placeholder="Ask about projects, areas, returns..."
                className="flex-1 text-[13px] border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                disabled={loading}
              />
              <button type="submit" disabled={loading || !input.trim()}
                className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white flex items-center justify-center transition-colors shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// Fallback NLU when Chrome AI is not available
function getFallbackAnswer(query: string, dataJson: string): string {
  const q = query.toLowerCase()
  let data: any[] = []
  try { data = JSON.parse(dataJson) } catch { return 'I could not process the data. Please try again.' }

  // Best projects
  if (q.includes('best') || q.includes('top') || q.includes('invest')) {
    const top = data.filter(p => p.score).sort((a, b) => b.score - a.score).slice(0, 5)
    return `Top projects by score:\n\n${top.map((p, i) => `${i + 1}. ${p.name} (Score: ${p.score}) - ${p.area}\n   PSF: AED ${p.psf?.toLocaleString() || '?'} | Sold: ${p.sold || '?'}%`).join('\n\n')}`
  }

  // Compare areas
  if (q.includes('compare') || q.includes(' vs ') || q.includes('versus')) {
    const areas: Record<string, { count: number; psfSum: number; scoreSum: number }> = {}
    for (const p of data) {
      if (!areas[p.area]) areas[p.area] = { count: 0, psfSum: 0, scoreSum: 0 }
      areas[p.area].count++
      areas[p.area].psfSum += p.psf || 0
      areas[p.area].scoreSum += p.score || 0
    }
    const sorted = Object.entries(areas)
      .map(([area, d]) => ({ area, avgPsf: Math.round(d.psfSum / d.count), avgScore: Math.round(d.scoreSum / d.count), count: d.count }))
      .sort((a, b) => b.avgPsf - a.avgPsf).slice(0, 8)
    return `Area comparison:\n\n${sorted.map(a => `${a.area}: Avg PSF AED ${a.avgPsf.toLocaleString()} | Score ${a.avgScore} | ${a.count} projects`).join('\n')}`
  }

  // Developer
  if (q.includes('developer') || q.includes('builder') || q.includes('track record')) {
    const devMap: Record<string, { count: number; scoreSum: number }> = {}
    for (const p of data) {
      const dev = p.developer || 'Unknown'
      if (!devMap[dev]) devMap[dev] = { count: 0, scoreSum: 0 }
      devMap[dev].count++
      devMap[dev].scoreSum += p.score || 0
    }
    const sorted = Object.entries(devMap)
      .map(([name, d]) => ({ name, count: d.count, avgScore: Math.round(d.scoreSum / d.count) }))
      .sort((a, b) => b.avgScore - a.avgScore).slice(0, 8)
    return `Developer rankings by avg project score:\n\n${sorted.map((d, i) => `${i + 1}. ${d.name} - Avg Score: ${d.avgScore} (${d.count} projects)`).join('\n')}`
  }

  // Under price
  const priceMatch = q.match(/under\s+(?:aed\s+)?([\d.]+)\s*m/i) || q.match(/([\d.]+)\s*m/i)
  if (priceMatch || q.includes('cheap') || q.includes('affordable') || q.includes('budget')) {
    const maxPrice = priceMatch ? parseFloat(priceMatch[1]) * 1_000_000 : 1_000_000
    const affordable = data.filter(p => p.minPrice && p.minPrice <= maxPrice).sort((a, b) => (a.minPrice || 0) - (b.minPrice || 0)).slice(0, 5)
    if (affordable.length === 0) return `No projects found under AED ${(maxPrice / 1e6).toFixed(1)}M in our database.`
    return `Projects under AED ${(maxPrice / 1e6).toFixed(1)}M:\n\n${affordable.map((p, i) => `${i + 1}. ${p.name} - from AED ${((p.minPrice || 0) / 1e6).toFixed(2)}M\n   ${p.area} | Score: ${p.score}`).join('\n\n')}`
  }

  // PSF growth
  if (q.includes('psf') || q.includes('growth') || q.includes('appreciation')) {
    const withGrowth = data.filter(p => p.growth != null).sort((a, b) => (b.growth || 0) - (a.growth || 0)).slice(0, 5)
    return `Highest PSF growth:\n\n${withGrowth.map((p, i) => `${i + 1}. ${p.name} - +${p.growth}% growth\n   ${p.area} | Current PSF: AED ${p.psf?.toLocaleString()}`).join('\n\n')}`
  }

  // Delayed
  if (q.includes('delay') || q.includes('avoid') || q.includes('risk')) {
    const delayed = data.filter(p => p.delayed).sort((a, b) => (a.score || 0) - (b.score || 0)).slice(0, 5)
    if (delayed.length === 0) return 'No significantly delayed projects in the current dataset.'
    return `Projects with delays (exercise caution):\n\n${delayed.map((p, i) => `${i + 1}. ${p.name} - Score: ${p.score}\n   ${p.area} | ${p.developer}`).join('\n\n')}`
  }

  // Area specific
  for (const p of data) {
    if (q.includes(p.area?.toLowerCase())) {
      const areaProjects = data.filter(x => x.area === p.area).sort((a, b) => b.score - a.score)
      return `${p.area} (${areaProjects.length} projects):\n\n${areaProjects.slice(0, 5).map((ap, i) => `${i + 1}. ${ap.name} - Score: ${ap.score} | PSF: AED ${ap.psf?.toLocaleString() || '?'}`).join('\n')}`
    }
  }

  return `I can help with:\n\n• Best projects to invest in\n• Area comparisons (e.g. "compare Business Bay vs Downtown")\n• Developer track records\n• Projects under a budget (e.g. "under AED 1M")\n• PSF growth leaders\n• Delayed projects to avoid\n\nTry asking one of these!`
}
