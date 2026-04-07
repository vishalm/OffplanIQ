'use client'
// apps/web/components/ui/UpgradeButton.tsx

import { useState } from 'react'

export function UpgradeButton({ plan }: { plan: 'investor' | 'agency' }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleUpgrade() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition"
      >
        {loading ? 'Loading…' : `Upgrade to ${plan === 'agency' ? 'Agency' : 'Investor'}`}
      </button>
      {error && <p className="text-xs text-red-500 mt-2 text-center">{error}</p>}
    </div>
  )
}
