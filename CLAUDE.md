# ShoreStack Vault — Zero-Knowledge Password & Document Manager
## Claude Cowork Project File

---

## Project Overview

**ShoreStack Vault** is a SaaS web application in the **Shorestack** family of apps (sister product to Shorestack Books). It replaces 1Password and similar password managers with a zero-knowledge encrypted vault where users store passwords, secure notes, credit cards, identities, and important documents. The server (Supabase) only ever stores AES-256 encrypted ciphertext — plaintext never leaves the user's device.

**Brand:** Shorestack — Swiss-inspired, modernist, 1970s optical-art aesthetic
**Target:** General consumers and small businesses moving away from expensive password manager subscriptions.
**Monetization:** Paid SaaS (no free tier) — Individual ($3.99/mo) / Team ($6.99/mo) / Custom (contact sales) via Stripe.
**Owner/Developer:** Brandon Day — Days Management LLC, Austin TX
**Live URL:** https://password-mu.vercel.app
**GitHub:** https://github.com/Brandondaymdr/password
**Supabase Project:** qdhwgzftpycdmovyniec

---

## Brand Guidelines

| Property | Value |
|---|---|
| Primary Color (Deep Ocean) | `#1b4965` — text, borders, navigation, wordmark |
| Accent Color (Seafoam) | `#5fa8a0` — active tabs, primary CTAs, pill toggles |
| Background (Sand) | `#fcfbf8` — page backgrounds, off-white surfaces |
| Success | `#16a34a` |
| Danger/Coral | `#e76f51` — alerts only |
| Warning | `#d97706` |
| Primary Font | Inter — all headings and body text |
| Monospace Font | JetBrains Mono — numbers, passwords, financial data |
| Border Radius | 0–2px (sharp corners, mathematical precision) |
| Card Shadows | None (flat, border only) |
| Borders | 1px solid Deep Ocean at 10–20% opacity |
| Primary Buttons | Solid Seafoam fill, sharp corners |
| Secondary Buttons | Deep Ocean outline, no fill |
| Logo | Wave grid mark (sinusoidal, 11 lines) + "shorestack" wordmark |
| Sub-brand | "shorestack vault" — wave mark color matches Seafoam accent |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Hosting | Vercel |
| Auth | Supabase Auth (email, magic link) |
| Database | Supabase PostgreSQL |
| File Storage | Supabase Storage (encrypted blobs) |
| Encryption | Web Crypto API (AES-256-GCM, PBKDF2) — native browser, no library |
| Styling | Tailwind CSS |
| Payments | Stripe (subscriptions) |
| Language | TypeScript |

---

## Core Security Architecture

```
Master Password
     │
     ▼
PBKDF2 (600,000 iterations) + unique kdf_salt (stored in profiles table)
     │
     ▼
Vault Key (AES-256 — NEVER stored, NEVER sent to server)
     │
     ▼
AES-256-GCM encrypt each vault item → store encrypted blob + IV in Supabase
```

**Rules that must NEVER be broken:**
- The Vault Key is derived in the browser and never transmitted
- Supabase stores only ciphertext, IV, and salts
- The master password is never stored anywhere
- Each vault item has its own unique IV
- File attachments are encrypted client-side before upload to Supabase Storage

---

## Database Schema

### `profiles` table
```sql
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  kdf_salt        TEXT NOT NULL,
  kdf_iterations  INT DEFAULT 600000,
  hint            TEXT,
  plan            TEXT DEFAULT 'individual' CHECK (plan IN ('individual', 'team', 'custom')),
  stripe_customer_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `vault_items` table
```sql
CREATE TABLE vault_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type        TEXT NOT NULL,         -- 'login' | 'secure_note' | 'credit_card' | 'identity'
  encrypted_data   TEXT NOT NULL,         -- AES-256-GCM JSON blob
  iv               TEXT NOT NULL,         -- base64 initialization vector
  search_index     TEXT,                  -- HMAC-SHA256 of item name
  favorite         BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### `vault_documents` table
```sql
CREATE TABLE vault_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_item_id       UUID REFERENCES vault_items(id) ON DELETE SET NULL,
  storage_path         TEXT NOT NULL,
  file_name_encrypted  TEXT NOT NULL,
  file_key_encrypted   TEXT NOT NULL,
  file_iv              TEXT NOT NULL,
  file_size            INT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
```

### `vault_audit_log` table
```sql
CREATE TABLE vault_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  item_id     UUID,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### Row-Level Security
All tables have RLS enabled with owner-only policies.

---

## Project File Structure

```
shorestack-vault/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── setup/page.tsx              ← master password setup flow
│   ├── (vault)/
│   │   ├── dashboard/page.tsx
│   │   ├── documents/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts       ← creates Stripe Checkout sessions
│   │   │   ├── webhook/route.ts        ← handles subscription lifecycle events
│   │   │   └── portal/route.ts         ← Stripe Customer Portal redirect
│   │   └── audit/route.ts
│   ├── auth/callback/route.ts          ← Supabase email confirmation handler
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── vault/
│   │   ├── AddItemModal.tsx
│   │   ├── VaultItemDetail.tsx
│   │   ├── PasswordGenerator.tsx
│   │   ├── DocumentUpload.tsx
│   │   └── PricingCards.tsx
│   └── ui/
├── lib/
│   ├── crypto.ts                       ← ALL encryption logic (AES-256-GCM, PBKDF2, HMAC)
│   ├── supabase.ts                     ← Browser Supabase client
│   ├── supabase-server.ts              ← Server + Admin Supabase clients
│   ├── stripe.ts                       ← Lazy-init Stripe client, price IDs, plan mapper
│   ├── plan-enforcement.ts             ← Plan limit checks (items, storage, audit)
│   └── vault-session.ts               ← In-memory vault key with 15min auto-lock
├── types/
│   └── vault.ts                        ← TypeScript types, PlanType, PLAN_LIMITS
├── middleware.ts                       ← Auth route protection
├── .env.local                          ← Environment variables (gitignored)
├── .env.example
└── CLAUDE.md                           ← this file
```

---

## Pricing & Plans

| Plan | Price | Users | Items | Storage | Audit | Shared Vaults |
|---|---|---|---|---|---|---|
| Individual | $3.99/mo | 1 | Unlimited | 5 GB | Yes | No |
| Team | $6.99/mo | 5 | Unlimited | 10 GB | Yes | Yes |
| Custom | Contact | Unlimited | Unlimited | Unlimited | Yes | Yes |

There is **no free tier**. All new signups default to the Individual plan.

### Stripe Integration
- **Checkout:** `/api/stripe/checkout` creates Checkout sessions, auto-creates Stripe customer
- **Webhook:** `/api/stripe/webhook` handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- **Portal:** `/api/stripe/portal` redirects to Stripe Customer Portal for self-serve billing
- **Plan sync:** Webhook updates `profiles.plan` in Supabase via admin client (bypasses RLS)

---

## Environment Variables (`.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID=
STRIPE_INDIVIDUAL_YEARLY_PRICE_ID=
STRIPE_TEAM_MONTHLY_PRICE_ID=
STRIPE_TEAM_YEARLY_PRICE_ID=

# App
NEXT_PUBLIC_APP_URL=https://password-mu.vercel.app
```

---

## Build Progress

- [x] Phase 1: Supabase setup (schema, RLS, triggers, storage bucket)
- [x] Phase 2: Next.js scaffold (auth pages, layout, Supabase client)
- [x] Phase 3: Encryption module (`lib/crypto.ts`)
- [x] Phase 4: Master password setup + login flow
- [x] Phase 5: Vault dashboard (list, add, edit, delete, search, favorites)
- [x] Phase 6: Password generator component
- [x] Phase 7: Document upload + encrypted storage
- [x] Phase 8: Secure notes, credit cards, identities
- [x] Phase 9: Search (HMAC index)
- [x] Phase 10: Audit log viewer
- [x] Phase 11: Stripe subscription + plan enforcement
- [x] Phase 12: Settings (change master password, export vault, delete account)
- [ ] Phase 13: Shorestack branding + landing page
- [ ] Phase 14: Browser extension (v2)
- [ ] Phase 15: PWA + biometric unlock (v2)

---

## Key Design Principles

- **Zero-knowledge first** — if in doubt, encrypt it
- **No plaintext in network requests** — all Supabase writes are ciphertext
- **Fail locked** — any error should lock the vault, not expose data
- **Audit everything** — every item view/create/edit/delete logged
- **Mobile-first UI** — most users will use this on their phone
- **Shorestack brand consistency** — match the Swiss-modernist aesthetic across all products

---

## Notes for Claude

- Always use `lib/crypto.ts` functions for any encryption/decryption — never inline crypto logic
- Never log decrypted data to console in production builds
- The vault key (`CryptoKey`) should only exist in `VaultSession` — never in React state, localStorage, or cookies
- Supabase RLS handles multi-tenancy — always confirm policies are active before storing data
- TypeScript strict mode is on — no `any` types in crypto or vault modules
- Follow Shorestack brand guidelines: Deep Ocean (#1b4965), Seafoam (#5fa8a0), Sand (#fcfbf8), Inter font, sharp corners, no shadows
