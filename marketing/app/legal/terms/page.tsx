import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Terms of service",
  description: "The terms governing use of Logistic Intel.",
  path: "/legal/terms",
  eyebrow: "Legal",
});

const LAST_UPDATED = "May 1, 2026";

export default function TermsPage() {
  return (
    <PageShell>
      <PageHero eyebrow="Legal" title="Terms of service" subtitle={`Last updated · ${LAST_UPDATED}`} />

      <section className="px-8 pb-20">
        <article className="mx-auto max-w-[760px] space-y-6 font-body text-[16px] leading-[1.7] text-ink-700">
          <p>
            This is a placeholder terms of service. Replace with your reviewed final terms before launch.
            The structure below is a checklist of sections every B2B SaaS terms should cover.
          </p>
          <Section title="1. Acceptance">
            By creating an account or using LIT, you accept these Terms. If you're using LIT on behalf of
            an organization, you confirm you have authority to bind that organization.
          </Section>
          <Section title="2. Account">
            You're responsible for safeguarding your account, keeping admin access controlled, and notifying
            us if you suspect unauthorized access.
          </Section>
          <Section title="3. Subscription, billing, and trials">
            Plans, prices, and limits are provided in the order form or in writing at signup.
            We bill in advance — monthly or annually. Annual plans renew unless cancelled before renewal.
            Free trials end automatically and convert only when you provide payment details.
          </Section>
          <Section title="4. Acceptable use">
            You will not abuse the service, scrape it, attempt to circumvent rate limits, or use it for
            illegal targeting. You will not upload content that violates third-party rights.
          </Section>
          <Section title="5. Customer data ownership">
            You retain all rights to your data. We process it strictly to provide and improve the service
            per our DPA. We do not sell customer data.
          </Section>
          <Section title="6. Aggregate / de-identified usage">
            We may use de-identified, aggregated telemetry to improve the product. Nothing customer-identifying
            is shared externally.
          </Section>
          <Section title="7. Confidentiality">
            Both parties agree to protect non-public information disclosed during the engagement.
          </Section>
          <Section title="8. Warranties + disclaimers">
            We will provide the service with reasonable skill and care. Beyond that, the service is provided
            "as is" — see the full text in your final reviewed terms.
          </Section>
          <Section title="9. Liability">
            Aggregate liability is capped at fees paid in the 12 months preceding the claim. Neither party is
            liable for consequential damages.
          </Section>
          <Section title="10. Termination">
            Either party can terminate for cause on 30 days written notice. We may suspend immediately for
            abuse, security risk, or non-payment after notice.
          </Section>
          <Section title="11. Changes to the service">
            We continuously improve LIT. We will not make breaking changes to paid plans without 30 days
            notice. Pricing for active subscriptions does not change mid-term.
          </Section>
          <Section title="12. Governing law">
            Final terms will specify jurisdiction and dispute resolution.
          </Section>
        </article>
      </section>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display mt-8 mb-2 text-[20px] font-semibold tracking-[-0.015em] text-ink-900">
        {title}
      </h2>
      <p>{children}</p>
    </div>
  );
}
