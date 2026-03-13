# ShoreStack Vault — Restart Instructions

## For the next Claude session

### Context
Read these files first to understand the project:
1. `CLAUDE.md` — Full project overview, tech stack, database schema, brand guidelines, Phase 14+15 architecture
2. `docs/PHASE-14-15-BUILD-PLAN.md` — Detailed build plan for browser extension + PWA + biometric (reference)

### What's been done
- **Phases 1–15 are complete** and deployed at https://password-mu.vercel.app
- Phase 14: Chrome MV3 browser extension (Vite + CRXJS + React 19 + Tailwind v4)
- Phase 15: PWA manifest, service worker, IndexedDB cache, WebAuthn biometric enrollment/unlock, offline sync
- All code pushed to GitHub (`main` branch)
- Supabase DB migration for WebAuthn columns has been applied

### Key architecture to know

**Extension** (`extension/` directory — separate Vite project):
- Independent vault session in service worker memory
- 13 message types for popup ↔ service worker ↔ content script communication
- Content scripts detect login forms via password input scanning + MutationObserver
- Autofill uses native `HTMLInputElement.prototype.value` setter for framework compatibility
- Build: `cd extension && npm install && npm run build` → load `dist/` unpacked in Chrome

**PWA + Biometric** (in web app root):
- `public/sw.js` — Vanilla service worker with three caching strategies
- `lib/vault-cache.ts` — IndexedDB stores encrypted ciphertext only
- `lib/vault-sync.ts` — Online/offline sync with unsynced item tracking
- `lib/webauthn.ts` — Platform authenticator registration/authentication
- `lib/biometric-key.ts` — Vault key wrapping with AES-256-GCM
- BiometricEnroll wired into Settings page, BiometricUnlock wired into Dashboard lock screen
- PWAInstallPrompt on Dashboard (Chrome/Android + iOS instructions)
- Note: Biometric unlock currently still requires master password (true passwordless needs WebAuthn PRF extension)

### What to build next (potential Phase 16+)
- **Shared vaults** — Team/family vault sharing (Plus plan feature)
- **Import from other managers** — 1Password, LastPass, Bitwarden CSV import
- **WebAuthn PRF extension** — True passwordless biometric unlock
- **Firefox extension** — Adapt MV3 extension for Firefox (web-ext)
- **Chrome Web Store / Firefox Add-ons publishing** — Privacy policy, store listings
- **Emergency access** — Trusted contact can request vault access after waiting period
- **TOTP / 2FA codes** — Store and auto-fill authenticator codes

### Key files to read before coding
- `CLAUDE.md` — Complete project docs including all architecture
- `lib/crypto.ts` — All encryption logic
- `lib/vault-session.ts` — In-memory vault key management
- `types/vault.ts` — All TypeScript types including WebAuthn fields
- `app/(vault)/dashboard/page.tsx` — Vault unlock + item display + biometric + PWA prompt
- `app/(vault)/settings/page.tsx` — Settings + biometric enrollment

### Environment
- **Framework:** Next.js 16 (App Router) + Turbopack
- **Node:** 20+
- **Package manager:** npm
- **Build:** `npm run build` from project root
- **Dev:** `npm run dev` for web app, `cd extension && npm run dev` for extension
- **TypeScript:** Root `tsconfig.json` excludes `extension/` (has its own tsconfig)

### Database
- **Supabase project:** qdhwgzftpycdmovyniec
- All migrations applied (including Phase 15C WebAuthn columns)

### Security rules (never break these)
- Vault key never stored in storage, localStorage, IndexedDB, or cookies
- IndexedDB stores only AES-256-GCM ciphertext
- WebAuthn requires `userVerification: 'required'`
- Autofill only on explicit user action
- Master password never stored anywhere
- Content scripts run in isolated world

### Patch workflow
Generate patch in cloud session → save to `~/Desktop/Storage/Claude/password/` → user applies with `git apply <path>` from repo dir → commit and push
