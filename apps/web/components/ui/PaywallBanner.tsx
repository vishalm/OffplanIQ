// apps/web/components/ui/PaywallBanner.tsx
import Link from 'next/link'

export function PaywallBanner({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="border border-dashed border-gray-200 rounded-xl p-8 mb-4 text-center bg-gray-50">
      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">{description}</p>
      <Link
        href="/settings/billing"
        className="inline-block bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 transition"
      >
        Upgrade to Investor — AED 750/mo
      </Link>
    </div>
  )
}
