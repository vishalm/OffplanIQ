'use client'
// apps/web/components/layout/NavUserMenu.tsx

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SubscriptionTier } from '@offplaniq/shared'

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free:     'Free',
  investor: 'Investor',
  agency:   'Agency',
}

const TIER_COLORS: Record<SubscriptionTier, string> = {
  free:     'bg-gray-100 text-gray-500',
  investor: 'bg-blue-50 text-blue-700',
  agency:   'bg-purple-50 text-purple-700',
}

export function NavUserMenu({
  email, name, tier,
}: {
  email: string
  name: string
  tier: SubscriptionTier
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initials = name
    ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : email[0].toUpperCase()

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 hover:bg-gray-100 rounded-lg px-2 py-1.5 transition"
      >
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-700">
          {initials}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIER_COLORS[tier]}`}>
          {TIER_LABELS[tier]}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-sm z-40 py-1">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900 truncate">{name || email}</p>
              <p className="text-xs text-gray-400 truncate">{email}</p>
            </div>

            <Link
              href="/settings/billing"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Billing & plan
            </Link>

            {tier === 'free' && (
              <Link
                href="/settings/billing"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
              >
                Upgrade to Investor →
              </Link>
            )}

            <button
              onClick={signOut}
              className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 border-t border-gray-100 mt-1"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
