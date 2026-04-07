// apps/web/components/layout/Nav.tsx
// Top navigation bar — shown on all authenticated pages
// Server Component — reads session server-side

import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { NavUserMenu } from './NavUserMenu'

export async function Nav() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  const { data: profile } = session
    ? await supabase
        .from('user_profiles')
        .select('full_name, subscription_tier')
        .eq('id', session.user.id)
        .single()
    : { data: null }

  const { data: alertCount } = session
    ? await supabase
        .from('alerts_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false)
    : { data: null }

  const unread = (alertCount as any)?.count ?? 0

  const navLinks = [
    { href: '/dashboard', label: 'Projects' },
    { href: '/alerts',    label: 'Alerts', badge: unread > 0 ? unread : null },
  ]

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/dashboard" className="text-base font-medium text-gray-900">
            OffplanIQ
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="relative text-sm text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                {link.label}
                {link.badge && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {link.badge > 9 ? '9+' : link.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* User menu */}
          <NavUserMenu
            email={session?.user.email ?? ''}
            name={profile?.full_name ?? ''}
            tier={profile?.subscription_tier ?? 'free'}
          />

        </div>
      </div>
    </header>
  )
}
