import type { Metadata } from "next";
import Link from "next/link";
import { Shield, Lock, KeyRound, FileCheck, Server, Eye, Users, Database } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { FaqSection } from "@/components/sections/FaqSection";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Security at LIT — encryption, SSO, SOC 2",
  description:
    "How LIT protects customer data. Encryption in transit and at rest, SSO + SCIM provisioning, role-based access, audit logs, and SOC 2 Type II program in flight.",
  path: "/security",
  eyebrow: "Security",
});

const PILLARS = [
  {
    icon: "Lock",
    tag: "Encryption",
    title: "TLS 1.3 in transit, AES-256 at rest",
    body: "Every byte that crosses the wire is TLS 1.3 encrypted. Database storage is AES-256 encrypted at the volume level via our hosting provider's KMS.",
  },
  {
    icon: "KeyRound",
    tag: "Identity",
    title: "SSO + SCIM",
    body: "SAML 2.0 SSO with Okta, Google, Azure AD, and custom IdPs. SCIM 2.0 for automated provisioning + deprovisioning on Scale and Enterprise plans.",
  },
  {
    icon: "Users",
    tag: "Access control",
    title: "Role-based permissions",
    body: "Owner, admin, member, and read-only roles. Scope access to specific saved lists, campaigns, or organizations. Custom roles available on Enterprise.",
  },
  {
    icon: "Eye",
    tag: "Auditability",
    title: "Audit logs",
    body: "Every privileged action — auth, data export, member changes — is logged and retained for 12 months. Exportable on Scale and Enterprise.",
  },
  {
    icon: "FileCheck",
    tag: "Compliance",
    title: "SOC 2 Type II in flight",
    body: "We are mid-audit for SOC 2 Type II. Type I report available under NDA today. GDPR + CCPA compliant — DPA available on request.",
  },
  {
    icon: "Server",
    tag: "Infrastructure",
    title: "US-based, redundant, monitored",
    body: "Hosted on Vercel + Supabase, multi-AZ Postgres with point-in-time recovery, full network isolation, 24/7 monitoring with on-call rotation.",
  },
  {
    icon: "Database",
    tag: "Data isolation",
    title: "Tenant-scoped at the row level",
    body: "Every customer row is scoped by org_id with database-enforced row-level security. There is no path through the API to read another tenant's data.",
  },
  {
    icon: "Shield",
    tag: "Vulnerability mgmt",
    title: "Continuous scanning",
    body: "Dependabot for dependency CVEs, daily container scans, and a managed bug bounty for the production surface. Pen-tested annually by an external firm.",
  },
];

const FAQS = [
  {
    question: "Where is my data stored?",
    answer:
      "Customer data is stored in US-East with multi-AZ replication. EU data residency is available on Enterprise plans — contact sales to discuss.",
  },
  {
    question: "Do you sign DPAs and BAAs?",
    answer:
      "We sign DPAs as standard. BAAs are not currently offered — LIT is not a HIPAA-covered platform. Reach out to security@logisticintel.com for our standard DPA.",
  },
  {
    question: "How do I report a vulnerability?",
    answer:
      "Email security@logisticintel.com with reproduction steps. We acknowledge within 24 hours and aim to remediate critical findings within 72 hours.",
  },
  {
    question: "Can I get our SOC 2 report?",
    answer:
      "SOC 2 Type I is available under NDA today. Type II will be available Q3. Contact sales for the latest report.",
  },
  {
    question: "Do you have a status page?",
    answer:
      "Yes — status.logisticintel.com publishes uptime, ongoing incidents, and historical incident postmortems.",
  },
];

export default function SecurityPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Security"
        title="Enterprise security,"
        titleHighlight="for revenue teams"
        titleSuffix="that move fast."
        subtitle="Encryption everywhere. Identity that fits your stack. SOC 2 Type II in flight. Built so security review isn't the thing that blocks the deal."
        primaryCta={{ label: "Read our docs", href: "/contact", icon: "arrow" }}
        secondaryCta={{ label: "Talk to security", href: "mailto:security@logisticintel.com" }}
        align="center"
      />

      {/* Compliance badge strip — moved off the homepage and onto the
          Security page where it belongs. Standards / claims / uptime
          stay close to the deeper detail in the pillar cards below. */}
      <section aria-label="Compliance and certifications" className="px-5 sm:px-8 pb-2">
        <div className="mx-auto max-w-content">
          <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-sm sm:px-7">
            <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 sm:justify-between">
              {[
                { abbr: "SOC", label: "SOC 2 Type II program" },
                { abbr: "GDR", label: "GDPR compliant" },
                { abbr: "CCP", label: "CCPA compliant" },
                { abbr: "256", label: "AES-256 encryption" },
              ].map((b) => (
                <span
                  key={b.abbr}
                  className="font-display inline-flex items-center gap-2 text-[12.5px] font-medium text-ink-500"
                >
                  <span
                    className="font-mono inline-flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold tracking-tighter"
                    style={{
                      background: "linear-gradient(180deg, #0f172a, #020617)",
                      color: "#00F0FF",
                      boxShadow: "0 0 0 1px rgba(0,240,255,0.22), 0 0 8px rgba(0,240,255,0.18)",
                    }}
                  >
                    {b.abbr}
                  </span>
                  {b.label}
                </span>
              ))}
              <span className="font-display inline-flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                  aria-hidden
                  style={{
                    boxShadow: "0 0 0 3px rgba(16,185,129,0.18)",
                    animation: "pulse-dot 2.4s infinite",
                  }}
                />
                99.98% uptime · last 90 days
              </span>
            </div>
          </div>
        </div>
      </section>

      <FeatureGrid features={PILLARS} cols={3} />

      <section className="px-5 sm:px-8 py-12">
        <div className="mx-auto max-w-container">
          <div className="rounded-2xl border border-ink-100 bg-white px-7 py-6 shadow-sm">
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink-200">
              Vendor security
            </div>
            <div className="font-display mt-1 text-[18px] font-semibold text-ink-900">
              Need our security questionnaire, SOC 2, or DPA?
            </div>
            <p className="font-body mt-2 max-w-[640px] text-[14px] leading-relaxed text-ink-500">
              Email{" "}
              <Link href="mailto:security@logisticintel.com" className="font-medium text-brand-blue underline">
                security@logisticintel.com
              </Link>{" "}
              and we'll respond within one business day with a complete security packet under NDA.
            </p>
          </div>
        </div>
      </section>

      <FaqSection faqs={FAQS} />
      <CtaBanner
        eyebrow="Security review"
        title="Talk to our security team."
        subtitle="We'll walk through our control set, share evidence, and answer anything your team needs."
        primaryCta={{ label: "Book security call", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Email security@", href: "mailto:security@logisticintel.com" }}
      />
    </PageShell>
  );
}
