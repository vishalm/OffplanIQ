// apps/web/lib/admin/executor.ts
//
// Central executor. Both the one-click endpoint and the Copilot funnel
// through `executeOperation` so the job log + error handling is identical.

import 'server-only'
import { operationById } from './operations'
import { recordJobStart, completeJob, type JobRecord } from './jobs'
import { logFailure, logEvent } from '@/lib/logger'

export async function executeOperation(
  opId:         string,
  triggeredBy:  string,
  args:         Record<string, unknown> = {},
): Promise<JobRecord> {
  const op = operationById(opId)
  if (!op) {
    return recordImmediateFailure(opId, triggeredBy, `Unknown operation: ${opId}`)
  }
  if (!op.enabled) {
    return recordImmediateFailure(opId, triggeredBy, `Operation is disabled: ${opId}`)
  }

  const job = recordJobStart({
    op_id:        op.id,
    op_label:     op.label,
    triggered_by: triggeredBy,
    args,
  })

  try {
    const output = await op.run(args)
    const finished = completeJob(job.id, 'success', output)
    logEvent('info', 'admin.op.completed', {
      op_id:        op.id,
      job_id:       job.id,
      duration_ms:  finished?.duration_ms,
      triggered_by: triggeredBy,
    })
    return finished ?? job
  } catch (err: any) {
    logFailure('admin.op.failed', err, { op_id: op.id, job_id: job.id, triggered_by: triggeredBy })
    const finished = completeJob(job.id, 'failed', null, err?.message ?? String(err))
    return finished ?? job
  }
}

function recordImmediateFailure(opId: string, triggeredBy: string, error: string): JobRecord {
  const job = recordJobStart({
    op_id:        opId,
    op_label:     opId,
    triggered_by: triggeredBy,
  })
  return completeJob(job.id, 'failed', null, error) ?? job
}
