// apps/web/app/page.tsx
// Phase 5.2 — AI-first landing on the existing light theme.
//
// Single prompt input as the hero, suggestion chips below. No dashboard.
// Same palette/typography as /search and /analytics so the brand stays
// consistent across pages.

import Link from 'next/link'
import { Suspense } from 'react'
import { LandingPrompt } from '@/components/ai/LandingPrompt'

export const metadata = {
  title: 'OffplanIQ — Ask anything about UAE off-plan property',
  description: 'AI-first property intelligence for UAE off-plan investors. Ask in plain English.',
}

const SUGGESTIONS = [
  "Highest-velocity Dubai projects under AED 2M handing over before Q3 2027",
  "Compare Emaar Beachfront and Damac Lagoons",
  "What's launched this week?",
  "Best 1BR by a top-quartile developer in JVC",
  "Estimate IRR if Creek Bay exits at 4,000 PSF in 4 years",
  "Sobha projects with the lowest sell-through stall risk",
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
      {/* minimal chrome — brand + sign-in */}
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
          <Link
            href="/auth/login"
            className="text-sm text-gray-500 hover:text-gray-900 px-3 py-2 transition"
          >
            Sign in
          </Link>
          <Link
            href="/auth/register"
            className="text-sm text-white bg-gray-900 hover:bg-gray-700 px-4 py-2 rounded-lg transition"
          >
            Start free
          </Link>
        </nav>
      </header>

      {/* hero */}
      <main className="max-w-3xl mx-auto px-6 pt-20 pb-24 text-center fade-in">
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
              key={s}
              href={`/auth/login?seed=${encodeURIComponent(s)}`}
              className="text-[12.5px] text-gray-600 bg-white border border-gray-200 hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50 px-3.5 py-2 rounded-full transition"
            >
              {s}
            </Link>
          ))}
        </div>
      </main>

      {/* proof points */}
      <section className="max-w-3xl mx-auto px-6 pb-12 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
        {PROOF.map(s => (
          <div key={s.l} className="border-t border-gray-100 pt-4">
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
