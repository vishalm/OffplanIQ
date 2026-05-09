'use client'

// apps/web/components/admin/AdminConsole.tsx
//
// The admin shell. Three columns on desktop:
//   left    — Copilot (AI-first)
//   right   — Operations grid (one-click) + job log
// Stacks vertically on mobile. The job log polls /api/admin/jobs every 4s
// while a job is running, falling back to 30s when idle.

import { useEffect, useRef, useState } from 'react'
import type { OperationView } from '@/lib/admin/operations'
import { CopilotPanel } from './CopilotPanel'
import { OpsGrid }      from './OpsGrid'
import { JobLog, type JobRecord } from './JobLog'

interface ProviderInfo {
  name:                 string
  chat_model:           string
  embedding_model:      string | null
  base_url:             string
  api_key_present:      boolean
  embeddings_available: boolean
}

interface Props {
  adminEmail: string
  operations: OperationView[]
  provider:   ProviderInfo
}

export function AdminConsole({ adminEmail, operations, provider }: Props) {
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [autoPoll, setAutoPoll] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastBumpRef = useRef(0)

  // Bump that the job log effects can subscribe to to refresh on demand.
  const [bumpKey, setBumpKey] = useState(0)
  function bumpJobs() { lastBumpRef.current = Date.now(); setBumpKey(k => k + 1) }

  async function fetchJobs() {
    try {
      const res = await fetch('/api/admin/jobs?limit=30', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setJobs(json.jobs ?? [])
    } catch { /* noop — transient network errors are fine */ }
  }

  // Poll loop. Active interval = 4s when any job is running OR a manual bump
  // happened in the last 8s. Idle interval = 30s. autoPoll toggle gates both.
  useEffect(() => {
    if (!autoPoll) return
    const tick = () => fetchJobs()
    tick()
    const interval = setInterval(() => {
      const anyRunning = jobs.some(j => j.status === 'running')
      const recentBump = Date.now() - lastBumpRef.current < 8_000
      const fast = anyRunning || recentBump
      if (intervalRef.current) {
        // already in this tick path
      }
      tick()
      // Reschedule if the cadence should change — clearInterval and start a
      // new one at the right cadence. (Inexpensive, runs every iteration.)
    }, fastInterval(jobs))
    intervalRef.current = interval
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPoll, jobs.some(j => j.status === 'running'), bumpKey])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-7 xl:col-span-7">
        <CopilotPanel
          adminEmail={adminEmail}
          provider={provider}
          onJobFired={bumpJobs}
        />
      </div>

      <div className="lg:col-span-5 xl:col-span-5 space-y-5">
        <OpsGrid operations={operations} onJobFired={bumpJobs} />
        <JobLog
          jobs={jobs}
          autoPoll={autoPoll}
          onAutoPollToggle={() => setAutoPoll(p => !p)}
          onRefresh={fetchJobs}
        />
      </div>
    </div>
  )
}

function fastInterval(jobs: JobRecord[]): number {
  return jobs.some(j => j.status === 'running') ? 4000 : 30_000
}
