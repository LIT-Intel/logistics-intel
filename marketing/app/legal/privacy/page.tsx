import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Privacy policy",
  description: "How Logistic Intel collects, uses, and protects your data.",
  path: "/legal/privacy",
  eyebrow: "Legal",
});

const LAST_UPDATED = "May 1, 2026";

export default function PrivacyPage() {
  return (
    <PageShell>
      <PageHero eyebrow="Legal" title="Privacy policy" subtitle={`Last updated · ${LAST_UPDATED}`} />

      <section className="px-8 pb-20">
        <article className="mx-auto max-w-[760px] space-y-6 font-body text-[16px] leading-[1.7] text-ink-700">
          <p>
            This is a placeholder privacy policy. Before launching, replace this content with your
            jurisdictionally-reviewed final policy. The structure below is a starting checklist of sections
            that any privacy policy in 2026 should cover.
          </p>
          <Section title="1. Who we are">
            Logistic Intel, Inc. ("LIT") provides market intelligence and revenue execution software at
            logisticintel.com and app.logisticintel.com. Contact: privacy@logisticintel.com.
          </Section>
          <Section title="2. Data we collect">
            Account data (name, email, role), usage telemetry (pages visited, queries run, features used),
            customer data you upload (saved companies, contacts, lists, activity), and integration data when
            you connect a CRM or outbound tool. We do not sell personal data.
          </Section>
          <Section title="3. How we use data">
            To operate, secure, and improve the product. To personalize your in-app experience. To send
            transactional and account emails. To detect and prevent abuse. To meet legal obligations.
          </Section>
          <Section title="4. Sharing">
            With sub-processors that operate parts of our infrastructure (hosting, email, analytics,
            customer support). A current sub-processor list is available at{" "}
            <a href="/legal/dpa" className="text-brand-blue underline">
              /legal/dpa
            </a>
            . With law enforcement when legally compelled.
          </Section>
          <Section title="5. Your rights">
            You may access, correct, delete, or export your personal data. You may opt out of marketing
            email at any time. EU/UK residents have GDPR rights; California residents have CCPA rights.
            Contact privacy@logisticintel.com to exercise.
          </Section>
          <Section title="6. Retention">
            We retain customer data for the life of your account plus 90 days. Backups roll off in 35 days.
            You may request earlier deletion at any time.
          </Section>
          <Section title="7. Security">
            See our{" "}
            <a href="/security" className="text-brand-blue underline">
              security page
            </a>{" "}
            for the full control set.
          </Section>
          <Section title="8. Children">
            LIT is a B2B product not intended for individuals under 18 and does not knowingly collect data
            from minors.
          </Section>
          <Section title="9. Changes">
            We will notify you of material changes via email and in-app banner at least 14 days before they
            take effect.
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
