// apps/web/app/admin/page.tsx
//
// AI-first operations console. Server Component does the auth + admin gate;
// the client AdminConsole owns the Copilot, the one-click ops grid, and the
// live job log. Hidden from the nav unless the signed-in user's email is on
// the ADMIN_EMAILS allow-list.

import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin/guard'
import { operationViews } from '@/lib/admin/operations'
import { providerInfo } from '@/lib/llm'
import { AdminConsole } from '@/components/admin/AdminConsole'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Admin · OffplanIQ',
  description: 'Operations control plane for OffplanIQ administrators.',
}

export default async function AdminPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login?next=/admin')
  if (!isAdminEmail(session.user.email)) notFound()

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-16">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-[12px] text-gray-400 mb-2">
            <a href="/analytics" className="hover:text-gray-600 transition-colors">Analytics</a>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-gray-700 font-medium">Admin</span>
          </div>
          <h1 className="text-2xl sm:text-[28px] font-semibold text-gray-900 tracking-tight">Operations Copilot</h1>
          <p className="text-[13px] text-gray-500 mt-1 max-w-2xl">
            Talk to the Copilot to orchestrate any backend job — scraping, recomputes, alerts, maintenance.
            Or fire individual operations one click at a time. Every action lands in the job log below.
          </p>
        </div>

        <AdminConsole
          adminEmail={session.user.email ?? ''}
          operations={operationViews()}
          provider={providerInfo()}
        />
      </div>
    </div>
  )
}
