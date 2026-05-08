// apps/web/components/project/ProjectNarrative.tsx
// Server Component. Renders the LLM-generated narrative + sentiment chip for a
// project. Quiet empty-state when no narrative exists yet (per "degrade to null,
// not to broken"). Generation happens out-of-band via scripts/generate-insights.mjs.

type Project = {
  narrative?: string | null
  narrative_updated_at?: string | null
  narrative_model?: string | null
  sentiment_score?: number | null
  sentiment_label?: string | null
}

export function ProjectNarrative({ project: p }: { project: Project }) {
  if (!p.narrative) return null

  const updated = p.narrative_updated_at
    ? new Date(p.narrative_updated_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
    : null

  const sentimentChip = (() => {
    const label = p.sentiment_label
    if (!label) return null
    const styles =
      label === 'positive' ? 'bg-green-50 text-green-700 ring-green-200' :
      label === 'negative' ? 'bg-red-50 text-red-700 ring-red-200' :
                             'bg-gray-50 text-gray-600 ring-gray-200'
    return (
      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${styles}`}>
        {label}
      </span>
    )
  })()

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Insight</p>
          {sentimentChip}
        </div>
        <p className="text-[10px] text-gray-400">
          {p.narrative_model ? `Model: ${p.narrative_model}` : null}
          {updated ? <span className="ml-2">Updated {updated}</span> : null}
        </p>
      </div>
      <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap">{p.narrative}</p>
      <p className="mt-3 text-[10px] text-gray-400">
        Generated from project data. Not financial advice.
      </p>
    </div>
  )
}
