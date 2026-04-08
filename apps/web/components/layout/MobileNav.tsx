'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SubscriptionTier } from '@offplaniq/shared'

interface NavLink { href: string; label: string; badge?: number }

const TIER_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-500',
  investor: 'bg-blue-50 text-blue-700',
  agency: 'bg-purple-50 text-purple-700',
}

export function MobileNav({ links, pathname, email, name, tier }: {
  links: NavLink[]; pathname: string; email: string; name: string; tier: SubscriptionTier
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const initials = name
    ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : email?.[0]?.toUpperCase() || '?'

  async function signOut() {
    await supabase.auth.signOut()
    setOpen(false)
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="md:hidden">
      {/* Burger button */}
      <button onClick={() => setOpen(!open)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-black/[0.04] transition-colors">
        {open ? (
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        )}
      </button>

      {/* Overlay */}
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setOpen(false)} />}

      {/* Slide-down panel */}
      <div className={`fixed top-12 left-0 right-0 z-50 transition-all duration-300 ease-out ${
        open ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
      }`}>
        <div className="mx-3 mt-1 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.05)' }}>

          {/* User */}
          <div className="px-5 py-4 bg-gray-50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-sm font-semibold text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 truncate">{name || 'User'}</p>
              <p className="text-[11px] text-gray-400 truncate">{email}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TIER_COLORS[tier] || TIER_COLORS.free}`}>
              {tier}
            </span>
          </div>

          {/* Nav links */}
          <div className="py-2">
            {links.map(link => {
              const isActive = pathname.startsWith(link.href)
              return (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)}
                  className={`flex items-center justify-between px-5 py-3 transition-colors ${
                    isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}>
                  <span className={`text-[14px] font-medium ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>
                    {link.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {link.badge && link.badge > 0 && (
                      <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {link.badge > 9 ? '9+' : link.badge}
                      </span>
                    )}
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Extra links */}
          <div className="border-t border-gray-100 py-2">
            <Link href="/settings/billing" onClick={() => setOpen(false)}
              className="flex items-center px-5 py-3 text-[14px] text-gray-600 hover:bg-gray-50 transition-colors">
              Billing & Plan
            </Link>
            {tier === 'free' && (
              <Link href="/settings/billing" onClick={() => setOpen(false)}
                className="flex items-center px-5 py-3 text-[14px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                Upgrade to Investor
              </Link>
            )}
          </div>

          {/* Sign out */}
          <div className="border-t border-gray-100">
            <button onClick={signOut}
              className="w-full text-left px-5 py-3 text-[14px] text-red-600 hover:bg-red-50 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
