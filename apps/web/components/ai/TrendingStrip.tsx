// apps/web/components/ai/TrendingStrip.tsx
// Server Component — small "what's moving right now" strip on the landing
// page. Pulls recent project_updates so the page is alive without requiring
// auth. Failure is silent: if the RPC isn't available yet (or the table is
// empty) the strip just doesn't render.

import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'

interface UpdateRow {
  change_type:  string
  field?:       string | null
  before_value: any
  after_value:  any
  delta_pct:    number | null
  detected_at:  string
  project_name?: string | null
  project_slug?: string | null
}

const TYPE_LABEL: Record<string, string> = {
  launch:              'Launched',
  price_change:        'PSF moved',
  handover_change:     'Handover shift',
  units_change:        'Inventory move',
  description_change:  'Updated',
  amenities_change:    'Amenities',
  plan_change:         'Plan update',
}

const TYPE_COLOR: Record<string, string> = {
  launch:           'bg-blue-50 text-blue-700 border-blue-100',
  price_change:     'bg-amber-50 text-amber-700 border-amber-100',
  handover_change:  'bg-orange-50 text-orange-700 border-orange-100',
  units_change:     'bg-violet-50 text-violet-700 border-violet-100',
}

function colorFor(type: string): string {
  return TYPE_COLOR[type] || 'bg-gray-50 text-gray-600 border-gray-200'
}

function labelFor(type: string): string {
  return TYPE_LABEL[type] || type.replace('_', ' ')
}

export async function TrendingStrip() {
  const supabase = createServiceClient() as any

  let rows: UpdateRow[] = []
  try {
    const rpc = await supabase.rpc('recent_project_updates', { limit_count: 8 })
    if (!rpc.error && Array.isArray(rpc.data)) rows = rpc.data
  } catch { /* table or RPC missing — strip just hides */ }

  if (rows.length === 0) return null

  return (
    <section className="border-t border-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <p className="text-[11px] uppercase tracking-widest text-gray-400">Live · what just moved</p>
        </div>
        <ul className="flex flex-nowrap gap-2 overflow-x-auto scroll-smooth -mx-6 px-6 pb-2 no-scrollbar">
          {rows.slice(0, 8).map((u, i) => (
            <li key={i} className="shrink-0 max-w-[280px]">
              <UpdateChip u={u} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}


function UpdateChip({ u }: { u: UpdateRow }) {
  const slug = u.project_slug
  const name = u.project_name || 'Project'

  let detail = ''
  if (u.change_type === 'price_change' && u.delta_pct != null) {
    detail = `${u.delta_pct >= 0 ? '+' : ''}${Math.round(u.delta_pct)}% PSF`
  } else if (u.change_type === 'handover_change') {
    detail = `${prettyVal(u.before_value)} → ${prettyVal(u.after_value)}`
  } else if (u.change_type === 'launch') {
    detail = 'Just launched'
  } else if (u.field) {
    detail = u.field.replace(/_/g, ' ')
  }

  const inner = (
    <div className="flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm rounded-full pl-1 pr-3 py-1 transition">
      <span className={`text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full border ${colorFor(u.change_type)}`}>
        {labelFor(u.change_type)}
      </span>
      <span className="text-[12.5px] font-medium text-gray-900 truncate max-w-[180px]">{name}</span>
      {detail && <span className="text-[11.5px] text-gray-500 truncate max-w-[140px]">· {detail}</span>}
    </div>
  )

  return slug ? <Link href={`/projects/${slug}`}>{inner}</Link> : <div>{inner}</div>
}


function prettyVal(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 7)
  if (typeof v === 'number') return v.toLocaleString()
  return String(v)
}
