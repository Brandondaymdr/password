# VaultStack — Zero-Knowledge Password & Document Manager
## Claude Cowork Project File

---

## Project Overview

**VaultStack** is a SaaS web application that replaces 1Password and similar password managers. It is a zero-knowledge encrypted vault where users store passwords, secure notes, credit cards, identities, and important documents. The server (Supabase) only ever stores AES-256 encrypted ciphertext — plaintext never leaves the user's device.

**Target:** General consumers and small businesses moving away from expensive password manager subscriptions.
**Monetization:** Freemium SaaS — Free / Pro ($3/mo) / Team ($6/user/mo) via Stripe.
**Owner/Developer:** Brandon Day — Days Management LLC, Austin TX

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Hosting | Vercel |
| Auth | Supabase Auth (email, Google OAuth, magic link, MFA) |
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
  kdf_salt        TEXT NOT NULL,         -- unique per user, generated on signup
  kdf_iterations  INT DEFAULT 600000,
  hint            TEXT,                  -- optional master password hint
  plan            TEXT DEFAULT 'free',   -- 'free' | 'pro' | 'team'
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
  search_index     TEXT,                  -- HMAC-SHA256 of item name (searchable without exposing name)
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
  storage_path         TEXT NOT NULL,      -- Supabase Storage encrypted file path
  file_name_encrypted  TEXT NOT NULL,      -- AES encrypted original filename
  file_key_encrypted   TEXT NOT NULL,      -- per-file AES key, encrypted with vault key
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
  action      TEXT NOT NULL,   -- 'unlock' | 'view' | 'create' | 'edit' | 'delete' | 'export'
  item_id     UUID,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### Row-Level Security (apply to ALL tables)
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_only" ON profiles USING (auth.uid() = id);
CREATE POLICY "owner_only" ON vault_items USING (auth.uid() = user_id);
CREATE POLICY "owner_only" ON vault_documents USING (auth.uid() = user_id);
CREATE POLICY "owner_only" ON vault_audit_log USING (auth.uid() = user_id);
```

---

## Project File Structure

```
vaultstack/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── setup/page.tsx          ← master password setup flow
│   ├── (vault)/
│   │   ├── dashboard/page.tsx
│   │   ├── logins/page.tsx
│   │   ├── documents/page.tsx
│   │   ├── notes/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── stripe/webhook/route.ts
│   │   └── audit/route.ts
│   └── layout.tsx
├── components/
│   ├── vault/
│   │   ├── VaultItem.tsx
│   │   ├── AddItemModal.tsx
│   │   ├── PasswordGenerator.tsx
│   │   └── DocumentUpload.tsx
│   └── ui/                         ← shared Tailwind components
├── lib/
│   ├── crypto.ts                   ← ALL encryption logic lives here
│   ├── supabase.ts                 ← Supabase client
│   ├── stripe.ts                   ← Stripe helpers
│   └── vault-session.ts            ← in-memory vault key session manager
├── types/
│   └── vault.ts                    ← TypeScript types for all vault entities
└── CLAUDE.md                       ← this file
```

---

## Encryption Module (`lib/crypto.ts`) — Key Functions to Build

```typescript
// Derive vault key from master password (never stored)
deriveVaultKey(masterPassword: string, salt: string): Promise<CryptoKey>

// Encrypt a vault item
encryptItem(data: object, vaultKey: CryptoKey): Promise<{ encrypted: string, iv: string }>

// Decrypt a vault item
decryptItem(encrypted: string, iv: string, vaultKey: CryptoKey): Promise<object>

// Generate HMAC search index for item name
generateSearchIndex(name: string, vaultKey: CryptoKey): Promise<string>

// Generate a strong random password
generatePassword(length: number, options: PasswordOptions): string

// Encrypt a file for document storage
encryptFile(file: File, vaultKey: CryptoKey): Promise<{ encryptedBuffer: ArrayBuffer, fileKey: string, iv: string }>
```

---

## Vault Session Management

The vault key must be held in memory for the current session (locked after timeout or tab close). Use a module-level variable in `lib/vault-session.ts`:

```typescript
// Store vault key in memory only — cleared on lock/logout
let _vaultKey: CryptoKey | null = null;
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity lock

export const VaultSession = {
  set: (key: CryptoKey) => { _vaultKey = key },
  get: () => _vaultKey,
  lock: () => { _vaultKey = null },
  isUnlocked: () => _vaultKey !== null
}
```

---

## User Flows

### 1. New User Signup
1. Create account (email + password for Supabase Auth — this is NOT the vault master password)
2. Prompted to create a **Master Password** (separate from account password)
3. App generates `kdf_salt`, runs PBKDF2 → derives Vault Key in browser
4. `kdf_salt` and `kdf_iterations` saved to `profiles` table
5. Vault Key held in session memory — user is now "unlocked"

### 2. Returning User Login
1. Login with email/password (Supabase Auth)
2. Prompted for Master Password
3. App fetches `kdf_salt` from `profiles`, re-derives Vault Key
4. Vault unlocked — items fetched and decrypted client-side

### 3. Auto-Lock
- Vault locks after 15 minutes of inactivity (configurable in settings)
- On lock: `VaultSession.lock()` called, vault key cleared from memory
- User must re-enter Master Password to unlock

---

## Build Order (follow this sequence)

1. **[PHASE 1]** Supabase setup — run schema SQL, enable RLS, configure Auth
2. **[PHASE 2]** Next.js project scaffold — auth pages, layout, Supabase client
3. **[PHASE 3]** `lib/crypto.ts` — full encryption module with tests
4. **[PHASE 4]** Master password setup + login flow
5. **[PHASE 5]** Vault dashboard — list, add, edit, delete logins
6. **[PHASE 6]** Password generator component
7. **[PHASE 7]** Document upload + encrypted storage
8. **[PHASE 8]** Secure notes, credit cards, identities
9. **[PHASE 9]** Search (HMAC index)
10. **[PHASE 10]** Audit log viewer (Pro feature)
11. **[PHASE 11]** Stripe subscription + plan enforcement
12. **[PHASE 12]** Settings — change master password, export vault, delete account

---

## Environment Variables (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=https://vaultstack.app
```

---

## Plan Enforcement

Check `profiles.plan` on the server before:
- Uploading documents (Free: 100MB limit, Pro: 5GB)
- Creating vault items (Free: 50 items, Pro: unlimited)
- Accessing audit log (Pro only)
- Creating shared vaults (Team only)

---

## Key Design Principles

- **Zero-knowledge first** — if in doubt, encrypt it
- **No plaintext in network requests** — all Supabase writes are ciphertext
- **Fail locked** — any error should lock the vault, not expose data
- **Audit everything** — every item view/create/edit/delete logged
- **Mobile-first UI** — most users will use this on their phone

---

## Future Features (v2)

- Browser extension (Chrome/Firefox) for autofill
- iOS/Android PWA with biometric unlock
- Emergency access (trusted contact can request access after delay)
- Shared vaults (Team plan)
- CSV import from 1Password, LastPass, Bitwarden
- TOTP/2FA code generator built-in
- Google Drive sync option for document backups (personal/power user tier)

---

## Notes for Claude

- Always use `lib/crypto.ts` functions for any encryption/decryption — never inline crypto logic
- Never log decrypted data to console in production builds
- The vault key (`CryptoKey`) should only exist in `VaultSession` — never in React state, localStorage, or cookies
- Supabase RLS handles multi-tenancy — always confirm policies are active before storing data
- TypeScript strict mode is on — no `any` types in crypto or vault modules
