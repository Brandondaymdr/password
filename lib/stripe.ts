// ============================================
// ShoreStack Vault — Stripe Helpers
// ============================================

import Stripe from 'stripe';

// Lazy-init to avoid crashing at build time when env vars aren't set
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// Price IDs — set these after creating products in Stripe Dashboard
export const PRICE_IDS = {
  personal_monthly: process.env.STRIPE_PERSONAL_MONTHLY_PRICE_ID || '',
  personal_yearly: process.env.STRIPE_PERSONAL_YEARLY_PRICE_ID || '',
  plus_monthly: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID || '',
  plus_yearly: process.env.STRIPE_PLUS_YEARLY_PRICE_ID || '',
} as const;

export type PriceKey = keyof typeof PRICE_IDS;

// Map Stripe price IDs back to plan names
export function getPlanFromPriceId(priceId: string): 'personal' | 'plus' | null {
  if (priceId === PRICE_IDS.personal_monthly || priceId === PRICE_IDS.personal_yearly) return 'personal';
  if (priceId === PRICE_IDS.plus_monthly || priceId === PRICE_IDS.plus_yearly) return 'plus';
  return null;
}
