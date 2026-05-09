// apps/web/app/api/admin/jobs/route.ts
// GET → recent job records for the admin job log.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/guard'
import { recentJobs } from '@/lib/admin/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') ?? '30', 10)))
  return NextResponse.json({ jobs: recentJobs(limit) })
}
