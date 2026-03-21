# ShoreStack Vault — Zero-Knowledge Password & Document Manager
## Claude Cowork Project File

---

## Project Overview

**ShoreStack Vault** is a SaaS web application in the **Shorestack** family of apps (sister product to Shorestack Books). It replaces 1Password and similar password managers with a zero-knowledge encrypted vault where users store passwords, secure notes, credit cards, identities, and important documents. The server (Supabase) only ever stores AES-256 encrypted ciphertext — plaintext never leaves the user's device.

**Brand:** Shorestack — Swiss-inspired, modernist, 1970s optical-art aesthetic
**Target:** General consumers and small businesses moving away from expensive password manager subscriptions.
**Monetization:** Paid SaaS (no free tier) — Personal ($0.99/mo, 1 GB) / Plus ($1.99/mo, 10 GB) via Stripe.
**Owner/Developer:** Brandon Day — Days Management LLC, Austin TX
**Live URL:** https://password-mu.vercel.app
**GitHub:** https://github.com/Brandondaymdr/shorestack-vault
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
| Logo | Wave grid mark (sinusoidal, 11 lines) + "SHORESTACK" wordmark (uppercase, bold) |
| Sub-brand | "SHORESTACK VAULT" — single line, uppercase, matches shorestack.io/books format |
| Logo Component | `components/ui/ShorestackLogo.tsx` — SVG wave mark + text, supports horizontal/stacked/mark variants |

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
| Extension | Vite 6 + CRXJS (beta.28) + React 19 + Tailwind v4, Manifest V3 |
| PWA | Vanilla service worker, IndexedDB, WebAuthn |

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
- IndexedDB may only store encrypted ciphertext — never plaintext vault data
- WebAuthn enrollment must use `userVerification: 'required'`

---

## Database Schema

### `profiles` table
```sql
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  kdf_salt        TEXT NOT NULL,
  kdf_iterations  INT DEFAULT 600000,
  hint            TEXT,
  vault_verifier     TEXT,
  vault_verifier_iv  TEXT,
  plan            TEXT DEFAULT 'personal' CHECK (plan IN ('personal', 'plus')),
  stripe_customer_id TEXT,
  -- WebAuthn / Biometric (Phase 15)
  webauthn_credential_id         TEXT,
  webauthn_public_key            TEXT,
  webauthn_transports            TEXT[],
  biometric_vault_key_encrypted  TEXT,
  biometric_vault_key_iv         TEXT,
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
  action      TEXT NOT NULL,   -- 'unlock' | 'create' | 'edit' | 'delete' | 'export' | 'biometric_enrolled' | 'biometric_removed'
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
│   │   ├── dashboard/page.tsx          ← vault list + brute-force protection + PWAInstallPrompt
│   │   ├── documents/page.tsx
│   │   └── settings/page.tsx           ← atomic rekey, export re-auth, biometric disabled
│   ├── api/
│   │   ├── account/
│   │   │   └── delete/route.ts         ← account deletion + Stripe cancellation
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts       ← creates Stripe Checkout sessions
│   │   │   ├── webhook/route.ts        ← handles subscription lifecycle events
│   │   │   └── portal/route.ts         ← Stripe Customer Portal redirect
│   │   └── audit/route.ts             ← server-side audit logging (IP/user agent capture)
│   ├── auth/callback/route.ts          ← Supabase email confirmation handler
│   ├── manifest.ts                     ← PWA web manifest (generates /manifest.webmanifest)
│   ├── privacy/page.tsx                ← Privacy Policy
│   ├── terms/page.tsx                  ← Terms of Service
│   ├── page.tsx                        ← Landing page (hero, features, pricing, footer)
│   ├── layout.tsx                      ← Root layout (Inter + JetBrains Mono, Sand bg, PWA meta)
│   └── globals.css                     ← Brand theme (CSS vars, utility classes)
├── components/
│   ├── ui/
│   │   └── ShorestackLogo.tsx          ← SVG wave mark + wordmark (horizontal/stacked/mark)
│   ├── vault/
│   │   ├── AddItemModal.tsx
│   │   ├── VaultItemDetail.tsx
│   │   ├── PasswordGenerator.tsx
│   │   ├── DocumentUpload.tsx
│   │   ├── PricingCards.tsx
│   │   ├── BiometricEnroll.tsx         ← Settings: enroll Touch ID / Face ID / Windows Hello
│   │   ├── BiometricUnlock.tsx         ← Dashboard lock screen: biometric unlock button
│   │   └── PWAInstallPrompt.tsx        ← Install banner (Chrome/Android + iOS instructions)
│   └── PWARegister.tsx                 ← Registers service worker + requests persistent storage
├── lib/
│   ├── crypto.ts                       ← ALL encryption logic (AES-256-GCM, PBKDF2, HMAC)
│   ├── supabase.ts                     ← Browser Supabase client
│   ├── supabase-server.ts              ← Server + Admin Supabase clients
│   ├── stripe.ts                       ← Lazy-init Stripe client, price IDs, plan mapper
│   ├── plan-enforcement.ts             ← Plan limit checks (items, storage, audit)
│   ├── vault-session.ts                ← In-memory vault key with 15min auto-lock
│   ├── audit.ts                        ← Client-side helper to POST audit events to /api/audit
│   ├── webauthn.ts                     ← WebAuthn registration + authentication helpers
│   └── biometric-key.ts               ← Vault key wrapping/unwrapping for biometric unlock
├── public/
│   ├── sw.js                           ← Service worker (cache-first/stale-while-revalidate, no Supabase caching)
│   ├── icon-180.png                    ← Apple touch icon
│   ├── icon-192.png                    ← Android PWA icon
│   ├── icon-192-maskable.png           ← Android maskable icon
│   ├── icon-512.png                    ← Splash screen icon
│   └── icon-512-maskable.png           ← Splash screen maskable icon
├── types/
│   └── vault.ts                        ← TypeScript types, PlanType, PLAN_LIMITS, WebAuthn fields
├── middleware.ts                        ← Auth route protection
├── tsconfig.json                        ← Excludes extension/ directory
├── .env.local                           ← Environment variables (gitignored)
├── .env.example
├── .gitignore                           ← Includes extension/dist/, extension/node_modules/
├── docs/
│   ├── PHASE-14-15-BUILD-PLAN.md       ← Extension + PWA architecture & build plan
│   └── RESTART-INSTRUCTIONS.md         ← Quick-start guide for new Claude sessions
├── CLAUDE.md                            ← This file
├── README.md
└── extension/                           ← Chrome MV3 browser extension (separate Vite project)
    ├── src/
    │   ├── background/service-worker.ts ← Message router, vault session, Supabase auth
    │   ├── content/
    │   │   ├── content-script.ts        ← Page injection, form submit listener, autofill handler
    │   │   ├── form-detector.ts         ← Login form detection via password input scanning
    │   │   └── autofill.ts              ← Native value setter for React/Vue/Angular compatibility
    │   ├── popup/
    │   │   ├── App.tsx                  ← Root popup with screen routing
    │   │   └── pages/
    │   │       ├── Login.tsx            ← Email + password Supabase login
    │   │       ├── Unlock.tsx           ← Master password entry
    │   │       ├── VaultList.tsx        ← Search + item list, URL-matched sorting
    │   │       ├── ItemDetail.tsx       ← View/copy credentials, autofill button
    │   │       └── Generator.tsx        ← Password generator with strength meter
    │   ├── shared/
    │   │   ├── crypto.ts               ← Copy of lib/crypto.ts for extension bundle
    │   │   ├── vault-session.ts         ← In-memory CryptoKey with 15-min auto-lock
    │   │   ├── supabase-client.ts       ← Supabase client using chrome.storage.session
    │   │   └── types.ts                ← Extension-specific types + ExtensionMessageType
    │   ├── styles/globals.css           ← Tailwind v4 + Shorestack brand theme
    │   └── vite-env.d.ts               ← import.meta.env type reference
    ├── public/manifest.json             ← Manifest V3
    ├── vite.config.ts                   ← Vite + React + Tailwind + CRXJS
    ├── tsconfig.json                    ← Strict, ES2022, chrome types
    └── package.json                     ← React 19, Supabase JS, CRXJS beta.28
```

---

## Pricing & Plans

| Plan | Price | Items | Storage | Audit |
|---|---|---|---|---|
| Personal | $0.99/mo | Unlimited | 1 GB | Yes |
| Plus | $1.99/mo | Unlimited | 10 GB | Yes |

There is **no free tier**. All new signups default to the Personal plan. Storage-based pricing — tiers determined by storage usage.

**Current state (beta):** 1 user = 1 account. Multi-user accounts are not yet built.

### Multi-User Accounts (POST-BETA ROADMAP)

The Shorestack model is **storage-based, not per-user.** Each account can have up to 5 users sharing a storage pool. What triggers an upgrade is storage usage, not user count.

**Planned architecture:**
- `accounts` table — owner, plan, stripe_customer_id, storage pool
- `account_members` table — user_id, account_id, role (owner/member), invited_at
- Account owner invites members by email (up to 5 per account)
- Each member has their own master password (zero-knowledge requirement)
- Shared vaults use RSA keypairs: shared symmetric key encrypted to each member's public key
- All members' documents count toward the account's storage limit (1 GB or 10 GB)
- Plan upgrade triggered when pooled storage exceeds the current tier's limit

**What needs to be built:**
1. Database: `accounts` and `account_members` tables with RLS
2. Invitation flow: owner sends invite → member accepts → key exchange
3. Shared vault crypto: RSA keypair per user, shared vault key wrapped to each member's public key
4. Account-level storage tracking (sum all members' document sizes)
5. Member management UI in settings (invite, remove, view members)
6. Update Stripe to bill at the account level, not per-user
7. Update plan enforcement to check account-level storage, not per-user

**Do NOT launch shared vaults / multi-user until all 7 items above are complete.**

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
STRIPE_PERSONAL_MONTHLY_PRICE_ID=
STRIPE_PERSONAL_YEARLY_PRICE_ID=
STRIPE_PLUS_MONTHLY_PRICE_ID=
STRIPE_PLUS_YEARLY_PRICE_ID=

# App
NEXT_PUBLIC_APP_URL=https://password-mu.vercel.app
```

### Extension Environment (`.env` in `extension/`)

```env
VITE_SUPABASE_URL=https://qdhwgzftpycdmovyniec.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
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
- [x] Phase 13: Shorestack branding + landing page
- [x] Phase 14: Browser extension (Chrome MV3, Manifest V3)
- [x] Phase 15: PWA + biometric unlock (WebAuthn, IndexedDB offline cache)
- [x] Security Audit: 31 fixes (7 critical, 10 high, 14 medium) — see `FORENSIC-AUDIT-2026-03-21.md`

**GitHub commits (main branch):**
- `5fc72ba` — Pre-Phase 14 cleanup (assessment fixes)
- `ff223c0` — Phase 14: Browser extension (30 files)
- `e7a956c` — URL validation fix (type="url" → type="text" + auto-prepend https://)
- `16b5e74` — Phase 15: PWA + Biometric Unlock (20 files)
- `6ee9a0e` — Audit round 1-4 fixes (encryption, auth, security headers, extension save flow)
- `3f59c6d` — Forensic audit: 31 security fixes (7 critical, 10 high, 14 medium)

---

## Key Design Principles

- **Zero-knowledge first** — if in doubt, encrypt it
- **No plaintext in network requests** — all Supabase writes are ciphertext
- **Fail locked** — any error should lock the vault, not expose data
- **Audit everything** — every item view/create/edit/delete logged
- **Mobile-first UI** — most users will use this on their phone
- **Shorestack brand consistency** — match the Swiss-modernist aesthetic across all products

---

## Phase 14: Browser Extension Architecture

**Stack:** Vite 6 + CRXJS (beta.28) + React 19 + Tailwind v4, Manifest V3
**Location:** `extension/` directory (separate project with its own `package.json`)
**Status:** Complete and tested end-to-end

**Key architecture decisions:**
- Extension has its own vault session in service worker memory (independent from web app)
- User authenticates with Supabase in popup, enters master password to derive vault key
- `shared/crypto.ts` is a copy of `lib/crypto.ts` — same encryption, bundled separately
- Content scripts detect login forms via `<input type="password">` + MutationObserver
- Autofill requires explicit user click in popup (never automatic)
- MV3 service workers can terminate; vault key is lost → user re-enters master password
- Supabase session token stored in `chrome.storage.session` (cleared on browser close)
- URL inputs accept bare domains (auto-prepend `https://` on save)

**Extension message protocol (13 types):**
- `LOGIN` / `LOGOUT` — Supabase authentication
- `UNLOCK` / `LOCK` / `GET_STATUS` — Vault session management
- `GET_CREDENTIALS` — Fetch items matching current tab URL (hostname match)
- `SEARCH_VAULT` — Full vault search with decryption
- `AUTOFILL` — Fill form via content script
- `CAPTURE_CREDENTIALS` — Grab form values for saving
- `FORM_DETECTED` — Content script notifies service worker of login forms
- `SAVE_OFFER` / `SAVE_CREDENTIAL` — Save captured credentials to vault
- `GENERATE_PASSWORD` — Password generation in service worker

**Building the extension:**
```bash
cd extension
npm install
cp .env.example .env  # Add Supabase URL + anon key
npm run build         # Output in extension/dist/
```
Load unpacked from `extension/dist/` in `chrome://extensions` (Developer mode on).

---

## Phase 15: PWA + Biometric Architecture

**PWA Stack:** Vanilla service worker (`public/sw.js`)
**Biometric Stack:** WebAuthn API — **DISABLED pending server-side verification**
**Status:** PWA caching works. Offline vault access NOT implemented (future feature). Biometric enrollment disabled in UI.

**Service worker caching strategies (`public/sw.js`):**
- **Supabase API calls:** Never cached (security: prevents XSS exfiltration of kdf_salt/tokens)
- **Static assets (images, fonts, CSS):** Cache-first
- **App pages and JS:** Stale-while-revalidate
- Pre-caches app shell on install. Skips non-GET requests.

**Offline vault access:** Not yet implemented. IndexedDB cache and sync modules were removed as dead code during the March 2026 security audit. When implementing offline support, create new modules with proper cross-user isolation and sync conflict resolution.

**WebAuthn / Biometric (DISABLED):**
- `BiometricEnroll` component exists but is commented out in settings + dashboard
- `BiometricUnlock` component exists but is commented out in dashboard
- Reason: WebAuthn challenges are generated client-side with no server verification
- TODO: Implement server-side WebAuthn ceremony before re-enabling
- DB columns (`webauthn_credential_id`, `webauthn_public_key`, etc.) are in place for future use

**Biometric unlock (`lib/biometric-key.ts` + `components/vault/BiometricUnlock.tsx`):**
- Shows on Dashboard lock screen when `profile.webauthn_credential_id` exists
- Calls `navigator.credentials.get()` to verify biometric
- 3-attempt limit before hiding biometric button
- Note: Current implementation verifies biometric but still needs master password to unwrap key. True passwordless requires WebAuthn PRF extension (future iteration).

**PWA install prompt (`components/vault/PWAInstallPrompt.tsx`):**
- Catches `beforeinstallprompt` event on Chrome/Android
- iOS detection shows "Tap Share → Add to Home Screen" instructions
- 7-day dismissal memory via localStorage

**New profiles columns (Phase 15C migration — already applied):**
```sql
webauthn_credential_id TEXT
webauthn_public_key TEXT
webauthn_transports TEXT[]
biometric_vault_key_encrypted TEXT
biometric_vault_key_iv TEXT
```

---

## Notes for Claude

- Always use `lib/crypto.ts` functions for any encryption/decryption — never inline crypto logic
- For the extension, copy `lib/crypto.ts` to `extension/src/shared/crypto.ts` — keep in sync manually
- Never log decrypted data to console in production builds
- The vault key (`CryptoKey`) should only exist in `VaultSession` — never in React state, localStorage, or cookies
- IndexedDB may only store encrypted ciphertext — never plaintext vault data
- WebAuthn enrollment must use `userVerification: 'required'` — never 'discouraged'
- Supabase RLS handles multi-tenancy — always confirm policies are active before storing data
- TypeScript strict mode is on — no `any` types in crypto or vault modules
- Root `tsconfig.json` excludes `extension/` — the extension has its own tsconfig
- Follow Shorestack brand guidelines: Deep Ocean (#1b4965), Seafoam (#5fa8a0), Sand (#fcfbf8), Inter font, sharp corners, no shadows
- `themeColor` uses the `viewport` export (not `metadata`) per Next.js best practices
- Patch workflow for pushing changes: generate patch in cloud → save to `~/Desktop/Storage/Claude/password/` → user applies with `git apply` → commit and push
