import Link from 'next/link'

interface KPI {
  label: string
  value: string
  sub?: string
  color?: string
  provenance: string
}

interface SignalProject {
  slug: string
  name: string
  detail: string
}

interface Signal {
  tone: 'positive' | 'info' | 'warn'
  label: string
  count: number
  blurb: string
  top?: SignalProject
}

interface Props {
  narrative: string
  kpis: KPI[]
  signals: Signal[]
  asOf: string
}

const TONE_STYLES: Record<Signal['tone'], { dot: string; label: string }> = {
  positive: { dot: 'bg-emerald-500', label: 'text-emerald-700' },
  info:     { dot: 'bg-blue-500',    label: 'text-blue-700' },
  warn:     { dot: 'bg-red-500',     label: 'text-red-700' },
}

export function AIBriefing({ narrative, kpis, signals, asOf }: Props) {
  return (
    <section
      aria-labelledby="ai-briefing-heading"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8"
    >
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-600" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-700">
              AI Briefing
            </p>
          </div>
          <h1
            id="ai-briefing-heading"
            className="mt-3 text-2xl font-semibold leading-tight text-slate-950 md:text-3xl"
          >
            Today&rsquo;s market read
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-600 md:text-[15px]">
            {narrative}
          </p>
        </div>
        <p className="text-[11px] text-slate-400">
          Updated {asOf}
        </p>
      </header>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(k => (
          <div
            key={k.label}
            className="group relative rounded-2xl bg-slate-50 p-4"
            title={k.provenance}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {k.label}
              </p>
              <svg
                className="h-3 w-3 text-slate-300 transition group-hover:text-slate-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-label="How is this calculated?"
              >
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M11 12h1v4h1" />
              </svg>
            </div>
            <p className={`mt-3 text-2xl font-semibold tabular-nums ${k.color ?? 'text-slate-950'}`}>
              {k.value}
              {k.sub && <span className="ml-1 text-sm font-normal text-slate-400">{k.sub}</span>}
            </p>
            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-white shadow-xl group-hover:block">
              {k.provenance}
            </div>
          </div>
        ))}
      </div>

      {signals.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {signals.map(s => {
            const tone = TONE_STYLES[s.tone]
            const inner = (
              <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-teal-400 hover:bg-teal-50/40">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${tone.label}`}>
                    {s.label}
                  </p>
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-950">
                  {s.count}
                </p>
                <p className="mt-1 text-[12px] text-slate-600">{s.blurb}</p>
                {s.top && (
                  <p className="mt-3 truncate text-[12px] text-slate-700">
                    Lead:{' '}
                    <span className="font-semibold text-slate-900">{s.top.name}</span>
                    <span className="text-slate-400"> · {s.top.detail}</span>
                  </p>
                )}
              </div>
            )
            if (s.top) {
              return (
                <Link
                  key={s.label}
                  href={`/projects/${s.top.slug}`}
                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 rounded-2xl"
                >
                  {inner}
                </Link>
              )
            }
            return <div key={s.label}>{inner}</div>
          })}
        </div>
      )}
    </section>
  )
}
