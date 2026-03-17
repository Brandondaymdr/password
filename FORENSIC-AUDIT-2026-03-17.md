# ShoreStack Vault Forensic Audit

Date: 2026-03-17

Repo audited: https://github.com/Brandondaymdr/shorestack-vault

Live app checked: https://password-mu.vercel.app/

Reference reviewed: https://developer.1password.com/

## Scope

This audit covered:

- Source review of the Next.js app, browser extension, crypto helpers, auth flow, billing routes, and PWA code.
- Local verification with `npm install`, `npm run lint`, and `npm run build`.
- Limited live deployment checks using HTTP responses from the Vercel app.

This audit did not include direct access to the Supabase dashboard, Vercel project settings, Stripe dashboard, or production database policies. Because the repo does not include Supabase SQL migrations or policy definitions, row-level security and storage bucket policies could not be fully verified.

## Executive Assessment

Current state: not production-safe for a password/document vault in its current form.

The app has a solid direction: client-side encryption, a clear master-password model, a clean UI, and a reasonable core item model for individuals and small businesses. But several implementation flaws are serious enough to block production trust:

- Document storage appears functionally broken.
- Master-password rotation can strand encrypted data.
- "Delete account" does not actually delete the account or vault data.
- Biometric unlock is incomplete and not implemented as a secure WebAuthn-backed unlock flow.
- PWA/offline claims do not match the live deployment.

For a password manager, these are not polish issues. They are trust issues.

## What Looks Good

- Core vault data is encrypted client-side with Web Crypto before upload.
- The general item model is appropriate for a lightweight 1Password alternative: logins, notes, cards, identities, and documents.
- Session key material is intended to stay in memory only.
- Stripe routes at least verify webhook signatures.
- The UI is visually coherent and understandable for non-technical users.

## High-Risk Findings

### 1. Document uploads are likely unusable because filename IVs are not stored

Severity: Critical

Evidence:

- `components/vault/DocumentUpload.tsx:42-68`
- `app/(vault)/documents/page.tsx:49-58`

`encryptFilename()` returns ciphertext plus its own IV, but only `encryptedName.encrypted` is saved. The database row stores `file_iv`, which belongs to the encrypted file body, not the encrypted filename. On read, the app tries to decrypt the filename with `row.file_iv`.

Impact:

- Uploaded documents can appear "corrupted" and get silently skipped from the document list.
- Users can upload files and later be unable to see or download them.

Required fix:

- Add a dedicated filename IV column such as `file_name_iv`.
- Save `encryptedName.iv` at upload time.
- Use that IV when calling `decryptFilename()`.
- Backfill or migrate any existing uploaded documents if possible.

### 2. Changing the master password does not re-encrypt documents, search indexes, or biometric material

Severity: Critical

Evidence:

- `app/(vault)/settings/page.tsx:77-125`

The password-change flow only re-encrypts `vault_items.encrypted_data` and updates the vault verifier. It does not update:

- `vault_documents.file_name_encrypted`
- `vault_documents.file_key_encrypted`
- `vault_items.search_index`
- biometric key-wrapping fields on `profiles`

Impact:

- Documents encrypted under the old vault key become unreadable after password rotation.
- Search indexes become stale because they are derived from the vault key.
- Biometric enrollment data becomes invalid or misleading after rotation.

Required fix:

- Re-encrypt all document metadata and wrapped file keys during password changes.
- Recompute `search_index` for every vault item.
- Re-wrap or clear biometric unlock material after password rotation.
- Treat password rotation as a full rekey operation, not just item re-encryption.

### 3. "Delete account" does not delete the account

Severity: Critical

Evidence:

- `app/(vault)/settings/page.tsx:169-186`

The code removes storage objects if it can find them, then signs the user out. It does not delete:

- the Supabase auth user
- the `profiles` row
- vault rows
- audit rows

The comment assumes cascade deletion will happen, but no delete is actually issued.

Impact:

- Users are told their account is permanently deleted when it is not.
- This is a severe trust and privacy issue for a security product.

Required fix:

- Add a server-side authenticated deletion endpoint using a privileged backend path.
- Delete auth user plus all related data in a controlled transaction/workflow.
- Confirm deletion success to the user only after completion.

### 4. Biometric unlock is not a real secure unlock flow

Severity: High

Evidence:

- `lib/webauthn.ts:30-120`
- `components/vault/BiometricUnlock.tsx:32-67`
- `lib/biometric-key.ts:32-165`

Problems:

- WebAuthn challenges are generated client-side and never verified by a server.
- Authentication assertions are never checked against the stored public key.
- The unlock component does not unlock the vault at all; it only shows "Biometric verified - enter master password to complete unlock".
- The "wrapped" vault key is effectively encrypted with the vault key itself, so it does not create an independent biometric recovery path.

Impact:

- The app advertises biometric unlock, but the feature is incomplete.
- The current design should not be described as secure biometric unlock.

Required fix:

- Move WebAuthn ceremony generation and verification server-side.
- Verify registration and assertion challenges against the stored credential.
- Either remove biometric unlock from the product until complete, or finish it with a device-bound unwrap design.
- Do not market this as working biometric unlock until it really unlocks the vault securely.

### 5. PWA install/offline support is broken on the live deployment

Severity: High

Evidence:

- `README.md:17-18`
- `components/PWARegister.tsx:6-15`
- `middleware.ts:41-72`
- Live check on 2026-03-17:
  - `curl -I https://password-mu.vercel.app/manifest.webmanifest` returned `307 Location: /login`
  - `curl -I https://password-mu.vercel.app/sw.js` returned `307 Location: /login`

The app claims installable PWA support and offline access, but the middleware protects the manifest and service worker routes for logged-out users. That prevents normal PWA registration/install behavior. Separately, the offline sync/cache helpers exist but are not integrated into the app flow.

Impact:

- PWA install prompts and service worker registration are unreliable or broken.
- Offline support is overstated versus actual behavior.

Required fix:

- Exempt `/manifest.webmanifest`, `/sw.js`, and other PWA assets from auth middleware.
- Wire `vault-cache` and `vault-sync` into actual dashboard/document flows.
- Re-test installability and offline read behavior in the deployed app.

## Medium-Risk Findings

### 6. Saved passwords are shown in plain text while editing

Severity: Medium

Evidence:

- `components/vault/AddItemModal.tsx:261-264`

The login password field uses `type="text"` instead of `type="password"`.

Impact:

- Shoulder-surfing risk.
- Poor UX for a password manager.

Required fix:

- Change the default input type to `password`.
- Add an explicit show/hide toggle if visibility is needed.

### 7. The extension save-offer flow is incomplete

Severity: Medium

Evidence:

- `extension/src/content/content-script.ts:105-113`
- `extension/src/background/service-worker.ts:26-60`

The content script sends `SAVE_OFFER`, but the service worker has no handler for it.

Impact:

- Users can submit credentials on a site and never receive a working save prompt flow.
- The extension feels unfinished compared with the core promise of a password manager.

Required fix:

- Either implement the save-offer message path end-to-end or remove the unused message until complete.

### 8. Raw auth errors are shown directly to users

Severity: Medium

Evidence:

- `app/(auth)/login/page.tsx:23-30`
- `app/(auth)/login/page.tsx:52-59`
- `app/(auth)/signup/page.tsx:35-45`

Supabase error messages are surfaced directly in the UI.

Impact:

- Risk of user enumeration or overly specific auth feedback.
- Inconsistent UX.

Required fix:

- Normalize auth errors into generic messages.
- Add rate limiting and abuse monitoring around login/signup/reset flows.

### 9. Live deployment is missing common security headers

Severity: Medium

Observed on 2026-03-17 via `curl -I https://password-mu.vercel.app/` and `curl -I https://password-mu.vercel.app/login`.

Present:

- HSTS

Not observed:

- Content-Security-Policy
- X-Frame-Options or `frame-ancestors`
- Referrer-Policy
- Permissions-Policy

Impact:

- Weaker browser-level hardening for a sensitive app.

Required fix:

- Add security headers at the framework or hosting layer.
- Set a strict CSP compatible with Next.js and Supabase.
- Explicitly deny framing unless needed.

### 10. Build and lint health are not production-ready

Severity: Medium

Evidence:

- `package.json:5-10`
- `lib/supabase.ts:7-12`
- Local verification:
  - `npm run lint` failed with 32 issues.
  - `npm run build` failed without env vars because `lib/supabase.ts` throws during page evaluation.
  - Build only succeeded after injecting placeholder env values.

Impact:

- CI/CD reliability is weak.
- Regressions are more likely to ship unnoticed.

Required fix:

- Make the client bootstrap safe during build-time prerendering.
- Clean up lint failures before treating the app as release-ready.
- Add CI for lint, typecheck, and a basic smoke test.

## Product and UX Gaps

These are not all blockers, but they matter if the goal is a trustworthy 1Password-style product for individuals and small businesses.

- No automated test suite is present in the repo.
- Supabase schema, migrations, and RLS/storage policies are not in the repository, which makes security review and recovery harder.
- Plan-enforcement helpers exist but are not used, so storage limits and feature gating do not appear enforced in the client.
- Audit logging is inconsistent. Many writes go directly from the client to `vault_audit_log`, while the server audit endpoint that captures IP and user agent is unused.
- The extension appears to have basic autofill but not a complete credential capture/save lifecycle.
- PWA/offline support is described more strongly than it is implemented.
- For a business-ready vault, there is still no meaningful vault sharing/admin model visible in code, despite Plus-plan marketing.

## Current-State Scorecard

- Core idea and architecture direction: 7/10
- Security implementation maturity: 3/10
- Reliability of critical flows: 3/10
- UI quality: 7/10
- UX trustworthiness: 4/10
- Production readiness: 3/10

Overall: promising prototype, not ready to be trusted with important passwords and documents yet.

## Recommended Fix Order

1. Fix document encryption metadata so uploads/downloads are reliable.
2. Rebuild the master-password rotation flow as a complete rekey operation.
3. Replace the fake delete-account flow with real server-side deletion.
4. Remove or finish biometric unlock correctly.
5. Fix PWA routing and verify actual offline support.
6. Fix visible-password fields and auth error handling.
7. Add security headers, CI, and tests.
8. Bring Supabase schema and policy definitions into the repo.

## Suggested Release Gate

Do not market this as a secure password manager replacement until all of the following are true:

- Item CRUD, document upload/download, and password rotation are proven not to corrupt data.
- Account deletion is real.
- PWA/offline claims are true in production.
- Biometric unlock is either removed or securely implemented.
- RLS and storage policies are reviewed and version-controlled.
- Automated tests cover the critical flows.

## If You Want a Phase 2 Audit

Read-only access to the following would allow a much deeper security audit:

- Supabase SQL schema, RLS policies, and storage policies
- Vercel env/configuration
- Stripe product and webhook configuration
- A throwaway test account in the live app

That would let us verify whether the backend controls match what the frontend assumes.
