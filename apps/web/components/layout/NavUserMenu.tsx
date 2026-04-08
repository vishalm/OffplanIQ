'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SubscriptionTier } from '@offplaniq/shared'

const TIER: Record<SubscriptionTier, { label: string; color: string; bg: string }> = {
  free:     { label: 'Free', color: 'text-gray-500', bg: 'bg-gray-100' },
  investor: { label: 'Investor', color: 'text-blue-700', bg: 'bg-blue-50' },
  agency:   { label: 'Agency', color: 'text-purple-700', bg: 'bg-purple-50' },
}

export function NavUserMenu({ email, name, tier }: { email: string; name: string; tier: SubscriptionTier }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initials = name
    ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : email?.[0]?.toUpperCase() || '?'

  const t = TIER[tier] || TIER.free

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-black/[0.04] transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-[11px] font-semibold text-white shadow-sm">
          {initials}
        </div>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl overflow-hidden z-50"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.05)' }}>

          {/* Profile header */}
          <div className="px-4 py-3 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-sm font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{name || 'User'}</p>
                <p className="text-[11px] text-gray-400 truncate">{email}</p>
              </div>
            </div>
            <div className="mt-2">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${t.bg} ${t.color}`}>
                {t.label} plan
              </span>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <MenuItem href="/dashboard" icon={iconGrid} label="Projects" onClick={() => setOpen(false)} />
            <MenuItem href="/alerts" icon={iconBell} label="Alerts" onClick={() => setOpen(false)} />
            <MenuItem href="/settings/billing" icon={iconCard} label="Billing & Plan" onClick={() => setOpen(false)} />
          </div>

          {tier === 'free' && (
            <div className="px-3 py-2 border-t border-gray-100">
              <Link href="/settings/billing" onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 w-full text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg py-2 transition-colors">
                Upgrade to Investor
              </Link>
            </div>
          )}

          <div className="border-t border-gray-100">
            <button onClick={signOut}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 transition-colors">
              {iconLogout}
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick}
      className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
      {icon}
      {label}
    </Link>
  )
}

const iconGrid = <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
const iconBell = <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
const iconCard = <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
const iconLogout = <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
