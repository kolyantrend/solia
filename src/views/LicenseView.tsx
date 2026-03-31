import { FC } from 'react';

export const LicenseView: FC<{ onBack?: () => void }> = ({ onBack }) => {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 pb-28">
      {onBack && (
        <button onClick={onBack} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors mb-2">
          ← Back
        </button>
      )}
      <h1 className="text-2xl font-bold text-zinc-100">License Agreement</h1>
      <p className="text-xs text-zinc-500">Last updated: March 2025</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">1. Grant of License</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Solia grants you a limited, non-exclusive, non-transferable, revocable license to access and use the Platform solely for your personal, non-commercial purposes, subject to the terms of this Agreement. This license does not include any right to sublicense, modify, adapt, translate, reverse engineer, decompile, or disassemble any part of the Platform.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">2. User-Generated Content</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          You retain ownership of content you create using the Platform. By publishing content on Solia, you grant us a worldwide, royalty-free, non-exclusive license to display and distribute your content within the Platform. You represent and warrant that your content does not infringe any third-party rights.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">3. Purchased Content</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          When you purchase content from other creators on the Platform, you receive a personal, non-commercial license to view and enjoy that content. Purchased content may not be redistributed, resold, or used for commercial purposes without explicit permission from the original creator.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">4. Platform Technology</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          All software, interfaces, and technology underlying the Solia Platform are the exclusive property of Solia and its licensors. Nothing in this Agreement transfers any intellectual property rights in the Platform technology to you. Unauthorized use of Platform technology is strictly prohibited.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">5. AI Model Usage</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          The Platform uses third-party AI models to generate images. Generated images are subject to the terms and conditions of the underlying AI model providers. You agree not to use AI-generated content in ways that violate applicable laws, infringe third-party rights, or breach the acceptable use policies of the AI providers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">6. Token Transactions</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          All transactions on the Platform are conducted using SKR tokens on the Solana blockchain and are final and irreversible. Solia does not custody your tokens or private keys. You are solely responsible for the security of your wallet and the accuracy of all transactions you authorize.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">7. Restrictions</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          You agree not to:
        </p>
        <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1 ml-2">
          <li>Use the Platform for any unlawful purpose or in violation of any applicable laws.</li>
          <li>Generate, publish, or distribute content that is illegal, harmful, or infringes third-party rights.</li>
          <li>Attempt to gain unauthorized access to any part of the Platform or its infrastructure.</li>
          <li>Use automated means to access or interact with the Platform without our prior written consent.</li>
          <li>Reproduce, duplicate, copy, sell, or exploit any portion of the Platform without express written permission.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">8. Termination</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          This license is effective until terminated. Your rights under this Agreement will terminate automatically without notice if you fail to comply with any of its terms. Upon termination, you must cease all use of the Platform. Sections that by their nature should survive termination shall survive.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">9. Modifications</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Solia reserves the right to modify this License Agreement at any time. Changes will be effective upon posting to the Platform. Your continued use of the Platform after any changes constitutes your acceptance of the new terms. We encourage you to review this Agreement periodically.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">10. Contact</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          For questions about this License Agreement, please contact us at{' '}
          <a href="mailto:legal@solia.live" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            legal@solia.live
          </a>
          .
        </p>
      </section>
    </div>
  );
};
