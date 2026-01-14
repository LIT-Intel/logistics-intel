import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail } from "lucide-react";

export default function PrivacyPolicy() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => nav(-1)}
              className="text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                <span className="text-white font-bold text-sm">LI</span>
              </div>
              <span className="text-slate-900 font-semibold">Logistics Intel</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 md:p-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-4">Privacy Policy</h1>
            <p className="text-slate-600">
              Last Updated: January 14, 2026
            </p>
          </div>

          <div className="prose prose-slate max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Introduction</h2>
              <p className="text-slate-700 leading-relaxed">
                Welcome to Logistics Intel ("LIT", "we", "our", or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our freight intelligence and CRM platform.
              </p>
              <p className="text-slate-700 leading-relaxed">
                By accessing or using our services, you agree to the collection and use of information in accordance with this Privacy Policy. If you do not agree with our policies and practices, please do not use our services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Information We Collect</h2>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Personal Information</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                We collect information that you provide directly to us, including:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>Account information (name, email address, password)</li>
                <li>Company information (organization name, role, industry)</li>
                <li>Contact information (phone number, address)</li>
                <li>Payment information (processed securely through third-party providers)</li>
                <li>Communications and correspondence with us</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Usage Information</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                We automatically collect certain information when you use our services:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>Search queries and platform interactions</li>
                <li>Companies and contacts saved to your workspace</li>
                <li>Campaign and outreach activity</li>
                <li>Device information (IP address, browser type, operating system)</li>
                <li>Usage patterns and analytics data</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Third-Party Data</h3>
              <p className="text-slate-700 leading-relaxed">
                Our platform aggregates publicly available trade data from customs records, shipping manifests, and other legitimate sources. This data helps provide freight intelligence insights and is not personally identifiable information about individual users.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">How We Use Your Information</h2>
              <p className="text-slate-700 leading-relaxed mb-3">
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>Provide, maintain, and improve our services</li>
                <li>Process your transactions and manage your account</li>
                <li>Send you technical notices, updates, and support messages</li>
                <li>Respond to your inquiries and provide customer support</li>
                <li>Analyze usage patterns to enhance user experience</li>
                <li>Detect, prevent, and address technical issues and fraud</li>
                <li>Send marketing communications (with your consent)</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Data Sharing and Disclosure</h2>
              <p className="text-slate-700 leading-relaxed mb-3">
                We do not sell your personal information. We may share your information in the following circumstances:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li><strong>Service Providers:</strong> Third-party vendors who perform services on our behalf (authentication, analytics, hosting, payment processing)</li>
                <li><strong>Legal Requirements:</strong> When required by law, court order, or government request</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>With Your Consent:</strong> When you explicitly authorize us to share specific information</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Third-Party Services</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Our platform integrates with:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li><strong>Supabase:</strong> Authentication and database services</li>
                <li><strong>Google OAuth:</strong> Single sign-on authentication</li>
                <li><strong>Microsoft OAuth:</strong> Single sign-on authentication</li>
                <li><strong>Google Cloud Platform:</strong> Infrastructure and data processing</li>
                <li><strong>Payment Processors:</strong> Secure payment handling</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Data Security</h2>
              <p className="text-slate-700 leading-relaxed">
                We implement industry-standard security measures to protect your information, including encryption in transit and at rest, regular security audits, access controls, and secure authentication. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Data Retention</h2>
              <p className="text-slate-700 leading-relaxed">
                We retain your personal information for as long as necessary to provide our services, comply with legal obligations, resolve disputes, and enforce our agreements. When you delete your account, we will delete or anonymize your personal information within a reasonable timeframe, unless we are required to retain it by law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Your Privacy Rights</h2>
              <p className="text-slate-700 leading-relaxed mb-3">
                Depending on your location, you may have the following rights:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li><strong>Access:</strong> Request a copy of your personal information</li>
                <li><strong>Correction:</strong> Update or correct inaccurate information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                <li><strong>Data Portability:</strong> Receive your data in a structured format</li>
                <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications</li>
                <li><strong>Withdraw Consent:</strong> Revoke previously granted permissions</li>
              </ul>
              <p className="text-slate-700 leading-relaxed mt-4">
                To exercise these rights, please contact us using the information provided below.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Cookies and Tracking Technologies</h2>
              <p className="text-slate-700 leading-relaxed">
                We use cookies and similar tracking technologies to enhance your experience, analyze usage patterns, and deliver personalized content. You can control cookie preferences through your browser settings, though disabling cookies may affect certain functionality.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">International Data Transfers</h2>
              <p className="text-slate-700 leading-relaxed">
                Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place to protect your information in accordance with this Privacy Policy and applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Children's Privacy</h2>
              <p className="text-slate-700 leading-relaxed">
                Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected information from a child, we will take steps to delete such information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Changes to This Privacy Policy</h2>
              <p className="text-slate-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. Your continued use of our services after changes become effective constitutes acceptance of the revised policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Contact Us</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                If you have questions about this Privacy Policy or our privacy practices, please contact us:
              </p>
              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                <p className="font-semibold text-slate-900 mb-2">Logistics Intel Support</p>
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail className="w-4 h-4" />
                  <a href="mailto:support@logisticintel.com" className="text-blue-600 hover:underline">
                    support@logisticintel.com
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex justify-center gap-4">
          <Button
            onClick={() => nav("/login")}
            variant="outline"
            className="px-6"
          >
            Go to Login
          </Button>
          <Button
            onClick={() => nav("/signup")}
            className="px-6 bg-slate-900 hover:bg-slate-800"
          >
            Create Account
          </Button>
        </div>
      </main>
    </div>
  );
}
