// apps/web/app/api/checkout/route.ts
// Creates a Stripe Checkout session for plan upgrades
// Called from: /settings/billing → "Upgrade" button

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

const PLAN_PRICES: Record<string, string> = {
  investor: process.env.STRIPE_PRICE_ID_INVESTOR!,
  agency:   process.env.STRIPE_PRICE_ID_AGENCY!,
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { plan } = await req.json()
  const priceId = PLAN_PRICES[plan]

  if (!priceId) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email, stripe_customer_id')
    .eq('id', session.user.id)
    .single()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer: profile?.stripe_customer_id ?? undefined,
    customer_email: profile?.stripe_customer_id ? undefined : profile?.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/settings/billing?success=true`,
    cancel_url:  `${appUrl}/settings/billing?cancelled=true`,
    metadata: { user_id: session.user.id, plan },
    subscription_data: {
      metadata: { user_id: session.user.id },
    },
    // Allow AED payments — Stripe supports AED for UAE cards
    currency: 'aed',
  })

  return NextResponse.json({ url: checkoutSession.url })
}
