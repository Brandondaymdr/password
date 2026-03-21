import Link from 'next/link';
import ShorestackLogo from '@/components/ui/ShorestackLogo';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-sand text-[#1b4965]">
      <nav className="border-b border-[#1b4965]/15">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ShorestackLogo variant="horizontal" size="sm" />
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-sm text-[#1b4965]/60 mb-8">Last updated: March 21, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-[#1b4965]/80">
          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">1. Who We Are</h2>
            <p>ShoreStack Vault is operated by Days Management LLC, a company based in Austin, Texas. When we say "we," "us," or "our," we mean Days Management LLC.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">2. Zero-Knowledge Architecture</h2>
            <p>ShoreStack Vault is a zero-knowledge password manager. This means:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Your master password is never transmitted to or stored on our servers.</li>
              <li>All vault data (passwords, notes, credit cards, identities, documents) is encrypted on your device using AES-256-GCM before being sent to our servers.</li>
              <li>Our servers store only encrypted ciphertext, initialization vectors, and key derivation salts.</li>
              <li>We cannot read, access, or recover your vault data. If you lose your master password, your data cannot be recovered.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">3. Data We Collect</h2>
            <p><strong>Account data:</strong> Your email address (for authentication) and payment information (processed by Stripe).</p>
            <p className="mt-2"><strong>Encrypted vault data:</strong> Encrypted ciphertext blobs, initialization vectors, HMAC search indices, and KDF salts. We cannot decrypt this data.</p>
            <p className="mt-2"><strong>Metadata:</strong> Timestamps, item types, favorite flags, file sizes, and audit log entries (action type, IP address, user agent).</p>
            <p className="mt-2"><strong>Password hint:</strong> If you set a password hint, it is stored unencrypted. Do not include your password in the hint.</p>
            <p className="mt-2"><strong>We do not collect:</strong> Analytics, tracking pixels, advertising data, or any third-party telemetry.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">4. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provide and maintain the ShoreStack Vault service.</li>
              <li>To process payments via Stripe.</li>
              <li>To send transactional emails (account confirmation, password reset links).</li>
              <li>To maintain audit logs for your security review.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">5. Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Supabase:</strong> Database hosting, authentication, and file storage (encrypted blobs only).</li>
              <li><strong>Stripe:</strong> Payment processing. We do not store your credit card details.</li>
              <li><strong>Vercel:</strong> Application hosting.</li>
            </ul>
            <p className="mt-2">These services have their own privacy policies. None of them have access to your decrypted vault data.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">6. Data Retention & Deletion</h2>
            <p>Your data is retained for as long as your account is active. When you delete your account:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>All vault items, documents, audit logs, and profile data are permanently deleted.</li>
              <li>Any active Stripe subscriptions are cancelled.</li>
              <li>This process is irreversible.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Export your vault data at any time via the Settings page.</li>
              <li>Delete your account and all associated data at any time.</li>
              <li>Contact us with questions about your data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">8. Security</h2>
            <p>We use industry-standard encryption (AES-256-GCM with PBKDF2 key derivation at 600,000 iterations) and enforce row-level security policies on all database tables. All connections use HTTPS/TLS.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">9. Contact</h2>
            <p>For privacy questions, contact us at <a href="mailto:brandon@daysllc.com" className="text-[#5fa8a0] hover:underline">brandon@daysllc.com</a>.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
