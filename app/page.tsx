'use client';

import Link from 'next/link';
import ShorestackLogo from '@/components/ui/ShorestackLogo';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-sand text-[#1b4965]">
      {/* Navigation */}
      <nav className="border-b border-[#1b4965]/15">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShorestackLogo variant="horizontal" size="sm" />
          </div>
          <div className="flex items-center gap-4">
            <Link href="/signup" className="text-sm font-medium text-[#5fa8a0] hover:text-[#4d8f87]">
              Sign Up
            </Link>
            <Link href="/login" className="text-sm font-medium text-[#1b4965] hover:text-[#1b4965]/70">
              Log In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b border-[#1b4965]/15 px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-bold tracking-tight text-[#1b4965] mb-4">
            Your passwords. Locked down.
          </h1>
          <p className="text-lg text-[#1b4965]/70 mb-8">
            ShoreStack Vault keeps your passwords, documents, and sensitive data encrypted with zero-knowledge security. Only you can see your stuff.
          </p>
          <Link href="/signup" className="inline-block rounded-sm bg-[#5fa8a0] px-6 py-3 font-medium text-white transition-colors hover:bg-[#4d8f87]">
            Get Started
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-[#1b4965]/15 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold mb-12">Why ShoreStack Vault</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
              <h3 className="text-lg font-semibold mb-3">Zero-Knowledge Encryption</h3>
              <p className="text-[#1b4965]/70">
                Your data is encrypted on your device before it leaves. We can't see it. Nobody can.
              </p>
            </div>
            <div className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
              <h3 className="text-lg font-semibold mb-3">Passwords, Cards, Notes & More</h3>
              <p className="text-[#1b4965]/70">
                Store logins, credit cards, secure notes, and identity documents — all in one vault.
              </p>
            </div>
            <div className="rounded-sm border border-[#1b4965]/15 bg-white p-6">
              <h3 className="text-lg font-semibold mb-3">Encrypted Documents</h3>
              <p className="text-[#1b4965]/70">
                Upload important files. They're encrypted before they hit our servers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-b border-[#1b4965]/15 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold mb-4">Simple pricing. No surprises.</h2>
          <p className="text-center text-[#1b4965]/70 mb-12 max-w-2xl mx-auto">
            Choose the plan that fits your needs. No free tier, no credit card tricks.
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Personal */}
            <div className="relative rounded-sm border-2 border-[#5fa8a0] bg-white p-8">
              <span className="absolute -top-2.5 left-4 rounded-full bg-[#5fa8a0] px-2.5 py-0.5 text-xs font-semibold text-white">Most Popular</span>
              <h3 className="text-xl font-semibold mb-2">Personal</h3>
              <div className="text-3xl font-bold mb-1">$0.99</div>
              <div className="text-sm text-[#1b4965]/60 mb-6">/month</div>
              <ul className="space-y-3 mb-8 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-[#5fa8a0]">✓</span>
                  <span>Unlimited vault items</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#5fa8a0]">✓</span>
                  <span>1 GB document storage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#5fa8a0]">✓</span>
                  <span>AES-256 zero-knowledge encryption</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#5fa8a0]">✓</span>
                  <span>Password generator</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#5fa8a0]">✓</span>
                  <span>Audit activity log</span>
                </li>
              </ul>
              <Link href="/signup" className="block w-full rounded-sm bg-[#5fa8a0] px-4 py-3 text-center font-medium text-white transition-colors hover:bg-[#4d8f87]">
                Get Started
              </Link>
            </div>

            {/* Plus */}
            <div className="rounded-sm border border-[#1b4965]/15 bg-white p-8">
              <h3 className="text-xl font-semibold mb-2">Plus</h3>
              <div className="text-3xl font-bold mb-1">$1.99</div>
              <div className="text-sm text-[#1b4965]/60 mb-6">/month</div>
              <ul className="space-y-3 mb-8 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-[#5fa8a0]">✓</span>
                  <span>Everything in Personal</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#5fa8a0]">✓</span>
                  <span>10 GB document storage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#5fa8a0]">✓</span>
                  <span>Shared vaults</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#5fa8a0]">✓</span>
                  <span>Perfect for families & teams</span>
                </li>
              </ul>
              <Link href="/signup" className="block w-full rounded-sm border border-[#1b4965]/15 px-4 py-3 text-center font-medium text-[#1b4965] transition-colors hover:bg-[#1b4965]/5">
                Get Started
              </Link>
            </div>
          </div>
          <p className="text-center text-xs text-[#1b4965]/50 mt-6">
            Need more than 10 GB? <a href="mailto:brandon@daysllc.com?subject=ShoreStack%20Vault%20Custom%20Storage" className="text-[#5fa8a0] hover:underline">Contact us</a> for custom storage.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1b4965]/15 px-6 py-12 bg-white">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShorestackLogo variant="mark" size="sm" />
              <div className="font-semibold text-[#1b4965]">shorestack</div>
            </div>
            <p className="text-sm text-[#1b4965]/60">Business tools that just make sense.</p>
          </div>
          <div className="text-sm text-[#1b4965]/60 text-right">
            <div className="flex gap-4 mb-1">
              <Link href="/privacy" className="hover:text-[#5fa8a0]">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-[#5fa8a0]">Terms of Service</Link>
            </div>
            <p>Copyright {new Date().getFullYear()} Days Management LLC</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
