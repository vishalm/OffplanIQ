'use client'
// apps/web/app/auth/login/page.tsx

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = params.get('redirectTo') ?? '/analytics'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(redirectTo)
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center flex flex-col items-center">
          <div className="flex items-center gap-2.5 mb-2">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="14" width="6" height="16" rx="1.5" fill="#007AFF" opacity=".4"/>
              <rect x="10" y="8" width="6" height="22" rx="1.5" fill="#007AFF" opacity=".6"/>
              <rect x="18" y="2" width="6" height="28" rx="1.5" fill="#007AFF"/>
              <rect x="26" y="10" width="6" height="20" rx="1.5" fill="#007AFF" opacity=".5"/>
            </svg>
            <span className="text-xl font-bold text-gray-900">Offplan<span className="text-blue-600">IQ</span></span>
          </div>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          No account?{' '}
          <Link href="/auth/register" className="text-gray-900 underline">
            Create one free
          </Link>
        </p>

      </div>
    </div>
  )
}
