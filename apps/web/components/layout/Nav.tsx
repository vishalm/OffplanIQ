import Link from 'next/link'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { MobileNav } from './MobileNav'
import { NavUserMenu } from './NavUserMenu'

export async function Nav() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: profile } = session
    ? await supabase.from('user_profiles').select('full_name, subscription_tier').eq('id', session.user.id).single()
    : { data: null }

  const { data: alertCount } = session
    ? await supabase.from('alerts_log').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('is_read', false)
    : { data: null }

  const unread = (alertCount as any)?.count ?? 0
  const headersList = headers()
  const pathname = headersList.get('x-pathname') || ''

  const links = [
    { href: '/analytics', label: 'Analytics' },
    { href: '/search', label: 'Search' },
    { href: '/alerts', label: 'Alerts', badge: unread },
  ]

  return (
    <header className="sticky top-0 z-50 glass" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">

          {/* Logo */}
          <Link href="/analytics" className="flex items-center gap-2.5 shrink-0">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="14" width="6" height="16" rx="1.5" fill="#007AFF" opacity=".4"/>
              <rect x="10" y="8" width="6" height="22" rx="1.5" fill="#007AFF" opacity=".6"/>
              <rect x="18" y="2" width="6" height="28" rx="1.5" fill="#007AFF"/>
              <rect x="26" y="10" width="6" height="20" rx="1.5" fill="#007AFF" opacity=".5"/>
            </svg>
            <span className="text-[15px] font-bold text-gray-900">Offplan<span className="text-blue-600">IQ</span></span>
          </Link>

          {/* Desktop nav - segmented control */}
          <nav className="hidden md:flex items-center bg-gray-100/60 rounded-lg p-0.5">
            {links.map(link => {
              const isActive = pathname.startsWith(link.href)
              return (
                <Link key={link.href} href={link.href}
                  className={`relative text-[12px] font-medium px-4 py-1.5 rounded-md transition-all duration-200 ${
                    isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {link.label}
                  {link.badge && link.badge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {link.badge > 9 ? '9+' : link.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Desktop user menu */}
          <div className="hidden md:block">
            <NavUserMenu
              email={session?.user.email ?? ''}
              name={(profile as any)?.full_name ?? ''}
              tier={(profile as any)?.subscription_tier ?? 'free'}
            />
          </div>

          {/* Mobile burger */}
          <MobileNav
            links={links}
            pathname={pathname}
            email={session?.user.email ?? ''}
            name={(profile as any)?.full_name ?? ''}
            tier={(profile as any)?.subscription_tier ?? 'free'}
          />
        </div>
      </div>
    </header>
  )
}
