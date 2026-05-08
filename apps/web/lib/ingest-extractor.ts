// apps/web/lib/ingest-extractor.ts
//
// LLM-powered extractor for the chat-ingest pipeline. Takes raw text — from a
// pasted URL we fetched, a CSV/JSON the user attached, or just free-form text
// the user typed — and returns a strict-JSON list of normalised project rows
// the API can either preview or write directly to Supabase.
//
// The schema mirrors `apps/scraper/lib/llm_extract.py` so the *same shape*
// flows through whether ingestion comes from the nightly scraper or a chat
// upload — keeps downstream code paths unified.

import 'server-only'
import { azureChat, azureConfigured } from '@/lib/azure-openai'

export type ExtractedProject = {
  name: string
  area: string | null
  city: string | null
  developer_name: string | null
  total_units: number | null
  unit_types: string[]
  min_price_aed: number | null
  max_price_aed: number | null
  starting_psf_aed: number | null
  handover_quarter: string | null
  handover_date: string | null
  launch_date: string | null
  total_floors: number | null
  amenities: string[]
  payment_plan: string | null
  description: string | null
  /** 0-1 — how confident the model is that this row is genuine and complete enough
   *  to write to the database. Auto-write only above a threshold. */
  confidence: number
}

export type ExtractionResult = {
  developer_name: string | null
  projects: ExtractedProject[]
  /** model-facing free text — useful for the UI's "what was found" preview */
  summary: string
}


const SYSTEM_PROMPT = `You are an extractor for UAE off-plan property data. The user will paste raw text from a URL/file/note. Return a strict JSON object describing every distinct OFF-PLAN project mentioned.

Schema (return JSON object with exactly this shape):

{
  "summary": "<1-2 sentence description of what was found, plain English>",
  "developer_name": <string or null — the most prominent developer in the source>,
  "projects": [
    {
      "name":             <string, canonical project name — required>,
      "area":             <sub-community e.g. 'Dubai Hills Estate' or null>,
      "city":             <emirate, e.g. 'Dubai', 'Abu Dhabi', or null>,
      "developer_name":   <string or null>,
      "total_units":      <integer or null>,
      "unit_types":       [<from {studio,1br,2br,3br,4br,5br,penthouse,villa,townhouse,duplex}>],
      "min_price_aed":    <integer AED or null>,
      "max_price_aed":    <integer AED or null>,
      "starting_psf_aed": <integer AED/sqft or null>,
      "handover_quarter": <"Q3 2027" or null>,
      "handover_date":    <"YYYY-MM-DD" or null>,
      "launch_date":      <"YYYY-MM-DD" or null>,
      "total_floors":     <integer or null>,
      "amenities":        [<string>],
      "payment_plan":     <free text e.g. "20/50/30 plan" or null>,
      "description":      <1-3 sentence project blurb or null>,
      "confidence":       <0.0-1.0, how sure you are this is a real off-plan project AND has enough fields to insert>
    }
  ]
}

RULES:
- Numbers are integers, AED only, no commas. Convert "1.2M AED" → 1200000.
- Omit fields you're not confident about (use null / empty arrays).
- If the source describes ready/secondary properties (not off-plan), return projects: [] and summary: "Source describes ready/secondary inventory, not off-plan — skipping."
- If the source isn't UAE real estate at all, return projects: [] and explain in summary.
- Never invent project names, prices, or amenities.
- confidence ≥ 0.7 means "OK to auto-write"; 0.3-0.7 means "preview, ask user"; < 0.3 means "skip".
`


function clip(text: string, max = 60_000): string {
  return text.length > max ? text.slice(0, max) : text
}


export async function extractProjects(rawText: string): Promise<ExtractionResult> {
  if (!azureConfigured()) {
    return {
      developer_name: null,
      projects: [],
      summary: 'LLM extractor not configured (Azure OpenAI keys missing).',
    }
  }
  if (!rawText || rawText.trim().length < 80) {
    return { developer_name: null, projects: [], summary: 'Source too short to extract from.' }
  }

  let raw: string
  try {
    raw = await azureChat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: clip(rawText) },
      ],
      { max_completion_tokens: 4000, response_format: 'json_object' },
    )
  } catch (e: any) {
    return {
      developer_name: null,
      projects: [],
      summary: `Extractor error: ${e?.message ?? 'unknown'}`,
    }
  }

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { developer_name: null, projects: [], summary: 'Model returned invalid JSON.' }
  }

  const projects = (Array.isArray(parsed.projects) ? parsed.projects : [])
    .map(normaliseProject)
    .filter((p: ExtractedProject | null): p is ExtractedProject => p !== null)

  return {
    developer_name: typeof parsed.developer_name === 'string' ? parsed.developer_name : null,
    projects,
    summary: typeof parsed.summary === 'string'
      ? parsed.summary
      : `Extracted ${projects.length} project${projects.length === 1 ? '' : 's'}.`,
  }
}


const ALLOWED_UNIT_TYPES = new Set([
  'studio', '1br', '2br', '3br', '4br', '5br',
  'penthouse', 'villa', 'townhouse', 'duplex',
])


function normaliseProject(p: any): ExtractedProject | null {
  if (!p || typeof p !== 'object') return null
  const name = typeof p.name === 'string' ? p.name.trim() : ''
  if (!name) return null

  const unitTypes = Array.isArray(p.unit_types)
    ? p.unit_types
        .map((v: any) => typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, '') : '')
        .filter((v: string) => ALLOWED_UNIT_TYPES.has(v))
    : []

  const amenities = Array.isArray(p.amenities)
    ? p.amenities.filter((a: any) => typeof a === 'string').map((a: string) => a.trim()).filter(Boolean)
    : []

  const confidence = typeof p.confidence === 'number'
    ? Math.max(0, Math.min(1, p.confidence))
    : 0

  return {
    name,
    area: nullable(p.area),
    city: nullable(p.city),
    developer_name: nullable(p.developer_name),
    total_units: integerOrNull(p.total_units),
    unit_types: unitTypes,
    min_price_aed: integerOrNull(p.min_price_aed),
    max_price_aed: integerOrNull(p.max_price_aed),
    starting_psf_aed: integerOrNull(p.starting_psf_aed),
    handover_quarter: nullable(p.handover_quarter),
    handover_date: isoDateOrNull(p.handover_date),
    launch_date: isoDateOrNull(p.launch_date),
    total_floors: integerOrNull(p.total_floors),
    amenities,
    payment_plan: nullable(p.payment_plan),
    description: nullable(p.description),
    confidence,
  }
}


function nullable(v: any): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function integerOrNull(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, _]/g, ''))
    if (Number.isFinite(n)) return Math.round(n)
  }
  return null
}

function isoDateOrNull(v: any): string | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim())
  return m ? m[0] : null
}
