import Link from 'next/link'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { NavUserMenu } from './NavUserMenu'

const NAV_LINKS = [
  { href: '/analytics', label: 'Analytics' },
  { href: '/dashboard', label: 'Search' },
  { href: '/alerts', label: 'Alerts' },
]

export async function Nav() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  const { data: profile } = session
    ? await supabase.from('user_profiles').select('full_name, subscription_tier').eq('id', session.user.id).single()
    : { data: null }

  const { data: alertCount } = session
    ? await supabase.from('alerts_log').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('is_read', false)
    : { data: null }

  const unread = (alertCount as any)?.count ?? 0

  // Get current path for active state
  const headersList = headers()
  const pathname = headersList.get('x-pathname') || ''

  return (
    <header className="sticky top-0 z-50 glass" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-11">

          <Link href="/analytics" className="flex items-center gap-2 shrink-0">
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="14" width="6" height="16" rx="1.5" fill="#007AFF" opacity=".4"/>
              <rect x="10" y="8" width="6" height="22" rx="1.5" fill="#007AFF" opacity=".6"/>
              <rect x="18" y="2" width="6" height="28" rx="1.5" fill="#007AFF"/>
              <rect x="26" y="10" width="6" height="20" rx="1.5" fill="#007AFF" opacity=".5"/>
            </svg>
            <span className="text-[13px] font-semibold text-gray-900">OffplanIQ</span>
          </Link>

          {/* Center nav */}
          <nav className="flex items-center bg-gray-100/60 rounded-lg p-0.5">
            {NAV_LINKS.map(link => {
              const isActive = pathname.startsWith(link.href) || (link.href === '/analytics' && pathname === '/')
              return (
                <Link key={link.href} href={link.href}
                  className={`relative text-[12px] font-medium px-4 py-1.5 rounded-md transition-all duration-200 ${
                    isActive
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {link.label}
                  {link.label === 'Alerts' && unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <NavUserMenu
            email={session?.user.email ?? ''}
            name={(profile as any)?.full_name ?? ''}
            tier={(profile as any)?.subscription_tier ?? 'free'}
          />
        </div>
      </div>
    </header>
  )
}
