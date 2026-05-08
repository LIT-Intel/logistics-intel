import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, Shield, Building2 } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Contact LIT — sales, support, security, careers",
  description:
    "Reach the right team in one click. Sales, customer support, security disclosure, and careers — all routed to the people who can actually help.",
  path: "/contact",
  eyebrow: "Contact",
});

const CHANNELS = [
  {
    icon: Building2,
    title: "Sales",
    body: "Pricing questions, demos, custom plans, procurement.",
    href: "/demo",
    cta: "Book a demo",
  },
  {
    icon: MessageCircle,
    title: "Customer support",
    body: "Existing customer? We respond within 4 business hours.",
    href: "mailto:support@logisticintel.com",
    cta: "support@logisticintel.com",
  },
  {
    icon: Shield,
    title: "Security disclosure",
    body: "Found a vulnerability? We acknowledge within 24 hours.",
    href: "mailto:security@logisticintel.com",
    cta: "security@logisticintel.com",
  },
  {
    icon: Mail,
    title: "Press & partnerships",
    body: "Editorial, integrations, co-marketing, podcast bookings.",
    href: "mailto:press@logisticintel.com",
    cta: "press@logisticintel.com",
  },
];

export default function ContactPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Contact"
        title="How can we"
        titleHighlight="help?"
        subtitle="Pick the right team below — every inbox is monitored by the people who can actually answer your question."
        align="center"
      />

      <section className="px-5 sm:px-8 pb-20">
        <div className="mx-auto grid max-w-container grid-cols-1 gap-5 md:grid-cols-2">
          {CHANNELS.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.title}
                href={c.href}
                className="group rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
              >
                <div
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: "rgba(37,99,235,0.08)",
                    boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                  }}
                >
                  <Icon className="h-5 w-5 text-brand-blue" />
                </div>
                <h3 className="display-sm">{c.title}</h3>
                <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{c.body}</p>
                <div className="font-display mt-4 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                  {c.cta} →
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="px-5 sm:px-8 pb-24">
        <div className="mx-auto max-w-container">
          <div
            className="rounded-3xl border border-white/10 px-10 py-10 text-white"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
            }}
          >
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "#00F0FF" }}>
              Headquarters
            </div>
            <div className="font-display mt-2 text-[20px] font-semibold tracking-[-0.015em]">
              Logistic Intel, Inc.
            </div>
            <p className="font-body mt-1 text-[15px] leading-relaxed text-ink-150">
              United States · Remote-first · Customers in 14 countries
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
