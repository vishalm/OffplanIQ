// apps/web/app/page.tsx
// Public landing page — the first thing a visitor sees
// Keep it brutally simple: headline, 3 benefits, one CTA

import Link from 'next/link'

const features = [
  {
    title: 'Live PSF tracker',
    desc: 'Price-per-sqft history for every Dubai off-plan project. Updated daily from DLD transaction records.',
  },
  {
    title: 'IRR calculator',
    desc: 'Compare every payment plan side by side as real annualised returns. See exactly what you\'re getting.',
  },
  {
    title: 'Developer scorecards',
    desc: 'On-time delivery rate, RERA complaints, historical ROI. Every developer scored 0 to 100.',
  },
  {
    title: 'Sell-through velocity',
    desc: 'Know how fast units are actually selling. Slow sell-through = developer pressure = your negotiation leverage.',
  },
  {
    title: 'Score alerts',
    desc: 'Get notified the moment a project you\'re watching drops or rises in score. Never miss a move.',
  },
  {
    title: 'Sunday digest',
    desc: 'One email every Sunday with your watchlist moves, new launches, and market PSF snapshot.',
  },
]

const stats = [
  { value: '142+', label: 'Active projects tracked' },
  { value: 'AED 498B', label: 'Transactions covered (9m 2025)' },
  { value: 'T+1', label: 'DLD data freshness' },
  { value: '0 to 100', label: 'Transparent project scoring' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <span className="text-lg font-medium text-gray-900">OffplanIQ</span>
        <div className="flex items-center gap-4">
          <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-900">Sign in</Link>
          <Link
            href="/auth/register"
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition"
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-4">
          Dubai · Off-plan intelligence
        </p>
        <h1 className="text-5xl font-medium text-gray-900 leading-tight mb-6">
          What Bloomberg is to stocks,<br />
          OffplanIQ is to Dubai off-plan
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10">
          Live PSF tracking, sell-through velocity, IRR calculators and developer scorecards
          for every active Dubai off-plan project. Built for serious investors.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/auth/register"
            className="bg-gray-900 text-white px-8 py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition"
          >
            Start free, no card needed
          </Link>
          <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-900">
            Sign in →
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-gray-50 py-10">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-4 gap-6">
            {stats.map(s => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-medium text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-medium text-gray-900 text-center mb-12">
          Every number an investor needs
        </h2>
        <div className="grid grid-cols-3 gap-6">
          {features.map(f => (
            <div key={f.title} className="border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing CTA */}
      <section className="bg-gray-900 py-16">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-medium text-white mb-4">
            Start free. Upgrade when it pays for itself.
          </h2>
          <p className="text-gray-400 text-sm mb-8">
            Free plan gives you the top 20 projects. Investor plan (AED 750/mo) unlocks everything.
            One good investment decision pays for years of subscription.
          </p>
          <Link
            href="/auth/register"
            className="inline-block bg-white text-gray-900 px-8 py-3 rounded-xl text-sm font-medium hover:bg-gray-100 transition"
          >
            Create free account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 text-center">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} OffplanIQ · Dubai, UAE ·{' '}
          <a href="mailto:hello@offplaniq.com" className="underline">hello@offplaniq.com</a>
        </p>
      </footer>

    </div>
  )
}
