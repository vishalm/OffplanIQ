// apps/web/lib/admin/jobs.ts
//
// Process-local job log. Every operation invocation writes a row here so the
// admin UI can render history + the Copilot can quote the last result. The
// log lives in a Map and resets on dyno restart — adequate for an
// operator-facing console; promote to a Supabase table when retention or
// multi-instance behaviour becomes a requirement.

import 'server-only'

export type JobStatus = 'running' | 'success' | 'failed'

export interface JobRecord {
  id:           string
  op_id:        string
  op_label:     string
  triggered_by: string                                // 'copilot' | 'manual:<email>'
  status:       JobStatus
  started_at:   string                                // ISO
  finished_at?: string
  duration_ms?: number
  args?:        Record<string, unknown>
  output?:      unknown
  error?:       string
}

const MAX_KEEP = 100
const log: JobRecord[] = []

export function recordJobStart(partial: Omit<JobRecord, 'id' | 'status' | 'started_at'>): JobRecord {
  const job: JobRecord = {
    id:         `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status:     'running',
    started_at: new Date().toISOString(),
    ...partial,
  }
  log.unshift(job)
  while (log.length > MAX_KEEP) log.pop()
  return job
}

export function completeJob(id: string, status: JobStatus, output: unknown, error?: string): JobRecord | undefined {
  const job = log.find(j => j.id === id)
  if (!job) return undefined
  job.status      = status
  job.finished_at = new Date().toISOString()
  job.duration_ms = Date.now() - new Date(job.started_at).getTime()
  job.output      = output
  if (error) job.error = error
  return job
}

export function recentJobs(limit = 30): JobRecord[] {
  return log.slice(0, Math.max(1, Math.min(limit, MAX_KEEP)))
}

export function jobById(id: string): JobRecord | undefined {
  return log.find(j => j.id === id)
}
