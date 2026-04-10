export default function PrivacyAndContactPage() {
  return (
    <main className="min-h-screen bg-white py-12 px-8 max-w-2xl mx-auto">
      <a href="/" className="text-xs text-gray-400 hover:text-gray-600">&larr; Back to login</a>

      <h1 className="text-3xl font-normal text-heading mt-6 mb-8">Privacy & Contact</h1>

      <section className="mb-10">
        <h2 className="text-lg font-medium text-heading mb-3">Data controller</h2>
        <p className="text-sm text-body leading-relaxed">
          This application is operated by <strong>University College London (UCL)</strong> for
          academic research purposes. UCL is the data controller for all personal data
          processed through this platform.
        </p>
        <div className="mt-3 text-sm text-body leading-relaxed">
          <p>University College London</p>
          <p>Gower Street, London WC1E 6BT</p>
          <p>United Kingdom</p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-medium text-heading mb-3">Data Protection Officer</h2>
        <p className="text-sm text-body leading-relaxed">
          UCL&apos;s Data Protection Officer can be contacted at{" "}
          <a href="mailto:data-protection@ucl.ac.uk" className="text-blue-600 hover:underline">data-protection@ucl.ac.uk</a>.
        </p>
        <p className="text-sm text-body leading-relaxed mt-2">
          For information about how UCL handles research participant data, see the{" "}
          <a
            href="https://www.ucl.ac.uk/legal-services/privacy/ucl-general-research-participant-privacy-notice"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            UCL General Research Participant Privacy Notice
          </a>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-medium text-heading mb-3">What data is collected</h2>
        <p className="text-sm text-body leading-relaxed mb-2">
          When you participate in a study through this platform, the following data is collected and stored:
        </p>
        <ul className="text-sm text-body leading-relaxed list-disc pl-5 space-y-1">
          <li>Your pseudonymous identifier (e.g. &quot;stern-satin-karma&quot;) &mdash; not your real name</li>
          <li>Stage progress: which stages you started and completed, and when</li>
          <li>Text responses you enter in input fields</li>
          <li>Chat transcripts if you use the AI assistant (your messages and the AI&apos;s responses)</li>
          <li>Files you upload to the AI assistant during chat</li>
          <li>Timestamps of all interactions</li>
        </ul>
        <p className="text-sm text-body leading-relaxed mt-2">
          No names, email addresses, IP addresses, or other directly identifying information
          is collected by this application.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-medium text-heading mb-3">Third-party AI providers</h2>
        <p className="text-sm text-body leading-relaxed mb-2">
          On stages where an AI chatbot is available, your chat messages are sent to one of the
          following providers depending on the study configuration:
        </p>
        <ul className="text-sm text-body leading-relaxed list-disc pl-5 space-y-1">
          <li><strong>Anthropic</strong> (Claude) &mdash; <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a></li>
          <li><strong>OpenAI</strong> (GPT) &mdash; <a href="https://openai.com/enterprise-privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a></li>
          <li><strong>Google</strong> (Gemini) &mdash; <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Terms of Service</a></li>
        </ul>
        <p className="text-sm text-body leading-relaxed mt-2">
          These providers act as data processors. Chat data is sent via encrypted connections
          and is subject to their respective data processing agreements. All three providers
          offer API terms that do not use input/output data for model training.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-medium text-heading mb-3">Cookies</h2>
        <p className="text-sm text-body leading-relaxed mb-2">
          This site uses <strong>session-only cookies</strong> that are strictly necessary for the
          application to function. No analytics, tracking, or third-party cookies are used.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="text-sm text-body w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium">Cookie</th>
                <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                <th className="text-left py-2 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">participant_id</td>
                <td className="py-2 pr-4">Identifies the logged-in participant</td>
                <td className="py-2">24 hours</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">is_test_user</td>
                <td className="py-2 pr-4">Enables test mode (timer skip, reset)</td>
                <td className="py-2">24 hours</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">admin_token</td>
                <td className="py-2 pr-4">Authenticates admin panel access</td>
                <td className="py-2">8 hours</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-body leading-relaxed mt-3">
          These cookies are exempt from consent requirements under the UK Privacy and Electronic
          Communications Regulations (PECR) as they are strictly necessary for the service to function.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-medium text-heading mb-3">Data storage and security</h2>
        <ul className="text-sm text-body leading-relaxed list-disc pl-5 space-y-1">
          <li>All data is stored in a PostgreSQL database hosted by <a href="https://neon.tech" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Neon</a> (US-based, SOC 2 compliant)</li>
          <li>The application is hosted on <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Vercel</a> (US-based, SOC 2 compliant)</li>
          <li>All connections are encrypted via TLS</li>
          <li>Participant passwords are hashed with bcrypt and cannot be recovered</li>
          <li>Access to the database is restricted to the research team</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-medium text-heading mb-3">Your rights</h2>
        <p className="text-sm text-body leading-relaxed mb-2">
          Under UK GDPR, you have the right to:
        </p>
        <ul className="text-sm text-body leading-relaxed list-disc pl-5 space-y-1">
          <li>Access the personal data held about you</li>
          <li>Request rectification of inaccurate data</li>
          <li>Request erasure of your data</li>
          <li>Object to or restrict processing</li>
          <li>Lodge a complaint with the <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Information Commissioner&apos;s Office (ICO)</a></li>
        </ul>
        <p className="text-sm text-body leading-relaxed mt-2">
          To exercise any of these rights, contact the research team or UCL&apos;s Data Protection
          Officer at <a href="mailto:data-protection@ucl.ac.uk" className="text-blue-600 hover:underline">data-protection@ucl.ac.uk</a>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-medium text-heading mb-3">Contact</h2>
        <p className="text-sm text-body leading-relaxed">
          For questions about this application or the research it supports, please contact
          the research team via the details provided in your participant information sheet.
        </p>
      </section>

      <footer className="border-t border-gray-200 pt-4 mt-12">
        <p className="text-xs text-gray-400">
          This application is open source under the Apache 2.0 license.{" "}
          <a
            href="https://github.com/benmaier/ucl-study-manager"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-500"
          >
            Source code on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
