# ShoreStack Vault

A zero-knowledge encrypted password and document manager. Your master password never leaves your device — the server only stores AES-256 ciphertext.

**Live:** [password-mu.vercel.app](https://password-mu.vercel.app)

## Features

- **Zero-knowledge encryption** — AES-256-GCM with PBKDF2 key derivation (600,000 iterations)
- **Vault items** — Logins, secure notes, credit cards, and identities
- **Document storage** — Client-side encrypted file uploads to Supabase Storage
- **Password generator** — Cryptographically strong with configurable character sets
- **HMAC search** — Server-side searchable without exposing item names
- **Audit logging** — Every vault action is recorded
- **Stripe billing** — Personal ($0.99/mo, 1 GB) and Plus ($1.99/mo, 10 GB) plans
- **Browser extension** — Chrome MV3 extension with autofill, form detection, and password generation
- **PWA support** — Installable on mobile and desktop with offline vault access via IndexedDB
- **Biometric unlock** — Touch ID, Face ID, and Windows Hello via WebAuthn

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript
- **Auth & Database:** Supabase (PostgreSQL, Auth, Storage)
- **Encryption:** Web Crypto API (native browser, no libraries)
- **Payments:** Stripe Subscriptions
- **Styling:** Tailwind CSS
- **Hosting:** Vercel
- **Extension:** Vite 6 + CRXJS + React 19 + Tailwind v4, Manifest V3
- **PWA:** Vanilla service worker, IndexedDB, WebAuthn

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in your Supabase and Stripe keys

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Browser Extension

```bash
cd extension
npm install
cp .env.example .env  # Add Supabase URL + anon key
npm run build
```

Load the `extension/dist/` directory as an unpacked extension in `chrome://extensions` (Developer mode).

## Environment Variables

See `.env.example` for the required variables (Supabase URL/keys, Stripe keys/price IDs).

## Security Model

The master password is used to derive an AES-256-GCM key via PBKDF2. This vault key encrypts all data client-side before it reaches Supabase. The key exists only in browser memory with a 15-minute auto-lock timer. The server stores only ciphertext, IVs, and KDF salts. IndexedDB offline cache stores only encrypted ciphertext — never plaintext.

## License

Proprietary — Days Management LLC
