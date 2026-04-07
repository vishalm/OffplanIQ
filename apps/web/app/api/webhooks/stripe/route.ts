// apps/web/app/api/webhooks/stripe/route.ts
//
// Stripe webhook handler.
// Handles: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
//
// Setup:
//   1. stripe listen --forward-to localhost:3000/api/webhooks/stripe
//   2. Set STRIPE_WEBHOOK_SECRET in .env.local

import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

const TIER_MAP: Record<string, 'investor' | 'agency'> = {
  [process.env.STRIPE_PRICE_ID_INVESTOR!]: 'investor',
  [process.env.STRIPE_PRICE_ID_AGENCY!]:   'agency',
}

export async function POST(req: Request) {
  const body = await req.text()
  const signature = headers().get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      if (!userId) break

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const priceId = subscription.items.data[0].price.id
      const tier = TIER_MAP[priceId] ?? 'investor'

      await supabase
        .from('user_profiles')
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_tier: tier,
          subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString(),
          seats_limit: tier === 'agency' ? 5 : 1,
        } as any)
        .eq('id', userId)

      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const priceId = sub.items.data[0].price.id
      const tier = TIER_MAP[priceId] ?? 'investor'

      await supabase
        .from('user_profiles')
        .update({
          subscription_tier: sub.status === 'active' ? tier : 'free',
          subscription_ends_at: new Date(sub.current_period_end * 1000).toISOString(),
        } as any)
        .eq('stripe_subscription_id', sub.id)

      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription

      await supabase
        .from('user_profiles')
        .update({ subscription_tier: 'free', stripe_subscription_id: null } as any)
        .eq('stripe_subscription_id', sub.id)

      break
    }
  }

  return NextResponse.json({ received: true })
}
