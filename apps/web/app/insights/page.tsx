// apps/web/app/insights/page.tsx
// Conversational text-to-SQL surface. Server Component does auth + tier
// check; the client component owns the prompt, results, and history.

import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { InsightsBoard } from '@/components/insights/InsightsBoard'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Insights — OffplanIQ',
  description: 'Ask any question of the UAE off-plan database in plain English.',
}

export default async function InsightsPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login?next=/insights')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', session.user.id)
    .single()
  const tier = (profile as any)?.subscription_tier ?? 'free'

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-16">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-[12px] text-gray-400 mb-2">
            <a href="/analytics" className="hover:text-gray-600 transition-colors">Analytics</a>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-gray-700 font-medium">Insights</span>
          </div>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-[28px] font-semibold text-gray-900 tracking-tight">Insights</h1>
              <p className="text-[13px] text-gray-500 mt-1 max-w-2xl">
                Ask anything in plain English — averages by area, sell-through by developer tier, who launched
                this month. We translate your question into a safe query, show you the SQL, and explain the answer.
              </p>
            </div>
            {tier === 'free' && (
              <a href="/settings/billing" className="text-[13px] font-medium text-white bg-gray-900 px-4 py-2 rounded-full hover:bg-gray-800">
                Upgrade
              </a>
            )}
          </div>
        </div>

        <InsightsBoard tier={tier} />
      </div>
    </div>
  )
}
