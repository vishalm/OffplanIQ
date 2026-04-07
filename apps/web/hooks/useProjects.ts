// apps/web/hooks/useProjects.ts
// Client-side data hook for project queries.
// Use in Client Components that need to re-fetch on filter changes.
// For Server Components: query Supabase directly in the page file.

'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@offplaniq/shared'

interface UseProjectsOptions {
  area?:   string
  status?: string
  q?:      string
  sort?:   string
  limit?:  number
}

interface UseProjectsResult {
  projects:  Project[]
  loading:   boolean
  error:     string | null
  refetch:   () => void
}

export function useProjects(options: UseProjectsOptions = {}): UseProjectsResult {
  const { area, status, q, sort = 'score', limit = 50 } = options

  const [projects, setProjects] = useState<Project[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const supabase = createClient()

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('projects')
      .select(`
        id, name, slug, area, status, handover_status,
        total_units, units_sold, sellthrough_pct,
        launch_psf, current_psf, score, score_breakdown,
        current_handover_date, handover_delay_days,
        developer:developer_id(name, slug, developer_score)
      `)
      .in('status', ['active', 'pre_launch'])
      .limit(limit)

    if (area)   query = query.eq('area', area)
    if (status) query = query.eq('handover_status', status)
    if (q)      query = query.ilike('name', `%${q}%`)

    const sortMap: Record<string, { col: string; asc: boolean }> = {
      score:       { col: 'score',           asc: false },
      psf_delta:   { col: 'current_psf',     asc: false },
      sellthrough: { col: 'sellthrough_pct', asc: false },
      launch_date: { col: 'launch_date',     asc: false },
    }
    const s = sortMap[sort] ?? sortMap.score
    query = query.order(s.col, { ascending: s.asc })

    const { data, error: qErr } = await query

    if (qErr) {
      setError(qErr.message)
    } else {
      setProjects((data as unknown as Project[]) ?? [])
    }

    setLoading(false)
  }, [area, status, q, sort, limit]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch() }, [fetch])

  return { projects, loading, error, refetch: fetch }
}
