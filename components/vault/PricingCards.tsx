'use client';

import { useState } from 'react';
import type { PlanType } from '@/types/vault';

interface PricingCardsProps {
  currentPlan: PlanType;
  onManageBilling: () => void;
}

const plans = [
  {
    id: 'personal' as PlanType,
    name: 'Personal',
    price: '$0.99',
    period: '/month',
    features: [
      'Unlimited vault items',
      '1 GB document storage',
      'AES-256 zero-knowledge encryption',
      'Password generator',
      'Audit activity log',
      'Logins, notes, cards, identities',
    ],
    cta: 'Get Started',
    priceKey: 'personal_monthly',
    highlight: true,
  },
  {
    id: 'plus' as PlanType,
    name: 'Plus',
    price: '$1.99',
    period: '/month',
    features: [
      'Everything in Personal',
      '10 GB document storage',
      'Shared vaults',
      'Priority support',
      'Perfect for families & teams',
    ],
    cta: 'Upgrade to Plus',
    priceKey: 'plus_monthly',
  },
];

export default function PricingCards({ currentPlan, onManageBilling }: PricingCardsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(priceKey: string) {
    setLoading(priceKey);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to start checkout');
      }
    } catch {
      alert('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isUpgrade = currentPlan === 'personal' && plan.id === 'plus';

          return (
            <div
              key={plan.id}
              className={`relative rounded-sm border p-5 ${
                plan.highlight
                  ? 'border-[#5fa8a0] bg-[#5fa8a0]/10'
                  : 'border-[#1b4965]/15 bg-white'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-[#5fa8a0] px-2.5 py-0.5 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}

              <h3 className="text-lg font-semibold text-[#1b4965]">{plan.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-[#1b4965]">{plan.price}</span>
                <span className="text-sm text-[#1b4965]/60">{plan.period}</span>
              </div>

              <ul className="mt-4 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#1b4965]/70">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#5fa8a0]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full rounded-sm border border-[#1b4965]/15 px-4 py-2.5 text-sm font-medium text-[#1b4965]/60"
                  >
                    Current Plan
                  </button>
                ) : isUpgrade && plan.priceKey ? (
                  <button
                    onClick={() => handleUpgrade(plan.priceKey!)}
                    disabled={loading === plan.priceKey}
                    className="w-full rounded-sm bg-[#5fa8a0] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4d8f87] disabled:opacity-50"
                  >
                    {loading === plan.priceKey ? 'Redirecting...' : plan.cta}
                  </button>
                ) : (
                  <button
                    onClick={onManageBilling}
                    className="w-full rounded-sm border border-[#1b4965]/15 px-4 py-2.5 text-sm font-medium text-[#1b4965]/70 hover:bg-[#1b4965]/5"
                  >
                    Manage Billing
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {currentPlan && (
        <button
          onClick={onManageBilling}
          className="mt-2 text-sm text-[#5fa8a0] underline hover:text-[#4d8f87]"
        >
          Manage subscription &amp; billing in Stripe
        </button>
      )}

      <p className="text-xs text-[#1b4965]/50 mt-4">
        Need more than 10 GB? <a href="mailto:brandon@daysllc.com?subject=ShoreStack%20Vault%20Custom%20Storage" className="text-[#5fa8a0] hover:underline">Contact us</a> for custom storage limits.
      </p>
    </div>
  );
}
