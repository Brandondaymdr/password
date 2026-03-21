import Link from 'next/link';
import ShorestackLogo from '@/components/ui/ShorestackLogo';

export default function TermsOfServicePage() {
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
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
        <p className="text-sm text-[#1b4965]/60 mb-8">Last updated: March 21, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-[#1b4965]/80">
          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">1. Acceptance</h2>
            <p>By creating an account or using ShoreStack Vault, you agree to these Terms of Service and our <Link href="/privacy" className="text-[#5fa8a0] hover:underline">Privacy Policy</Link>. If you do not agree, do not use the service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">2. Service Description</h2>
            <p>ShoreStack Vault is a zero-knowledge encrypted password and document manager. We provide client-side encryption tools and secure cloud storage for encrypted data. We do not have access to your decrypted data.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">3. Your Responsibilities</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You are responsible for maintaining the security of your master password.</li>
              <li>If you lose your master password, we cannot recover your data. There is no reset mechanism.</li>
              <li>You must provide a valid email address for account creation.</li>
              <li>You must not use the service for illegal purposes or to store illegal content.</li>
              <li>You are responsible for maintaining backups of critical data stored in your vault.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">4. Subscriptions & Billing</h2>
            <p>ShoreStack Vault is a paid service with no free tier. Plans are billed monthly or yearly through Stripe.</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Personal:</strong> $0.99/month — unlimited vault items, 1 GB document storage.</li>
              <li><strong>Plus:</strong> $1.99/month — everything in Personal, 10 GB document storage, shared vaults.</li>
            </ul>
            <p className="mt-2">You may cancel your subscription at any time via the Settings page or Stripe Customer Portal. Cancellation takes effect at the end of the current billing period. No refunds are provided for partial billing periods.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">5. Data & Encryption</h2>
            <p>All vault data is encrypted on your device before transmission to our servers. We store only encrypted ciphertext. Because we cannot decrypt your data:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>We cannot help you recover data if you forget your master password.</li>
              <li>We cannot comply with requests to produce the plaintext contents of your vault.</li>
              <li>We can provide encrypted data and account metadata in response to valid legal requests.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">6. Account Termination</h2>
            <p>You may delete your account at any time from the Settings page. This permanently deletes all data and cancels any active subscriptions. We may terminate accounts that violate these terms or are used for illegal purposes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">7. Limitation of Liability</h2>
            <p>ShoreStack Vault is provided "as is" without warranties of any kind. Days Management LLC is not liable for data loss, security breaches resulting from weak master passwords, or service interruptions. Our total liability is limited to the amount you paid for the service in the 12 months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">8. Changes to Terms</h2>
            <p>We may update these terms. Material changes will be communicated via email. Continued use after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">9. Governing Law</h2>
            <p>These terms are governed by the laws of the State of Texas, United States.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#1b4965] mb-3">10. Contact</h2>
            <p>For questions about these terms, contact us at <a href="mailto:brandon@daysllc.com" className="text-[#5fa8a0] hover:underline">brandon@daysllc.com</a>.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
