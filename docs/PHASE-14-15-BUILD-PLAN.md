# ShoreStack Vault — Phase 14 & 15 Build Plan

## Phase 14: Browser Extension (Chrome + Firefox)
## Phase 15: PWA + Biometric Unlock

---

## Architecture Overview

Both features share a common challenge: the vault key (`CryptoKey`) is non-extractable and lives only in the web app's memory via `VaultSession`. The extension and PWA biometric flows must each solve how to obtain a valid vault key without requiring the user to re-enter their master password every time.

**Solution chosen:**

- **Extension:** Independent vault session. User enters master password in the extension popup once, key is derived in the extension's service worker memory, auto-locks after 15 minutes (same as web app).
- **PWA biometric:** Wrapped key approach. On biometric enrollment, the vault key material is encrypted with a device-bound key. On biometric unlock, WebAuthn verifies the user, then the wrapped key is decrypted to recover the vault key.

---

## PHASE 14: Browser Extension

### 14A — Extension Scaffold & Build System

**Goal:** Separate Vite project inside `extension/` directory, builds to Manifest V3 for Chrome and Firefox.

**Directory structure:**
```
extension/
├── src/
│   ├── background/
│   │   └── service-worker.ts        ← Vault session, message router, Supabase auth
│   ├── content/
│   │   ├── content-script.ts        ← Injected into all pages
│   │   ├── form-detector.ts         ← Finds login forms on pages
│   │   └── autofill.ts              ← Fills detected forms with credentials
│   ├── popup/
│   │   ├── App.tsx                   ← Root popup component
│   │   ├── pages/
│   │   │   ├── Unlock.tsx            ← Master password entry
│   │   │   ├── VaultList.tsx         ← Search & browse items
│   │   │   ├── ItemDetail.tsx        ← View/copy credentials
│   │   │   └── Generator.tsx         ← Password generator
│   │   ├── components/
│   │   │   ├── VaultItemCard.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   └── LockTimer.tsx
│   │   ├── popup.html
│   │   └── popup.tsx                 ← Entry point
│   ├── shared/
│   │   ├── crypto.ts                 ← Copy of lib/crypto.ts (shared encryption logic)
│   │   ├── vault-session.ts          ← Extension-specific session (service worker memory)
│   │   ├── supabase-client.ts        ← Extension Supabase client
│   │   └── types.ts                  ← Shared types from types/vault.ts
│   └── styles/
│       └── globals.css               ← Tailwind + Shorestack brand
├── public/
│   ├── icons/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── manifest.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

**Key decisions:**
- Separate `package.json` from the web app (extensions have different build needs)
- Vite + CRXJS for hot-reload during development
- React 19 + Tailwind CSS (same stack as web app)
- `shared/crypto.ts` is a **copy** of `lib/crypto.ts` — not a symlink, because the extension bundles independently
- No external crypto libraries — same Web Crypto API approach

**manifest.json:**
```json
{
  "manifest_version": 3,
  "name": "ShoreStack Vault",
  "description": "Zero-knowledge password manager",
  "version": "1.0.0",
  "permissions": ["storage", "scripting", "tabs", "activeTab"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content-script.ts"],
      "run_at": "document_idle"
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self';"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

**Build steps:**
1. `npm create vite@latest extension -- --template react-ts`
2. Add `@crxjs/vite-plugin`, `tailwindcss`, `@supabase/supabase-js`
3. Configure Vite for extension output
4. Copy `crypto.ts` and `types/vault.ts` into `shared/`

### 14B — Service Worker & Auth

**Goal:** Extension authenticates with Supabase, manages vault session in service worker memory.

**Auth flow:**
1. User opens popup → sees "Unlock" screen
2. User enters email + account password (Supabase Auth login)
3. On success, Supabase session token stored in `chrome.storage.session` (session-only, cleared on browser close)
4. User enters master password → vault key derived in service worker
5. Vault key held in service worker memory (same pattern as `VaultSession`)
6. 15-minute auto-lock timer in service worker

**Service worker session management:**
```typescript
// Service worker keeps vault key in memory
let vaultKey: CryptoKey | null = null;
let lockTimeout: ReturnType<typeof setTimeout> | null = null;

// Message handler for popup and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'UNLOCK':         // Derive vault key from master password
    case 'LOCK':           // Clear vault key
    case 'GET_STATUS':     // Return locked/unlocked state
    case 'GET_CREDENTIALS': // Decrypt item for autofill
    case 'SEARCH_VAULT':   // Search vault items
  }
});
```

**Important:** MV3 service workers terminate when idle. To handle this:
- On wake, check `chrome.storage.session` for auth token
- If token exists but vault is locked, show unlock prompt
- If no token, show login prompt
- Vault key is lost on service worker termination → user must re-enter master password

### 14C — Popup UI

**Goal:** React popup for vault browsing, search, and credential copying.

**Popup dimensions:** 380px wide × 580px tall (standard password manager size)

**Screens:**
1. **Login** — Email + account password (only if no Supabase session)
2. **Unlock** — Master password entry (if session exists but vault locked)
3. **Vault List** — Search bar + scrollable list of items, filtered by current tab URL
4. **Item Detail** — Show fields with copy buttons, show/hide toggle for passwords
5. **Generator** — Reuse PasswordGenerator logic

**URL matching:** When popup opens, it reads `chrome.tabs.query({active: true})` to get the current tab's URL. Items with matching URLs float to the top of the list.

**Brand consistency:** Same Deep Ocean/Seafoam/Sand palette, Inter font, sharp corners, no shadows.

### 14D — Content Script & Autofill

**Goal:** Detect login forms on web pages and fill credentials on user request.

**Form detection strategy:**
1. On `document_idle`, scan for `<input type="password">` elements
2. Walk up DOM to find parent `<form>`
3. Find sibling text/email inputs (username candidates)
4. Use `MutationObserver` for dynamically injected forms (SPAs)
5. Score candidates by `autocomplete`, `name`, `id`, and `placeholder` attributes

**Autofill flow:**
1. Content script detects login form → sends `FORM_DETECTED` to service worker
2. Service worker checks if vault is unlocked, queries matching items by URL
3. If matches found, extension icon gets a badge count
4. User clicks popup → sees matching credentials for current page
5. User clicks "Fill" → popup sends `AUTOFILL` message to content script
6. Content script sets input values and dispatches `input` + `change` events

**Form fill implementation:**
```typescript
function fillField(input: HTMLInputElement, value: string) {
  // React/Vue/Angular apps need native input simulation
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'value'
  )?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
```

**Security rules:**
- Never autofill without explicit user action (click in popup)
- Never inject credentials into iframes from different origins
- Content script runs in isolated world (no access to page JS)
- Credential data is decrypted in service worker, sent to content script only on user request

### 14E — Save New Credentials

**Goal:** Detect form submissions and offer to save new credentials.

**Flow:**
1. Content script listens for form `submit` event on forms with password fields
2. Captures username + password values before submission
3. Sends `SAVE_OFFER` to service worker with URL, username, password
4. Service worker checks if credential already exists in vault
5. If new/changed, shows a notification bar at top of page: "Save password for example.com?"
6. User clicks "Save" → encrypts and stores via Supabase API

### 14F — Testing & Publishing

**Testing checklist:**
- Form detection on: Google, GitHub, AWS Console, Supabase, Twitter/X, Facebook
- Autofill with React-based login forms (dispatching synthetic events)
- Auto-lock after 15 minutes of inactivity
- Service worker termination + recovery
- Firefox compatibility (test with `web-ext run`)

**Publishing:**
- Chrome Web Store: $5 developer account, 24-48hr review
- Firefox Add-ons: Free, 3-7 day review
- Privacy policy page needed (host on shorestack.io)

---

## PHASE 15: PWA + Biometric Unlock

### 15A — PWA Foundation

**Goal:** Make the web app installable as a standalone app on mobile and desktop.

**Dependencies to add:**
```bash
npm install @serwist/next
npm install -D @serwist/build @serwist/webpack-plugin
```

**New files:**

1. **`app/manifest.ts`** — Next.js App Router manifest (generates `/manifest.webmanifest`):
```typescript
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ShoreStack Vault',
    short_name: 'Vault',
    description: 'Zero-knowledge encrypted password & document manager',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#fcfbf8',
    theme_color: '#1b4965',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['productivity', 'security'],
  };
}
```

2. **`public/sw.ts`** — Service worker with caching strategies:
   - **App shell (HTML/CSS/JS):** Cache-first with network fallback
   - **Supabase API calls:** Network-first with cache fallback (offline vault access)
   - **Static assets (fonts, icons):** Cache-first, 30-day expiry
   - **Mutations (POST/PUT/DELETE):** Network-only, queue for offline replay

3. **`next.config.ts`** — Updated with Serwist wrapper + service worker headers

4. **`app/layout.tsx`** — Add PWA meta tags:
   - `<meta name="theme-color" content="#1b4965">`
   - `<meta name="apple-mobile-web-app-capable" content="yes">`
   - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
   - `<link rel="apple-touch-icon" href="/icon-180.png">`

5. **PWA icons** — Generate from wave mark logo:
   - `icon-180.png` (Apple touch icon)
   - `icon-192.png`, `icon-192-maskable.png` (Android)
   - `icon-512.png`, `icon-512-maskable.png` (Splash screen)
   - `favicon.ico` (update if needed)

**PWA install prompt component:**
- `components/vault/PWAInstallPrompt.tsx`
- Catches `beforeinstallprompt` event
- Shows branded install banner on dashboard
- Remembers dismissal for 7 days via localStorage

### 15B — Offline Vault with IndexedDB

**Goal:** Cache encrypted vault items locally for offline read access.

**New file: `lib/vault-cache.ts`**

IndexedDB stores:
- `vault_items` — Encrypted items (same ciphertext as Supabase, not decrypted)
- `metadata` — Last sync timestamp, user ID

**Sync strategy:**
- On vault unlock (online): Fetch all items from Supabase → store in IndexedDB
- On vault unlock (offline): Load from IndexedDB → decrypt with vault key
- On item create/edit/delete (online): Write to Supabase first, then update IndexedDB
- On item create/edit/delete (offline): Write to IndexedDB with `synced: false` flag → sync when online
- On reconnect: Push unsynced items to Supabase, pull latest server state

**Conflict resolution:** Server wins. If an item was modified on both server and local, the server version overwrites the local. This is simple and safe for a single-user vault.

**Security:** IndexedDB stores only encrypted ciphertext — same blobs that Supabase stores. No plaintext ever touches IndexedDB.

### 15C — WebAuthn Biometric Registration

**Goal:** Let users enroll Touch ID / Face ID / Windows Hello for quick vault unlock.

**Database changes — new columns on `profiles`:**
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  webauthn_credential_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  webauthn_public_key TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  webauthn_transports TEXT[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  biometric_vault_key_encrypted TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  biometric_vault_key_iv TEXT;
```

**New files:**
- `lib/webauthn.ts` — WebAuthn registration and authentication helpers
- `lib/biometric-key.ts` — Vault key wrapping/unwrapping for biometric unlock

**Enrollment flow (in Settings page):**
1. User clicks "Enable Biometric Unlock" in Settings
2. Check `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` — show button only if supported
3. Call `navigator.credentials.create()` with `authenticatorAttachment: 'platform'` and `userVerification: 'required'`
4. User performs biometric (Touch ID scan, Face ID, Windows Hello)
5. Store WebAuthn credential ID + public key in `profiles` table
6. **Key wrapping:** Since vault key is non-extractable, we take a different approach:
   - Re-derive the vault key as extractable (one-time, during enrollment only)
   - Generate random 256-bit "biometric wrap key"
   - Encrypt the exported vault key bytes with the wrap key (AES-256-GCM)
   - Encrypt the wrap key with the vault key (so it can only be recovered with master password OR biometric)
   - Store both encrypted blobs in `profiles`
7. Log audit event: `biometric_enrolled`

**Important security note:** The vault key is derived as non-extractable in normal operation. For biometric enrollment, we need the raw key bytes. The approach:
- During enrollment, re-derive the vault key with `extractable: true` (same password, same salt, same iterations → same key)
- Export the raw bytes
- Encrypt them with the biometric wrap key
- The extractable key is immediately discarded — only the non-extractable version stays in VaultSession

### 15D — Biometric Unlock Flow

**Goal:** Use enrolled biometric to unlock the vault without master password.

**Unlock flow:**
1. User opens app → vault is locked
2. If `profile.webauthn_credential_id` exists, show "Unlock with Biometric" button alongside master password field
3. User taps biometric button
4. Call `navigator.credentials.get()` with stored credential ID and `userVerification: 'required'`
5. User performs biometric verification
6. On success, verify the WebAuthn assertion signature against stored public key
7. Decrypt the wrapped vault key using the biometric wrap key
8. Import the raw key bytes as a non-extractable `CryptoKey`
9. Set in `VaultSession`
10. Load and decrypt vault items

**Fallback:** If biometric fails 3 times, hide the biometric button and require master password.

**Auto-lock behavior:** Same 15-minute timer. After auto-lock, biometric unlock is available again (no master password needed until browser/app restart or explicit logout).

### 15E — UI Changes

**Unlock screen (`dashboard/page.tsx`):**
- Add biometric unlock button below master password field
- Fingerprint icon (from Lucide or inline SVG)
- Show only if device supports platform authenticator AND user has enrolled
- Animate on success (brief checkmark)

**Settings page (`settings/page.tsx`):**
- New section: "Biometric Unlock"
- Toggle to enable/disable
- Shows device name + enrollment date
- "Remove Biometric" button (clears WebAuthn columns in profile)

**PWA install prompt (`dashboard/page.tsx` or layout):**
- Subtle banner on first visit: "Install Vault for quick access"
- Shorestack branded (Seafoam button, Deep Ocean text)
- Dismiss remembers for 7 days

### 15F — iOS Safari Considerations

**Limitations to handle:**
- No push notifications (not needed for a vault)
- 50MB default IndexedDB quota → request persistent storage
- WebAuthn supported on iOS 16+ (Face ID, Touch ID work)
- Service worker works fully on iOS Safari
- `beforeinstallprompt` not fired on iOS — users add to home screen manually via Share menu

**iOS-specific adjustments:**
- Add `apple-mobile-web-app-capable` meta tag
- Add `apple-touch-icon` link
- Show iOS-specific install instructions ("Tap Share → Add to Home Screen") if iOS detected and not standalone
- Request persistent storage on first load: `navigator.storage.persist()`

---

## Database Migration (Phase 15C)

Run in Supabase SQL Editor:
```sql
-- WebAuthn + biometric unlock columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS webauthn_credential_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS webauthn_public_key TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS webauthn_transports TEXT[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS biometric_vault_key_encrypted TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS biometric_vault_key_iv TEXT;
```

---

## New Dependencies

**Web app (Phase 15):**
```bash
npm install @serwist/next
npm install -D @serwist/build
```

**Extension (Phase 14):**
```bash
# In extension/ directory
npm create vite@latest . -- --template react-ts
npm install @crxjs/vite-plugin @supabase/supabase-js
npm install -D tailwindcss @tailwindcss/vite
```

---

## New Files Summary

**Phase 14 (Extension) — all in `extension/`:**
| File | Purpose |
|------|---------|
| `src/background/service-worker.ts` | Message routing, vault session, auth |
| `src/content/content-script.ts` | Page injection entry point |
| `src/content/form-detector.ts` | Login form detection |
| `src/content/autofill.ts` | Credential injection into forms |
| `src/popup/App.tsx` | Popup root component |
| `src/popup/pages/Unlock.tsx` | Master password entry |
| `src/popup/pages/VaultList.tsx` | Vault item browser |
| `src/popup/pages/ItemDetail.tsx` | Credential viewer |
| `src/popup/pages/Generator.tsx` | Password generator |
| `src/shared/crypto.ts` | Encryption (copy of lib/crypto.ts) |
| `src/shared/vault-session.ts` | Session management for extension |
| `src/shared/supabase-client.ts` | Supabase browser client |
| `src/shared/types.ts` | Shared TypeScript types |
| `public/manifest.json` | MV3 extension manifest |
| `vite.config.ts` | Vite + CRXJS build config |
| `package.json` | Extension dependencies |

**Phase 15 (PWA + Biometric) — in web app root:**
| File | Purpose |
|------|---------|
| `app/manifest.ts` | PWA web manifest |
| `public/sw.ts` | Service worker (Serwist) |
| `lib/webauthn.ts` | WebAuthn registration + authentication |
| `lib/biometric-key.ts` | Vault key wrapping for biometric unlock |
| `lib/vault-cache.ts` | IndexedDB encrypted vault cache |
| `lib/vault-sync.ts` | Online/offline sync logic |
| `components/vault/PWAInstallPrompt.tsx` | Install banner |
| `components/vault/BiometricUnlock.tsx` | Biometric unlock button |
| `components/vault/BiometricEnroll.tsx` | Biometric enrollment UI |
| `public/icon-180.png` | Apple touch icon |
| `public/icon-192.png` | Android icon |
| `public/icon-192-maskable.png` | Android maskable icon |
| `public/icon-512.png` | Splash screen icon |
| `public/icon-512-maskable.png` | Splash screen maskable |

---

## Modified Files Summary

**Phase 14:**
| File | Change |
|------|--------|
| `.gitignore` | Add `extension/dist/`, `extension/node_modules/` |
| `CLAUDE.md` | Add extension architecture docs |

**Phase 15:**
| File | Change |
|------|--------|
| `next.config.ts` | Wrap with Serwist, add service worker headers |
| `app/layout.tsx` | Add PWA meta tags, apple-touch-icon, theme-color |
| `app/(vault)/dashboard/page.tsx` | Add BiometricUnlock button to unlock screen |
| `app/(vault)/settings/page.tsx` | Add biometric enrollment section |
| `types/vault.ts` | Add WebAuthn fields to Profile interface |
| `package.json` | Add @serwist/next dependency |
| `CLAUDE.md` | Add PWA + biometric architecture docs |

---

## Build Order

### Phase 14 (Extension) — COMPLETE
1. **14A** ✅ — Scaffold extension project, Vite config, manifest, Tailwind
2. **14B** ✅ — Service worker with Supabase auth + vault session
3. **14C** ✅ — Popup UI (Login → Unlock → VaultList → ItemDetail → Generator)
4. **14D** ✅ — Content script form detection + autofill
5. **14E** ✅ — Save new credentials on form submit
6. **14F** ✅ — End-to-end tested: web app ↔ extension vault sync confirmed

### Phase 15 (PWA + Biometric) — COMPLETE
1. **15A** ✅ — PWA manifest, vanilla service worker, install prompt, icons
2. **15B** ✅ — IndexedDB vault cache + offline read access
3. **15C** ✅ — WebAuthn enrollment (DB migration applied + lib/webauthn.ts + Settings UI)
4. **15D** ✅ — Biometric unlock flow (lib/biometric-key.ts + Dashboard unlock button)
5. **15E** ✅ — Online/offline sync (lib/vault-sync.ts)
6. **15F** ✅ — Build verification, iOS Safari adjustments, viewport fix

**Note:** Used vanilla service worker (`public/sw.js`) instead of @serwist/next for simpler deployment. The build plan originally specified Serwist, but the vanilla approach is lighter and avoids next.config.ts modifications.

---

## Security Invariants (Must NEVER Be Broken)

1. Vault key is never stored in `chrome.storage`, `localStorage`, `IndexedDB`, or cookies
2. IndexedDB stores only AES-256-GCM ciphertext — never plaintext
3. WebAuthn credential creation requires `userVerification: 'required'`
4. Biometric-wrapped vault key is encrypted with AES-256-GCM
5. Extension content scripts run in isolated world — no page JS access
6. Autofill only happens on explicit user action (click in popup)
7. Service worker vault key is lost on termination — user must re-enter master password
8. The master password is never stored anywhere by the extension or PWA
