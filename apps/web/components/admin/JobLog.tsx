'use client'

// apps/web/components/admin/JobLog.tsx
//
// Live job history. Each row is one operation invocation — rendered with
// status, duration, and an expandable detail showing args + the output JSON.

import { useState } from 'react'

export interface JobRecord {
  id:           string
  op_id:        string
  op_label:     string
  triggered_by: string
  status:       'running' | 'success' | 'failed'
  started_at:   string
  finished_at?: string
  duration_ms?: number
  args?:        Record<string, unknown>
  output?:      unknown
  error?:       string
}

interface Props {
  jobs:             JobRecord[]
  autoPoll:         boolean
  onAutoPollToggle: () => void
  onRefresh:        () => void
}

export function JobLog({ jobs, autoPoll, onAutoPollToggle, onRefresh }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <p className="text-[13px] font-semibold text-gray-900">Job log</p>
        <span className="text-[11px] text-gray-400">· {jobs.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="text-[11.5px] text-gray-500 hover:text-gray-900 px-2 py-1 rounded transition"
            title="Refresh now"
          >
            Refresh
          </button>
          <label className="flex items-center gap-1.5 text-[11.5px] text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoPoll}
              onChange={onAutoPollToggle}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Auto-poll
          </label>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="px-5 py-8 text-center text-[12.5px] text-gray-400">
          No jobs yet. Fire an operation or ask the Copilot.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
          {jobs.map(j => <JobRow key={j.id} job={j} />)}
        </ul>
      )}
    </div>
  )
}


function JobRow({ job }: { job: JobRecord }) {
  const [open, setOpen] = useState(false)

  const statusBadge = (() => {
    if (job.status === 'running') return <span className="text-[10px] uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-medium">Running</span>
    if (job.status === 'failed')  return <span className="text-[10px] uppercase tracking-wider text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded font-medium">Failed</span>
    return                              <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-medium">Success</span>
  })()

  const triggerSource = job.triggered_by.startsWith('copilot') ? 'Copilot'
                      : job.triggered_by.startsWith('manual')  ? 'Click'
                      : job.triggered_by

  return (
    <li className="px-5 py-2.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-start gap-2 group"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {statusBadge}
            <span className="text-[12.5px] font-medium text-gray-900 truncate">{job.op_label}</span>
            <span className="text-[11px] text-gray-400">{triggerSource}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {relativeTime(job.started_at)}
            {job.duration_ms != null && ` · ${formatDuration(job.duration_ms)}`}
          </p>
          {job.error && <p className="text-[11.5px] text-red-600 mt-1 line-clamp-2">{job.error}</p>}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="mt-2 ml-1 text-[11.5px] text-gray-700">
          {job.args && Object.keys(job.args).length > 0 && (
            <pre className="bg-gray-50 border border-gray-200 rounded p-2 mb-1.5 overflow-x-auto whitespace-pre-wrap">
              args: {JSON.stringify(job.args, null, 2)}
            </pre>
          )}
          {job.output != null && (
            <pre className="bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(job.output, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  )
}


function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)    return `${Math.max(1, Math.round(ms / 1000))}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleString()
}

function formatDuration(ms: number): string {
  if (ms < 1000)     return `${ms}ms`
  if (ms < 60_000)   return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}
