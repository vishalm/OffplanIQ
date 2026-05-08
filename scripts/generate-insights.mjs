// scripts/generate-insights.mjs
// Bulk-generate per-project narratives via Azure OpenAI. Idempotent: safe to
// re-run. Skips projects whose narrative is fresh (< MIN_AGE_HOURS) unless
// --force is passed.
//
// Run: node scripts/generate-insights.mjs            # only stale rows
//      node scripts/generate-insights.mjs --force    # regen everything
//      node scripts/generate-insights.mjs --slug=<s> # one project
//
// Reads env from root .env (single source of truth).

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot  = resolve(__dirname, '..')

function loadEnv(file) {
  try {
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {}
}
loadEnv(resolve(repoRoot, '.env'))

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const AZ_ENDPOINT     = process.env.AZURE_OPENAI_ENDPOINT
const AZ_KEY          = process.env.AZURE_OPENAI_API_KEY
const AZ_DEPLOYMENT   = process.env.AZURE_OPENAI_DEPLOYMENT
const AZ_VERSION      = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview'

for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_KEY, AZ_ENDPOINT, AZ_KEY, AZ_DEPLOYMENT })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1) }
}

const args = new Set(process.argv.slice(2))
const FORCE = args.has('--force')
const SLUG  = [...args].find(a => a.startsWith('--slug='))?.slice(7)
const MIN_AGE_HOURS = 24

async function rest(method, path, { body, prefer, params } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

async function azureChat(messages, opts = {}) {
  // gpt-5/o1 reasoning models: use max_completion_tokens (covers reasoning
  // budget + visible output) and don't send `temperature`.
  const url = `${AZ_ENDPOINT.replace(/\/+$/, '')}/openai/deployments/${AZ_DEPLOYMENT}/chat/completions?api-version=${AZ_VERSION}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': AZ_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      max_completion_tokens: opts.max_completion_tokens ?? 4000,
      response_format: { type: 'json_object' },
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Azure ${res.status}: ${text.slice(0, 300)}`)
  const json = JSON.parse(text)
  const content = json?.choices?.[0]?.message?.content
  if (!content && json?.choices?.[0]?.finish_reason === 'length') {
    throw new Error('Azure hit token budget; bump max_completion_tokens.')
  }
  return content ?? '{}'
}

const SYSTEM_PROMPT = `You are an analyst writing concise property insights for an UAE off-plan investment portal.

For each project you'll receive:
  - structured project data (PSF, sellthrough, score, handover status, developer)
  - comparable projects in the same area (anchor for relative claims)

Return a JSON object with EXACTLY these keys:
  {
    "narrative": "<3-5 sentence analyst note. Cite specific numbers from the data. Compare to area peers when meaningful. No marketing fluff. No financial advice. Plain English.>",
    "sentiment_label": "positive" | "neutral" | "negative",
    "sentiment_score": <number from -1.0 to +1.0>
  }

RULES:
- Use only the data provided. Never invent figures.
- "Positive" = strong score, on-time handover, sellthrough rising or PSF appreciating.
- "Negative" = delays, weak demand, declining PSF, low developer trust.
- "Neutral" = average / mixed signals.
- Mention sellthrough_pct, current_psf, score, and handover risk when relevant.
- Keep it factual. No "must-buy", "great opportunity", etc. — write like a fund analyst.`

function buildUserPrompt(project, comparables) {
  return JSON.stringify({
    project: {
      name: project.name, area: project.area, city: project.city,
      developer: project.developer?.name, developer_score: project.developer?.developer_score,
      score: project.score, score_breakdown: project.score_breakdown,
      sellthrough_pct: project.sellthrough_pct, units_sold: project.units_sold, total_units: project.total_units,
      current_psf: project.current_psf, launch_psf: project.launch_psf,
      psf_delta_pct: project.launch_psf && project.current_psf
        ? Math.round(((project.current_psf - project.launch_psf) / project.launch_psf) * 100)
        : null,
      min_price: project.min_price, max_price: project.max_price,
      handover_status: project.handover_status, handover_delay_days: project.handover_delay_days,
      current_handover_date: project.current_handover_date, launch_date: project.launch_date,
      status: project.status, unit_types: project.unit_types,
    },
    comparables_in_area: comparables.map(c => ({
      name: c.name, score: c.score, current_psf: c.current_psf,
      sellthrough_pct: c.sellthrough_pct, handover_status: c.handover_status,
    })),
  })
}

async function generateOne(project, comparables) {
  const userPrompt = buildUserPrompt(project, comparables)
  const raw = await azureChat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: userPrompt },
  ], { max_completion_tokens: 4000 })

  let parsed
  try { parsed = JSON.parse(raw) }
  catch {
    throw new Error(`Model returned non-JSON: ${raw.slice(0, 200)}`)
  }
  const narrative = String(parsed.narrative || '').trim()
  const sentiment_label = ['positive', 'negative', 'neutral'].includes(parsed.sentiment_label)
    ? parsed.sentiment_label : 'neutral'
  const sentiment_score = typeof parsed.sentiment_score === 'number'
    ? Math.max(-1, Math.min(1, parsed.sentiment_score)) : 0

  if (!narrative) throw new Error('empty narrative')
  return { narrative, sentiment_label, sentiment_score }
}

async function main() {
  console.log(`Generating insights with ${AZ_DEPLOYMENT} (${AZ_ENDPOINT})`)

  // Pull active/pre_launch projects with everything we need.
  let projects = await rest('GET', 'projects', {
    params: {
      select: 'id,slug,name,area,city,score,score_breakdown,sellthrough_pct,units_sold,total_units,' +
              'current_psf,launch_psf,min_price,max_price,handover_status,handover_delay_days,' +
              'current_handover_date,launch_date,status,unit_types,narrative_updated_at,' +
              'developer:developer_id(name,developer_score)',
      status: 'in.(active,pre_launch)',
    },
  })

  if (SLUG) projects = projects.filter(p => p.slug === SLUG)

  if (!FORCE && !SLUG) {
    const cutoff = Date.now() - MIN_AGE_HOURS * 3600 * 1000
    projects = projects.filter(p =>
      !p.narrative_updated_at || new Date(p.narrative_updated_at).getTime() < cutoff
    )
  }

  console.log(`Generating for ${projects.length} project(s)...`)
  let ok = 0, fail = 0
  const now = new Date().toISOString()

  for (const p of projects) {
    try {
      // Comparables: top 4 in same area by score, excluding self.
      const comparables = await rest('GET', 'projects', {
        params: {
          select: 'name,score,current_psf,sellthrough_pct,handover_status',
          area:   `eq.${p.area || ''}`,
          slug:   `neq.${p.slug}`,
          order:  'score.desc.nullslast',
          limit:  '4',
        },
      })

      const { narrative, sentiment_label, sentiment_score } = await generateOne(p, comparables ?? [])

      await rest('PATCH', 'projects', {
        params: { id: `eq.${p.id}` },
        body: {
          narrative,
          narrative_updated_at: now,
          narrative_model: AZ_DEPLOYMENT,
          sentiment_label,
          sentiment_score,
        },
        prefer: 'return=minimal',
      })

      ok++
      console.log(`  [${ok + fail}/${projects.length}] ${p.slug} → ${sentiment_label} (${sentiment_score.toFixed(2)})`)
    } catch (e) {
      fail++
      console.warn(`  [${ok + fail}/${projects.length}] ${p.slug} FAILED: ${String(e).slice(0, 200)}`)
    }
  }

  console.log(`\nDone. ok=${ok} fail=${fail}`)
}

main().catch(e => { console.error(e); process.exit(1) })
