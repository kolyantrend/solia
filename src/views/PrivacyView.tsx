import { FC } from 'react';

export const PrivacyView: FC<{ onBack?: () => void }> = ({ onBack }) => {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 pb-28">
      {onBack && (
        <button onClick={onBack} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors mb-2">
          ← Back
        </button>
      )}
      <h1 className="text-2xl font-bold text-zinc-100">Privacy Policy</h1>
      <p className="text-xs text-zinc-500">Last updated: March 2025</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">1. Introduction</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          This Privacy Policy describes how Solia ("we", "us", "the Platform") handles information when you use our AI content creation and monetization platform built on the Solana blockchain. We are committed to protecting your privacy and being transparent about our data practices.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">2. Information We Do NOT Collect</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Solia is designed with privacy in mind. We do <strong className="text-zinc-300">not</strong> collect:
        </p>
        <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1 ml-2">
          <li>Personal names, email addresses, phone numbers, or physical addresses.</li>
          <li>Government-issued identification or KYC (Know Your Customer) data.</li>
          <li>Private keys, seed phrases, or wallet passwords.</li>
          <li>Location data or IP addresses for tracking purposes.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">3. Wallet-Based Authentication</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Authentication on Solia is performed exclusively through your <strong className="text-zinc-300">public wallet address</strong> on the Solana blockchain. We do not require account creation, passwords, or any personal information. Your public wallet address is the only identifier used to associate your activity on the Platform.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">4. On-Chain Data</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          All transactions on Solia (purchases, transfers, tips) are executed on the Solana blockchain. Blockchain transactions are <strong className="text-zinc-300">publicly visible</strong> and permanently recorded. This is a fundamental property of blockchain technology and is outside of our control. Anyone can view transaction history associated with a public wallet address using blockchain explorers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">5. Data We Store</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          To provide Platform functionality, we store the following in our database:
        </p>
        <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1 ml-2">
          <li>Your public wallet address (used as your account identifier).</li>
          <li>Content you create (AI-generated images, prompts, categories).</li>
          <li>Social interactions (likes, comments, follows).</li>
          <li>Optional profile information you choose to provide (Twitter handle, Telegram, YouTube links).</li>
          <li>Purchase and transaction records (linked to public wallet addresses).</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">6. How We Use Data</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          The data we store is used exclusively to:
        </p>
        <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1 ml-2">
          <li>Display your content in the public feed and your profile.</li>
          <li>Track content ownership and purchase history.</li>
          <li>Enable social features (likes, comments, follows, leaderboards).</li>
          <li>Process referral rewards.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">7. Third-Party Services</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Solia integrates with the following third-party services:
        </p>
        <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1 ml-2">
          <li><strong className="text-zinc-300">Solana Blockchain</strong> — for processing on-chain transactions.</li>
          <li><strong className="text-zinc-300">Wallet Providers</strong> (Phantom, Solflare, etc.) — for wallet connection and transaction signing. These are independent applications with their own privacy policies.</li>
          <li><strong className="text-zinc-300">AI Image Generation APIs</strong> — for generating content from text prompts. Prompts are sent to AI providers for processing.</li>
          <li><strong className="text-zinc-300">Supabase</strong> — for database and file storage.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">8. Data Security</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          We implement reasonable security measures to protect stored data. However, no method of electronic storage is 100% secure. Your wallet security is your responsibility — we never have access to your private keys.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">9. Children's Privacy</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Solia is not intended for use by individuals under the age of 13. We do not knowingly collect data from children.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">10. Changes to This Policy</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date. Continued use of the Platform constitutes acceptance of the revised policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">11. Contact</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          For privacy-related inquiries, please reach out through our official channels at{' '}
          <a href="https://solia.live" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            solia.live
          </a>.
        </p>
      </section>
    </div>
  );
};
