import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Data processing addendum (DPA) + sub-processors",
  description: "Logistic Intel DPA and current list of sub-processors.",
  path: "/legal/dpa",
  eyebrow: "Legal",
});

const LAST_UPDATED = "May 1, 2026";

const SUB_PROCESSORS = [
  { name: "Vercel", purpose: "Hosting + edge runtime", region: "United States" },
  { name: "Supabase", purpose: "Postgres + edge functions", region: "United States" },
  { name: "Anthropic", purpose: "LLM inference for Pulse Coach", region: "United States" },
  { name: "Stripe", purpose: "Subscription billing + invoicing", region: "United States" },
  { name: "Resend", purpose: "Transactional email", region: "United States" },
  { name: "Logo.dev", purpose: "Public company logo resolution", region: "United States" },
  { name: "Sanity", purpose: "Marketing CMS (no customer data)", region: "United States" },
];

export default function DpaPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Legal"
        title="Data processing addendum"
        subtitle={`Last updated · ${LAST_UPDATED}`}
      />

      <section className="px-8 pb-12">
        <article className="mx-auto max-w-[760px] space-y-5 font-body text-[16px] leading-[1.7] text-ink-700">
          <p>
            We sign DPAs as standard. To execute LIT's standard DPA, email{" "}
            <a href="mailto:legal@logisticintel.com" className="text-brand-blue underline">
              legal@logisticintel.com
            </a>{" "}
            with your entity name and we'll return a counter-signed PDF within one business day.
          </p>
          <p>
            The standard DPA incorporates the EU Standard Contractual Clauses (Module Two — controller to
            processor) and the UK Addendum where applicable. EU data residency is available on Enterprise
            plans.
          </p>
        </article>
      </section>

      <section className="px-8 pb-20">
        <div className="mx-auto max-w-[820px]">
          <h2 className="display-lg">Sub-processors</h2>
          <p className="font-body mt-3 text-[15px] leading-relaxed text-ink-500">
            We notify customers in-app and by email at least 30 days before adding any new sub-processor that
            processes customer personal data.
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-25 text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="font-display px-5 py-3 font-bold">Processor</th>
                  <th className="font-display px-5 py-3 font-bold">Purpose</th>
                  <th className="font-display px-5 py-3 font-bold">Region</th>
                </tr>
              </thead>
              <tbody>
                {SUB_PROCESSORS.map((s) => (
                  <tr key={s.name} className="border-b border-ink-100 last:border-0">
                    <td className="font-display px-5 py-3 text-[14px] font-semibold text-ink-900">{s.name}</td>
                    <td className="font-body px-5 py-3 text-[13.5px] text-ink-700">{s.purpose}</td>
                    <td className="font-body px-5 py-3 text-[13.5px] text-ink-500">{s.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="Vendor security"
        title="Need our security packet?"
        subtitle="DPA, SOC 2 Type I, security questionnaire — we'll send the bundle within one business day."
        primaryCta={{ label: "Email security@", href: "mailto:security@logisticintel.com", icon: "arrow" }}
        secondaryCta={{ label: "Read security page", href: "/security" }}
      />
    </PageShell>
  );
}
