# ShoreStack Vault — Fix Plan

**Date:** 2026-03-17
**Based on:** FORENSIC-AUDIT-2026-03-17 + independent code review

---

## Audit Verification Summary

I reviewed every file cited in the audit against the actual source. All 10 findings are **confirmed accurate**. I also found **5 additional issues** the audit missed.

---

## Round 1: Critical Data-Integrity Fixes

These must be done first because they cause data loss or corruption for users right now.

### Fix 1.1 — Document filename IV not stored (Audit #1, Critical)

**Problem confirmed in code:**
- `DocumentUpload.tsx:65` saves `encryptedName.encrypted` but discards `encryptedName.iv`
- `documents/page.tsx:51` tries to decrypt the filename using `row.file_iv` (which is the *file body* IV, not the filename IV)
- `crypto.ts:358-363` shows `encryptFilename()` returns `{ encrypted, iv }` — the IV is available, just never saved

**Fix:**
1. Add `file_name_iv` column to `vault_documents` table in Supabase
2. In `DocumentUpload.tsx:61-69`, also save `file_name_iv: encryptedName.iv`
3. In `documents/page.tsx:51`, use `row.file_name_iv` instead of `row.file_iv`
4. Update `VaultDocumentRow` type in `types/vault.ts` to include `file_name_iv`
5. Write a migration script to attempt re-linking orphaned docs (existing uploads are likely unrecoverable unless the user re-uploads)

**Files to change:** `components/vault/DocumentUpload.tsx`, `app/(vault)/documents/page.tsx`, `types/vault.ts`, Supabase schema

### Fix 1.2 — Master password rotation is incomplete rekey (Audit #2, Critical)

**Problem confirmed in code:**
- `settings/page.tsx:77-134` only re-encrypts `vault_items.encrypted_data` and the vault verifier
- Does NOT touch: `vault_documents.file_name_encrypted`, `vault_documents.file_key_encrypted`, `vault_items.search_index`, or biometric wrapping fields on `profiles`
- After rotation, all documents become permanently unreadable and search indexes become stale

**Fix:**
1. After re-encrypting vault items, also fetch all `vault_documents` rows
2. For each document: decrypt `file_name_encrypted` and `file_key_encrypted` with old key, re-encrypt with new key, update the row
3. Recompute `search_index` for every vault item (it's HMAC-based via `generateSearchIndex()`, so it's key-dependent)
4. Clear or re-wrap biometric fields (`biometric_vault_key_encrypted`, `biometric_vault_key_iv`) — simplest fix is to clear them and require re-enrollment
5. Wrap the entire operation in a progress indicator and error handling — if any item fails mid-rotation, the vault is in a mixed-key state. Consider a transaction-like approach: re-encrypt everything in memory first, then batch-update

**Files to change:** `app/(vault)/settings/page.tsx`, possibly extract into `lib/rekey.ts`

### Fix 1.3 — Delete account doesn't actually delete (Audit #3, Critical)

**Problem confirmed in code:**
- `settings/page.tsx:169-186` removes storage files and signs out, but never issues a DELETE for the auth user, profiles row, vault_items rows, vault_documents rows, or audit_log rows
- Line 181 comment says "Supabase cascade will delete" but no DELETE is ever issued to trigger a cascade

**Fix:**
1. Create a new API route `app/api/account/delete/route.ts`
2. Use the Supabase service role key (server-side only) to:
   - Delete all `vault_documents` rows + storage objects
   - Delete all `vault_items` rows
   - Delete all `vault_audit_log` rows
   - Delete the `profiles` row
   - Delete the auth user via `supabase.auth.admin.deleteUser(userId)`
3. In the settings page, call this API route instead of the current client-side approach
4. Only sign out and redirect after the API confirms deletion succeeded

**Files to change:** New `app/api/account/delete/route.ts`, `app/(vault)/settings/page.tsx`, `lib/supabase-server.ts` (may need service role client)

---

## Round 2: Security & Trust Fixes

These don't cause data loss but they undermine trust in the product.

### Fix 2.1 — Biometric unlock: remove or gate behind "beta" (Audit #4, High)

**Problem confirmed in code:**
- `webauthn.ts:34,95` — challenges generated client-side, never sent to or verified by a server
- `BiometricUnlock.tsx:59` — after "successful" biometric auth, just shows a message asking for the master password anyway
- `biometric-key.ts:83-91` — vault key is encrypted with itself, providing no independent recovery path

**Fix (recommended: remove for now):**
1. Remove BiometricUnlock from `dashboard/page.tsx:200-221`
2. Remove BiometricEnroll from `settings/page.tsx:276`
3. Remove the biometric fields from the profile display
4. Keep the library files (`webauthn.ts`, `biometric-key.ts`, `BiometricUnlock.tsx`, `BiometricEnroll.tsx`) for future development but don't surface them in UI
5. Add a TODO comment documenting the correct implementation path: server-side WebAuthn ceremony + PRF extension for device-bound key

**Files to change:** `app/(vault)/dashboard/page.tsx`, `app/(vault)/settings/page.tsx`

### Fix 2.2 — PWA assets blocked by auth middleware (Audit #5, High)

**Problem confirmed in code:**
- `middleware.ts:42-43` — public routes list doesn't include `/manifest.webmanifest` or `/sw.js`
- `middleware.ts:71` — the matcher pattern excludes `.png/.svg` files but not `.js` or `.webmanifest`
- The service worker and manifest get 307-redirected to `/login` for unauthenticated users, breaking PWA install

**Fix:**
1. Add `/manifest.webmanifest` and `/sw.js` to the `publicRoutes` array in `middleware.ts:42`
2. Also consider adding these to the matcher exclusion pattern at line 71
3. Verify by testing: `curl -I https://password-mu.vercel.app/manifest.webmanifest` should return 200, not 307

**Files to change:** `middleware.ts`

### Fix 2.3 — Password field shown as plaintext (Audit #6, Medium)

**Problem confirmed in code:**
- `AddItemModal.tsx:263` — the login password input uses `type="text"` with `font-mono` class

**Fix:**
1. Change `type="text"` to `type="password"` on line 263
2. Add a show/hide toggle button (eye icon) next to the password field
3. Add state: `const [showPassword, setShowPassword] = useState(false)`
4. Use `type={showPassword ? 'text' : 'password'}`

**Files to change:** `components/vault/AddItemModal.tsx`

### Fix 2.4 — Raw Supabase auth errors exposed to users (Audit #8, Medium)

**Problem confirmed in code:**
- `login/page.tsx:29` — `setError(authError.message)` passes Supabase error strings directly
- `login/page.tsx:58` — same for magic link flow
- `signup/page.tsx:44` — same for signup

**Fix:**
1. Create a helper `normalizeAuthError(message: string): string` in `lib/auth-errors.ts`
2. Map known Supabase messages to user-friendly versions:
   - "Invalid login credentials" → "Email or password is incorrect"
   - "User already registered" → "An account with this email already exists"
   - "Email rate limit exceeded" → "Too many attempts. Please try again later"
   - All others → "Something went wrong. Please try again."
3. Use this helper in login, signup, and magic link flows

**Files to change:** New `lib/auth-errors.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`

### Fix 2.5 — Missing security headers (Audit #9, Medium)

**Problem confirmed:** No security headers configured anywhere in `next.config.ts` or middleware.

**Fix:**
Add headers to `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com; frame-ancestors 'none';" },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ],
    }];
  },
};
```

**Files to change:** `next.config.ts`

---

## Round 3: Build Health & Developer Experience

### Fix 3.1 — Build fails without env vars (Audit #10, Medium)

**Problem confirmed in code:**
- `lib/supabase.ts:10-12` throws during Next.js build-time prerendering when env vars are absent

**Fix:**
Replace the throw with a graceful fallback:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
```
This moves the check inside the function so it only throws at runtime, not during static analysis/build.

**Files to change:** `lib/supabase.ts`

### Fix 3.2 — Fix all lint errors

Run `npm run lint` and resolve all 32 issues. Most are likely unused variables, missing deps in `useEffect`, and type issues.

### Fix 3.3 — Add CI pipeline

Create `.github/workflows/ci.yml` with lint, typecheck, and build steps.

---

## Round 4: Extension Completeness

### Fix 4.1 — Extension SAVE_OFFER handler missing (Audit #7, Medium)

**Problem confirmed in code:**
- `content-script.ts:105-113` sends `SAVE_OFFER` on form submit
- `service-worker.ts:26-63` `handleMessage` switch has no case for `SAVE_OFFER` — falls through to the default "Unknown message type" error

**Fix:**
Add a `SAVE_OFFER` case to the service worker that either:
- (Option A) Calls `handleSaveCredential()` directly to auto-save, or
- (Option B) Stores the pending credential and shows a notification/badge prompting the user to confirm save via the popup

Option B is recommended — auto-saving is aggressive and users expect a confirmation prompt.

**Files to change:** `extension/src/background/service-worker.ts`, possibly `extension/src/shared/types.ts`

---

## Round 5: Additional Issues Found (Not in Audit)

### Fix 5.1 — Dashboard doesn't use vault-cache or vault-sync (NEW, Medium)

**Problem:** `lib/vault-cache.ts` and `lib/vault-sync.ts` are fully implemented but never imported or called anywhere in the app. `dashboard/page.tsx:112` fetches directly from Supabase with no caching.

**Fix:** Wire `syncVaultToCache()` into the dashboard's `loadItems()` and `setupSyncListeners()` into the page's `useEffect`.

**Files to change:** `app/(vault)/dashboard/page.tsx`

### Fix 5.2 — Plan enforcement helpers exist but are unused (NEW, Medium)

**Problem:** `lib/plan-enforcement.ts` has `checkStorageLimit()`, `checkSharedVaultAccess()`, and `checkAuditAccess()` — none are called anywhere. Users on the Personal plan can upload unlimited files.

**Fix:** Call `checkStorageLimit()` in `DocumentUpload.tsx` before upload. Gate shared vault features and extended audit log behind plan checks.

**Files to change:** `components/vault/DocumentUpload.tsx`, possibly `app/(vault)/settings/page.tsx`

### Fix 5.3 — Password change doesn't re-derive with new salt (NEW, Medium)

**Problem:** `settings/page.tsx:91` — `deriveVaultKey(newPw, profile.kdf_salt, ...)` reuses the old salt. Best practice for password rotation is to generate a fresh salt.

**Fix:** Generate a new KDF salt during password change and save it alongside the new verifier.

**Files to change:** `app/(vault)/settings/page.tsx`

### Fix 5.4 — Audit logging goes directly from client to DB (NEW, Low)

**Problem:** Throughout the app, audit log entries are written client-side via `supabase.from('vault_audit_log').insert(...)`. The server-side audit endpoint at `app/api/audit/route.ts` (which captures IP + user agent) is never used.

**Fix:** Route all audit writes through the server endpoint to capture IP and user agent consistently. This also avoids trusting the client to report accurate audit data.

**Files to change:** All files that write to `vault_audit_log` directly (dashboard, documents, settings, AddItemModal)

### Fix 5.5 — No tests whatsoever (NEW, Medium)

**Problem:** Zero test files in the repo. For a security product, the critical crypto flows especially need coverage.

**Fix:** Add at minimum:
- Unit tests for `lib/crypto.ts` (encrypt/decrypt round-trip, search index determinism, filename encrypt/decrypt)
- Unit tests for `lib/plan-enforcement.ts`
- Integration test for password change rekey flow
- Integration test for document upload/download round-trip

---

## Execution Order

| Phase | Fixes | Estimated Effort | Risk if Skipped |
|-------|-------|-----------------|----------------|
| **Round 1** | 1.1, 1.2, 1.3 | 2-3 days | Active data loss/corruption |
| **Round 2** | 2.1–2.5 | 2-3 days | Security/trust issues |
| **Round 3** | 3.1–3.3 | 1 day | Build/deploy reliability |
| **Round 4** | 4.1 | 0.5 day | Extension is half-finished |
| **Round 5** | 5.1–5.5 | 3-4 days | Missing features, no test safety net |

**Total estimated effort: 9-12 working days**

---

## Supabase Schema Change Required

Before starting Round 1, add this column:

```sql
ALTER TABLE vault_documents
ADD COLUMN file_name_iv TEXT;
```

This is the only schema change needed for the immediate fixes. The audit recommends bringing all Supabase schema/RLS/policies into version control as well — that should happen in parallel.

---

## Gate for "Production Safe"

Do not market as a secure password manager until:

- [ ] Document upload/download works reliably (Round 1.1)
- [ ] Password rotation re-encrypts everything (Round 1.2)
- [ ] Account deletion actually deletes (Round 1.3)
- [ ] Biometric is removed or properly implemented (Round 2.1)
- [ ] PWA actually works for logged-out users (Round 2.2)
- [ ] Security headers are deployed (Round 2.5)
- [ ] Build passes cleanly without workarounds (Round 3.1)
- [ ] Critical flows have automated tests (Round 5.5)
