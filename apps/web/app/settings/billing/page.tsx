// apps/web/app/settings/billing/page.tsx

import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UpgradeButton } from '@/components/ui/UpgradeButton'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { success?: string; cancelled?: string }
}) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier, subscription_ends_at, email, full_name')
    .eq('id', session.user.id)
    .single()

  const tier = profile?.subscription_tier ?? 'free'

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 'AED 0',
      period: 'forever',
      features: [
        'Top 20 projects by score',
        'PSF data with 30-day lag',
        'Sell-through percentages',
        'Basic project info',
      ],
      missing: [
        'IRR calculator',
        'Developer scorecards',
        'Alerts & watchlist',
        'Weekly digest',
        'Live data (T+1)',
      ],
    },
    {
      id: 'investor',
      name: 'Investor',
      price: 'AED 750',
      period: 'per month',
      features: [
        'All 142+ active projects',
        'Live PSF data (T+1)',
        'IRR calculator with sensitivity table',
        'Developer scorecards',
        'Alerts & watchlist (unlimited)',
        'Weekly Sunday digest email',
        'Score breakdown detail',
      ],
      missing: [],
    },
    {
      id: 'agency',
      name: 'Agency',
      price: 'AED 3,500',
      period: 'per month',
      features: [
        'Everything in Investor',
        '5 team seats',
        'White-label PDF reports',
        'API access (REST)',
        'Priority support',
        'Custom area filters saved',
      ],
      missing: [],
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">

        <div className="mb-10">
          <h1 className="text-2xl font-medium text-gray-900">Billing & plan</h1>
          <p className="text-sm text-gray-500 mt-1">
            Current plan: <span className="font-medium capitalize text-gray-800">{tier}</span>
            {profile?.subscription_ends_at && (
              <span className="ml-2 text-gray-400">
                · renews {new Date(profile.subscription_ends_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </p>
        </div>

        {searchParams.success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
            Your plan has been upgraded. Welcome to {tier === 'agency' ? 'Agency' : 'Investor'}!
          </div>
        )}

        {searchParams.cancelled && (
          <div className="mb-6 p-4 bg-gray-100 rounded-xl text-sm text-gray-600">
            Upgrade cancelled. You can upgrade any time.
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isCurrent = plan.id === tier
            const isDowngrade = (
              (tier === 'agency' && plan.id !== 'agency') ||
              (tier === 'investor' && plan.id === 'free')
            )

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-xl border p-6 ${
                  plan.id === 'investor'
                    ? 'border-gray-900 ring-1 ring-gray-900'
                    : 'border-gray-200'
                }`}
              >
                {plan.id === 'investor' && (
                  <span className="inline-block text-xs font-medium bg-gray-900 text-white px-2 py-0.5 rounded-full mb-3">
                    Most popular
                  </span>
                )}

                <h2 className="text-lg font-medium text-gray-900">{plan.name}</h2>
                <div className="mt-1 mb-5">
                  <span className="text-2xl font-medium text-gray-900">{plan.price}</span>
                  <span className="text-sm text-gray-400 ml-1">{plan.period}</span>
                </div>

                <ul className="space-y-2 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                  {plan.missing.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-400">
                      <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="text-center text-sm text-gray-400 py-2 border border-gray-200 rounded-lg">
                    Current plan
                  </div>
                ) : isDowngrade ? (
                  <div className="text-center text-sm text-gray-400 py-2">
                    Contact support to downgrade
                  </div>
                ) : (
                  <UpgradeButton plan={plan.id as 'investor' | 'agency'} />
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-gray-400 text-center mt-8">
          All plans billed in AED. Cancel any time. No refunds on partial months.
          Questions? Email <a href="mailto:hello@offplaniq.com" className="underline">hello@offplaniq.com</a>
        </p>

      </div>
    </div>
  )
}
