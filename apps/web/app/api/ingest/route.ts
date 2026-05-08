// apps/web/app/api/ingest/route.ts
//
// Two-phase data ingest from the chat:
//
//   POST /api/ingest          (preview)           Body: { url } | { text } | multipart file
//                                                  → returns { extraction, will_auto_write }
//   POST /api/ingest          (confirm-write)     Body: { confirm: { extraction } }
//                                                  → upserts approved rows; returns counts
//
// The two-phase flow exists because property data is high-stakes — buyers in
// our user base would lose trust fast if the AI silently wrote junk. We
// auto-write only rows where the model self-reports confidence ≥ 0.7
// AND each row has the bare-minimum required fields (name + area or city).
// Lower-confidence rows go to the preview pane for the user to accept manually.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { extractProjects, type ExtractedProject, type ExtractionResult } from '@/lib/ingest-extractor'
import { LIMITS, clientIdentifier, consumeRateLimit, rateLimitResponse } from '@/lib/api-guard'
import { startRequest, logFailure, timed } from '@/lib/logger'
import { looseSupabase } from '@/lib/supabase/loose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AUTO_WRITE_CONFIDENCE = 0.7
const MAX_BODY_BYTES = 8 * 1024 * 1024            // 8 MB cap on uploaded text/file
const MAX_URL_FETCH_BYTES = 4 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000


async function fetchUrlAsText(url: string): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // Polite UA — the same shape the scraper uses.
        'user-agent': 'Mozilla/5.0 (compatible; OffplanIQ/1.0; chat-ingest)',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`fetch ${res.status}`)
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_URL_FETCH_BYTES) {
      throw new Error(`fetched ${buf.byteLength} bytes > ${MAX_URL_FETCH_BYTES} cap`)
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
    return stripHtml(text)
  } finally {
    clearTimeout(t)
  }
}


// Strip HTML to plain text — naive but good enough for the extractor.
function stripHtml(html: string): string {
  if (!/<\/?[a-z]/i.test(html)) return html
  return html
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replaceAll(/<\/?[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll(/\s+/g, ' ')
    .trim()
}


function classify(p: ExtractedProject): 'auto' | 'preview' | 'skip' {
  if (!p.name) return 'skip'
  if (!(p.area || p.city)) return 'skip'
  if (p.confidence >= AUTO_WRITE_CONFIDENCE) return 'auto'
  if (p.confidence >= 0.3) return 'preview'
  return 'skip'
}


// ─── Read body ───────────────────────────────────────────────
async function readSourceText(req: NextRequest): Promise<{ text: string; source: 'url' | 'file' | 'text'; meta?: any }> {
  const ct = req.headers.get('content-type') || ''

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new Error('multipart upload missing "file"')
    if (file.size > MAX_BODY_BYTES) throw new Error(`file too large (${file.size} > ${MAX_BODY_BYTES})`)
    const text = await file.text()
    return { text, source: 'file', meta: { name: file.name, size: file.size, type: file.type } }
  }

  const body = await req.json().catch(() => ({}))

  if (body && typeof body.confirm === 'object') {
    // Confirm-write path is handled by the caller (not text-extraction).
    return { text: '', source: 'text', meta: { confirmPayload: body.confirm } }
  }

  if (typeof body.url === 'string' && body.url.trim()) {
    const text = await fetchUrlAsText(body.url.trim())
    return { text, source: 'url', meta: { url: body.url.trim() } }
  }

  if (typeof body.text === 'string' && body.text.trim()) {
    return { text: body.text.trim().slice(0, MAX_BODY_BYTES), source: 'text' }
  }

  throw new Error('Provide one of: { url }, { text }, multipart "file", or { confirm: { extraction } }')
}


// ─── DB write ────────────────────────────────────────────────
// Build the projects row payload for an extracted project. We never write
// current_psf / units_sold / sellthrough_pct from chat ingest — those are
// DLD-derived. Absent fields are stripped so PostgREST upsert leaves the
// existing column values untouched.
function buildProjectRow(p: ExtractedProject, developerId: string): Record<string, any> {
  const row: Record<string, any> = {
    developer_id: developerId,
    name: p.name,
    slug: slugify(p.name),
    area: p.area || 'Unknown',
    city: p.city || 'Dubai',
    status: 'active',
    handover_status: 'on_track',
    total_units: p.total_units || 0,
    total_floors: p.total_floors,
    min_price: p.min_price_aed,
    max_price: p.max_price_aed,
    launch_psf: p.starting_psf_aed,
    current_handover_date: p.handover_date || quarterToDate(p.handover_quarter),
    launch_date: p.launch_date,
    unit_types: p.unit_types.length ? p.unit_types : null,
    amenities: p.amenities.length ? p.amenities : null,
    description: p.description,
  }
  for (const k of Object.keys(row)) if (row[k] == null) delete row[k]
  return row
}


async function resolveDeveloperId(
  sb: any,
  devName: string,
): Promise<{ id: string | null; created: boolean; error?: string }> {
  const slug = slugify(devName)
  const found = await sb.from('developers').select('id').eq('slug', slug).maybeSingle()
  if (found.data?.id) return { id: found.data.id, created: false }
  const ins = await sb.from('developers')
    .insert({ name: devName, slug, developer_score: 50 })
    .select('id').single()
  if (ins.error) return { id: null, created: false, error: ins.error.message }
  return { id: ins.data.id, created: true }
}


async function writeApproved(
  supabase: ReturnType<typeof createServerClient>,
  approved: ExtractedProject[],
): Promise<{ developers_created: number; projects_upserted: number; errors: string[] }> {
  const sb = looseSupabase(supabase)
  const errors: string[] = []
  let developersCreated = 0
  let projectsUpserted = 0

  for (const p of approved) {
    const devName = (p.developer_name || 'Unknown developer').trim()
    const dev = await resolveDeveloperId(sb, devName)
    if (!dev.id) {
      errors.push(`developer "${devName}": ${dev.error ?? 'unknown error'}`)
      continue
    }
    if (dev.created) developersCreated++
    const row = buildProjectRow(p, dev.id)

    const { error } = await sb
      .from('projects')
      .upsert([row], { onConflict: 'slug' })
    if (error) {
      errors.push(`project "${p.name}": ${error.message}`)
      continue
    }
    projectsUpserted++
  }

  return { developers_created: developersCreated, projects_upserted: projectsUpserted, errors }
}


function slugify(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '').slice(0, 80)
}

function quarterToDate(q: string | null): string | null {
  if (!q) return null
  const m = /^Q([1-4])\s+(\d{4})$/i.exec(q)
  if (!m) return null
  const month = { 1: '03', 2: '06', 3: '09', 4: '12' }[Number(m[1]) as 1 | 2 | 3 | 4]
  return `${m[2]}-${month}-01`
}


// ─── POST handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const log = startRequest('api/ingest', req)
  // Auth-gated. Anon shouldn't write to the catalogue.
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { log.end(401); return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  let read: { text: string; source: 'url' | 'file' | 'text'; meta?: any }
  try {
    read = await readSourceText(req)
  } catch (e: any) {
    logFailure('ingest.read_source_failed', e, { user_id: user.id })
    log.end(400, { user_id: user.id })
    return NextResponse.json({ error: e?.message || 'bad request' }, { status: 400 })
  }

  // Rate limit. Confirm-writes are cheap (no LLM); previews are expensive
  // (LLM call + maybe URL fetch), so they get the tighter bucket.
  const isConfirm = !!read.meta?.confirmPayload
  const limit = isConfirm ? LIMITS.ingestConfirm : LIMITS.ingest
  const rl = consumeRateLimit(limit, clientIdentifier(req, user.id))
  if (!rl.ok) {
    log.end(429, { user_id: user.id, phase: isConfirm ? 'confirm' : 'preview' })
    return rateLimitResponse({ limit: limit.limit, remaining: rl.remaining, resetAt: rl.resetAt })
  }

  // Confirm-write phase: caller posts the approved subset back.
  if (isConfirm) {
    const payload = read.meta!.confirmPayload
    const approved = (payload.projects ?? []).filter((p: ExtractedProject) => p?.name)
    if (!approved.length) {
      log.end(400, { user_id: user.id, phase: 'confirm' })
      return NextResponse.json({ error: 'no projects to write' }, { status: 400 })
    }
    const result = await timed(() => writeApproved(supabase, approved), 'ingest.write_approved', { user_id: user.id, count: approved.length })
    log.end(200, {
      user_id: user.id,
      phase: 'confirm',
      projects_upserted: result.projects_upserted,
      developers_created: result.developers_created,
      errors: result.errors.length,
    })
    return NextResponse.json({ phase: 'written', ...result })
  }

  // Preview phase: extract, classify, return.
  const extraction: ExtractionResult = await timed(() => extractProjects(read.text), 'ingest.llm_extract', {
    user_id: user.id,
    source: read.source,
    text_chars: read.text.length,
  })

  const auto: ExtractedProject[] = []
  const preview: ExtractedProject[] = []
  const skipped: ExtractedProject[] = []
  for (const p of extraction.projects) {
    const cls = classify(p)
    if (cls === 'auto')        auto.push(p)
    else if (cls === 'preview') preview.push(p)
    else                        skipped.push(p)
  }

  // Auto-write the high-confidence rows immediately so the chat feels alive.
  let written = { developers_created: 0, projects_upserted: 0, errors: [] as string[] }
  if (auto.length > 0) {
    written = await timed(() => writeApproved(supabase, auto), 'ingest.write_auto', { user_id: user.id, count: auto.length })
  }

  log.end(200, {
    user_id: user.id,
    phase: 'preview',
    source: read.source,
    auto: auto.length,
    preview: preview.length,
    skipped: skipped.length,
  })
  return NextResponse.json({
    phase: 'preview',
    source: read.source,
    summary: extraction.summary,
    auto_written: auto.length,
    written,
    preview,                  // user must explicitly confirm these
    skipped: skipped.length,  // count only — body is private
    threshold: AUTO_WRITE_CONFIDENCE,
  })
}


// ─── GET — sample CSV template ───────────────────────────────
export async function GET() {
  // The template column order matches the LLM extractor schema, so users
  // pasting/uploading this CSV produce 1.0-confidence extractions.
  const lines: string[] = [
    [
      'name', 'area', 'city', 'developer_name',
      'total_units', 'unit_types', 'min_price_aed', 'max_price_aed',
      'starting_psf_aed', 'handover_quarter', 'handover_date',
      'launch_date', 'total_floors', 'amenities', 'payment_plan', 'description',
    ].join(','),
    [
      '"Creek Bay"', '"Dubai Creek Harbour"', '"Dubai"', '"Emaar Properties"',
      '300', '"1br;2br;3br"', '1797888', '4500000',
      '2150', '"Q3 2027"', '2027-09-01',
      '2024-11-01', '32', '"pool;gym;beach"', '"20% on booking, 50% on construction, 30% on handover"',
      '"Waterfront residences in Dubai Creek Harbour. Sample row — replace with your data."',
    ].join(','),
  ]
  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="offplaniq-ingest-template.csv"',
    },
  })
}
