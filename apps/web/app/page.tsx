// apps/web/app/page.tsx
// AI-first landing on the existing light theme.
//
// Layout: hero prompt + suggestion chips → capabilities row → trending strip
// (live project updates) → proof points → footer. Single brand, single
// palette. Suggestion chips cover all four surfaces — Ask, Compare, IRR,
// Insights — so first-time visitors see the breadth without scrolling.

import Link from 'next/link'
import { Suspense } from 'react'
import { LandingPrompt } from '@/components/ai/LandingPrompt'
import { TrendingStrip } from '@/components/ai/TrendingStrip'

export const metadata = {
  title: 'OffplanIQ — Ask anything about UAE off-plan property',
  description: 'AI-first property intelligence for UAE off-plan investors. Ask in plain English.',
}

const SUGGESTIONS: Array<{ label: string; tag: 'ask'|'compare'|'irr'|'insights' }> = [
  { label: 'Highest-velocity Dubai projects under AED 2M handing over before Q3 2027', tag: 'ask' },
  { label: 'Compare Emaar Beachfront and Damac Lagoons',                                 tag: 'compare' },
  { label: "What's launched this week",                                                  tag: 'ask' },
  { label: 'Estimate IRR if Creek Bay exits at 4,000 PSF in 4 years',                    tag: 'irr' },
  { label: 'Top 15 areas by average score with project count',                           tag: 'insights' },
  { label: 'Active projects per developer tier with avg sell-through',                   tag: 'insights' },
  { label: 'Sobha projects with the lowest sell-through stall risk',                     tag: 'ask' },
]

const CAPABILITIES = [
  {
    title: 'Ask',
    desc:  'Plain English. Cited answers from live data.',
    href:  '/auth/login?next=/',
    path:  'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  },
  {
    title: 'Search',
    desc:  'Faceted browse. Smart-search any natural query.',
    href:  '/auth/login?next=/search',
    path:  'M21 21l-4.35-4.35M11 17a6 6 0 100-12 6 6 0 000 12z',
  },
  {
    title: 'Insights',
    desc:  'Text-to-SQL over your data. SQL-native answers, with charts.',
    href:  '/auth/login?next=/insights',
    path:  'M3 3v18h18M7 14l4-4 4 4 4-8',
  },
  {
    title: 'IRR',
    desc:  'Annualised return for any payment plan and exit assumption.',
    href:  '/auth/login?next=/',
    path:  'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V5m0 14v-1m0-2c-2.21 0-4-1.79-4-4',
  },
]

const PROOF = [
  { v: 'T+1',           l: 'DLD freshness' },
  { v: 'Brochure-cited', l: 'Every claim' },
  { v: 'Real-time',     l: 'Launches & moves' },
  { v: 'AED',           l: 'Native currency' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <rect x="2"  y="14" width="6" height="16" rx="1.5" fill="#007AFF" opacity=".4"/>
            <rect x="10" y="8"  width="6" height="22" rx="1.5" fill="#007AFF" opacity=".6"/>
            <rect x="18" y="2"  width="6" height="28" rx="1.5" fill="#007AFF"/>
            <rect x="26" y="10" width="6" height="20" rx="1.5" fill="#007AFF" opacity=".5"/>
          </svg>
          <span className="text-[15px] font-bold text-gray-900">
            Offplan<span className="text-blue-600">IQ</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-900 px-3 py-2 transition">Sign in</Link>
          <Link href="/auth/register" className="text-sm text-white bg-gray-900 hover:bg-gray-700 px-4 py-2 rounded-lg transition">Start free</Link>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 pt-16 sm:pt-20 pb-12 text-center fade-in">
        <p className="section-label mb-5">UAE OFF-PLAN INTELLIGENCE</p>

        <h1 className="text-[40px] sm:text-[52px] font-medium text-gray-900 leading-[1.1] tracking-tight mb-5">
          The market knows.<br />
          <span className="text-gray-400">Now you do, too.</span>
        </h1>

        <p className="text-[15px] text-gray-500 max-w-xl mx-auto mb-12 leading-relaxed">
          Ask in plain English. Grounded in DLD transactions, developer brochures
          and live PSF data. Every answer cited, every number sourced.
        </p>

        <Suspense fallback={null}>
          <LandingPrompt />
        </Suspense>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2 stagger">
          {SUGGESTIONS.map(s => (
            <Link
              key={s.label}
              href={`/auth/login?seed=${encodeURIComponent(s.label)}${s.tag === 'insights' ? '&next=/insights' : ''}`}
              className="text-[12.5px] text-gray-600 bg-white border border-gray-200 hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50 px-3.5 py-2 rounded-full transition"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </main>

      <section className="max-w-5xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CAPABILITIES.map(c => (
            <Link
              key={c.title}
              href={c.href}
              className="group block bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 transition"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={c.path} />
                </svg>
              </div>
              <p className="text-[13.5px] font-semibold text-gray-900 group-hover:text-blue-600 transition">{c.title}</p>
              <p className="text-[12px] text-gray-500 mt-1 leading-snug">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Live "what just moved" */}
      <Suspense fallback={null}>
        <TrendingStrip />
      </Suspense>

      <section className="max-w-3xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center border-t border-gray-100">
        {PROOF.map(s => (
          <div key={s.l}>
            <p className="text-xl font-medium text-gray-900 tracking-tight">{s.v}</p>
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mt-1">{s.l}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-gray-100 py-6 text-center">
        <p className="text-[11px] text-gray-400 tracking-wide">
          © {new Date().getFullYear()} OffplanIQ · Dubai
        </p>
      </footer>
    </div>
  )
}
