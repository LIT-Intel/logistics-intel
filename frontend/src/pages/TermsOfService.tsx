import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail } from "lucide-react";

export default function TermsOfService() {
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
            <h1 className="text-4xl font-bold text-slate-900 mb-4">Terms of Service</h1>
            <p className="text-slate-600">
              Last Updated: January 14, 2026
            </p>
          </div>

          <div className="prose prose-slate max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Agreement to Terms</h2>
              <p className="text-slate-700 leading-relaxed">
                These Terms of Service ("Terms") constitute a legally binding agreement between you and Logistics Intel ("LIT", "we", "us", or "our") concerning your access to and use of our freight intelligence and CRM platform, including our website, applications, and services (collectively, the "Services").
              </p>
              <p className="text-slate-700 leading-relaxed">
                By accessing or using our Services, you agree to be bound by these Terms. If you do not agree with all of these Terms, you are expressly prohibited from using the Services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Service Description</h2>
              <p className="text-slate-700 leading-relaxed mb-3">
                Logistics Intel provides a freight intelligence and CRM platform designed for logistics sales teams. Our Services include:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>Company search and discovery based on import/export activity</li>
                <li>Shipment data analysis and tracking</li>
                <li>Contact management and enrichment</li>
                <li>Campaign management and outreach automation</li>
                <li>RFP generation and document management</li>
                <li>Trade intelligence analytics and insights</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">User Accounts</h2>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Account Creation</h3>
              <p className="text-slate-700 leading-relaxed">
                To use our Services, you must create an account. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Account Security</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                You are responsible for:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>Maintaining the confidentiality of your account credentials</li>
                <li>All activities that occur under your account</li>
                <li>Notifying us immediately of any unauthorized access</li>
                <li>Ensuring your password meets our security requirements</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Account Eligibility</h3>
              <p className="text-slate-700 leading-relaxed">
                You must be at least 18 years old and have the legal capacity to enter into this agreement. By creating an account, you represent and warrant that you meet these requirements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Acceptable Use Policy</h2>
              <p className="text-slate-700 leading-relaxed mb-3">
                You agree not to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>Use the Services for any illegal purpose or in violation of any laws</li>
                <li>Share or resell access to the Services without authorization</li>
                <li>Scrape, harvest, or extract data using automated means</li>
                <li>Interfere with or disrupt the Services or servers</li>
                <li>Attempt to gain unauthorized access to any systems or data</li>
                <li>Use the Services to send spam, unsolicited communications, or malicious content</li>
                <li>Impersonate any person or entity or misrepresent your affiliation</li>
                <li>Upload viruses, malware, or other harmful code</li>
                <li>Reverse engineer or attempt to extract source code</li>
                <li>Remove or alter any copyright, trademark, or proprietary notices</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Subscription and Billing</h2>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Plans and Pricing</h3>
              <p className="text-slate-700 leading-relaxed">
                We offer various subscription plans with different features and usage limits. Current pricing and plan details are available on our website. We reserve the right to modify pricing with 30 days' notice to existing subscribers.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Free Trial</h3>
              <p className="text-slate-700 leading-relaxed">
                We may offer a 14-day free trial for new users. No payment method is required during the trial period. At the end of the trial, you must subscribe to a paid plan to continue using the Services.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Payment Terms</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                By providing payment information, you authorize us to charge your payment method for:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>Your selected subscription plan (monthly or annual)</li>
                <li>Any applicable taxes</li>
                <li>Additional usage fees beyond your plan limits</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Cancellation and Refunds</h3>
              <p className="text-slate-700 leading-relaxed">
                You may cancel your subscription at any time. Cancellations take effect at the end of the current billing period. We do not provide refunds for partial subscription periods except as required by law or at our sole discretion.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Intellectual Property Rights</h2>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Our Property</h3>
              <p className="text-slate-700 leading-relaxed">
                The Services, including all software, content, trademarks, logos, and trade names, are owned by or licensed to Logistics Intel. All rights not expressly granted are reserved. You may not copy, modify, distribute, sell, or lease any part of our Services.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Your Content</h3>
              <p className="text-slate-700 leading-relaxed">
                You retain ownership of any content you upload, create, or store in the Services ("User Content"). By using the Services, you grant us a license to use, store, and process your User Content solely to provide and improve the Services.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Trade Data</h3>
              <p className="text-slate-700 leading-relaxed">
                The trade data and business intelligence provided through our Services are derived from publicly available sources and proprietary analysis. This data is provided for informational purposes and should not be considered exhaustive or error-free.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Data Usage and Privacy</h2>
              <p className="text-slate-700 leading-relaxed">
                Your use of the Services is also governed by our Privacy Policy. By using the Services, you consent to the collection, use, and sharing of your information as described in our Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Third-Party Services</h2>
              <p className="text-slate-700 leading-relaxed">
                Our Services may integrate with third-party services (such as authentication providers, payment processors, and data enrichment services). We are not responsible for the availability, accuracy, or content of third-party services. Your use of third-party services is subject to their respective terms and policies.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Disclaimers and Limitations</h2>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Service Availability</h3>
              <p className="text-slate-700 leading-relaxed">
                We strive to provide reliable Services but do not guarantee uninterrupted or error-free operation. The Services are provided "as is" and "as available" without warranties of any kind, either express or implied.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Data Accuracy</h3>
              <p className="text-slate-700 leading-relaxed">
                While we make reasonable efforts to ensure data accuracy, we do not warrant that the trade data, company information, or analytics provided through the Services are complete, accurate, or current. You should independently verify critical information.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Limitation of Liability</h3>
              <p className="text-slate-700 leading-relaxed">
                To the maximum extent permitted by law, Logistics Intel shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, revenue, data, or use, arising from your use of the Services. Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Indemnification</h2>
              <p className="text-slate-700 leading-relaxed">
                You agree to indemnify and hold harmless Logistics Intel and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from your use of the Services, violation of these Terms, or infringement of any rights of another party.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Termination</h2>
              <p className="text-slate-700 leading-relaxed mb-3">
                We may suspend or terminate your access to the Services:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>If you violate these Terms or our policies</li>
                <li>If your account remains inactive for an extended period</li>
                <li>If required by law or court order</li>
                <li>For any reason with 30 days' notice</li>
              </ul>
              <p className="text-slate-700 leading-relaxed mt-4">
                Upon termination, your right to use the Services ceases immediately. We may delete your account and User Content, though we retain the right to preserve data as required by law or our data retention policies.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Dispute Resolution</h2>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Governing Law</h3>
              <p className="text-slate-700 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Arbitration</h3>
              <p className="text-slate-700 leading-relaxed">
                Any disputes arising from these Terms or your use of the Services shall be resolved through binding arbitration, except where prohibited by law. You waive the right to participate in class-action lawsuits or class-wide arbitration.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">General Provisions</h2>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Modifications</h3>
              <p className="text-slate-700 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of material changes via email or through the Services. Your continued use after changes become effective constitutes acceptance of the modified Terms.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Severability</h3>
              <p className="text-slate-700 leading-relaxed">
                If any provision of these Terms is found to be unenforceable, the remaining provisions shall remain in full force and effect.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Entire Agreement</h3>
              <p className="text-slate-700 leading-relaxed">
                These Terms, together with our Privacy Policy, constitute the entire agreement between you and Logistics Intel regarding the Services.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-6">Assignment</h3>
              <p className="text-slate-700 leading-relaxed">
                You may not assign or transfer these Terms without our prior written consent. We may assign these Terms without restriction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Contact Information</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                For questions about these Terms, please contact us:
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

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Acknowledgment</h2>
              <p className="text-slate-700 leading-relaxed">
                By using the Services, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
              </p>
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
