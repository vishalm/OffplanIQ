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

  return (
    <header className="sticky top-0 z-50 glass border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-12">

          <Link href="/analytics" className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="14" width="6" height="16" rx="1.5" fill="#007AFF" opacity=".4"/>
              <rect x="10" y="8" width="6" height="22" rx="1.5" fill="#007AFF" opacity=".6"/>
              <rect x="18" y="2" width="6" height="28" rx="1.5" fill="#007AFF"/>
              <rect x="26" y="10" width="6" height="20" rx="1.5" fill="#007AFF" opacity=".5"/>
            </svg>
            <span className="text-sm font-semibold text-gray-900">OffplanIQ</span>
          </Link>

          <nav className="flex items-center gap-0.5">
            {[
              { href: '/analytics', label: 'Dashboard' },
              { href: '/dashboard', label: 'Projects' },
              { href: '/alerts', label: 'Alerts', badge: unread > 0 ? unread : null },
            ].map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="relative text-[13px] font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-black/[0.04] transition-colors"
              >
                {link.label}
                {link.badge && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center px-1">
                    {link.badge > 9 ? '9+' : link.badge}
                  </span>
                )}
              </Link>
            ))}
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
