// apps/web/lib/admin/guard.ts
//
// Admin gate. Currently driven by an env allow-list — fastest secure path
// that doesn't need a schema migration. To promote to a DB-backed role,
// swap `isAdminEmail` for a `user_profiles.role = 'admin'` lookup; the
// callsites won't have to change.
//
//   ADMIN_EMAILS=vishal@example.com,ceo@example.com
//
// If ADMIN_EMAILS is unset, NO ONE is admin (closed by default).

import 'server-only'
import { createServerClient } from '@/lib/supabase/server'

export interface AdminContext {
  user_id: string
  email:   string
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmails().includes(email.trim().toLowerCase())
}

/** Resolve the current admin from the request session. Returns null if the
 *  caller isn't signed in OR isn't on the allow-list. Use as the first line
 *  of every admin route. */
export async function requireAdmin(): Promise<AdminContext | null> {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) return null
  if (!isAdminEmail(user.email)) return null
  return { user_id: user.id, email: user.email }
}
