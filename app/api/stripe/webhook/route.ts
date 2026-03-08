import { getStripe, getPlanFromPriceId } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

// Disable body parsing — Stripe needs the raw body for signature verification
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();

  try {
    switch (event.type) {
      // Checkout completed — activate subscription
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const subscriptionId = session.subscription as string;

        if (userId && subscriptionId) {
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id;
          const plan = getPlanFromPriceId(priceId);

          if (plan) {
            await supabaseAdmin
              .from('profiles')
              .update({
                plan,
                stripe_customer_id: session.customer as string,
              })
              .eq('id', userId);
          }
        }
        break;
      }

      // Subscription updated (upgrade/downgrade/renewal)
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        const priceId = subscription.items.data[0]?.price.id;

        if (userId) {
          if (subscription.status === 'active') {
            const plan = getPlanFromPriceId(priceId);
            if (plan) {
              await supabaseAdmin
                .from('profiles')
                .update({ plan })
                .eq('id', userId);
            }
          } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
            // Keep plan for now but could add a grace period flag
          }
        }
        break;
      }

      // Subscription cancelled or expired
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          await supabaseAdmin
            .from('profiles')
            .update({ plan: 'personal' })
            .eq('id', userId);
        }
        break;
      }

      // Invoice payment failed
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Could send an email or in-app notification here
        console.warn(`Payment failed for customer ${customerId}`);
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
