import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, Briefcase } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Careers — join the team building LIT",
  description:
    "We're a small, operator-grade team building Logistic Intel — the freight revenue intelligence platform for sales teams running outbound on real shipment data.",
  path: "/careers",
  eyebrow: "Careers",
});

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "Operators, not theorists.",
    body: "Everyone on the team has run a freight P&L, a sales motion, or a data pipeline against a deadline. We build for the operator because we are the operator.",
  },
  {
    title: "Ship the smallest unit that matters.",
    body: "Five days of small, shippable work beats five weeks of big-bang feature plans. The product gets better the day we ship something — not the day we promise something.",
  },
  {
    title: "Calibrated, not loud.",
    body: "We claim what we can defend. \"High confidence\" means high confidence. The same standard applies to our marketing, our recommendations, and our dashboards.",
  },
  {
    title: "Remote-first, async-default.",
    body: "Distributed across three time zones. Async writing > meetings. We hire for clarity in writing as much as code.",
  },
];

const HIRING_AREAS: { area: string; body: string }[] = [
  {
    area: "Engineering",
    body: "Full-stack TypeScript / Next.js, data engineering on customs feeds, ML on entity resolution, agent infra. Strong taste for clean APIs and small surfaces.",
  },
  {
    area: "Design",
    body: "Product + marketing design that operates at the same standard as the engineering. Heavy systems work; you'll own the shared design language across app + site.",
  },
  {
    area: "Customer engineering",
    body: "Land + expand with revenue teams at forwarders, brokers, and 3PLs. You'll write playbooks, run onboarding, and feed product roadmap signals back from real customers.",
  },
];

export default function CareersPage() {
  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Careers" },
        ]}
      />
      <PageHero
        eyebrow="Careers"
        title="Build the platform"
        titleHighlight="freight sales actually wants."
        subtitle="LIT is a small, operator-grade team building the revenue intelligence layer for global trade. Remote-first, async-default, ship-bias on."
      />

      <Section top="md" bottom="md">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr,2fr] lg:gap-16">
          <div>
            <div className="eyebrow">How we work</div>
            <h2 className="display-md space-eyebrow-h1">
              Four principles. <span className="grad-text">Not negotiable.</span>
            </h2>
            <p className="font-body mt-4 text-[15px] leading-relaxed text-ink-500">
              We&apos;re selective on the team because the bar compounds. Every hire either
              raises the median or doesn&apos;t happen.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            {PRINCIPLES.map((p, i) => (
              <div
                key={p.title}
                className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
              >
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-blue">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="display-sm mt-2 leading-tight">{p.title}</h3>
                <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mx-auto max-w-[640px] text-center">
          <div className="eyebrow">Where we&apos;re hiring</div>
          <h2 className="display-md space-eyebrow-h1">
            No open roles posted right now —{" "}
            <span className="grad-text">but we&apos;re always reading.</span>
          </h2>
          <p className="lead space-h1-intro mx-auto max-w-[560px]">
            We add headcount in three areas as the work demands it. If you&apos;re exceptional in
            any of them, send us a real artifact (PR, project, doc) — we read everything.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
          {HIRING_AREAS.map((a) => (
            <div
              key={a.area}
              className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{
                  background: "rgba(37,99,235,0.08)",
                  boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                }}
              >
                <Briefcase className="h-5 w-5 text-brand-blue" aria-hidden />
              </div>
              <h3 className="display-sm mt-4 leading-tight">{a.area}</h3>
              <p className="font-body mt-3 text-[14px] leading-relaxed text-ink-500">{a.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section top="md" bottom="lg">
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 px-8 py-12 sm:px-14 sm:py-14 text-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)]"
          style={{
            background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
            boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18), 0 30px 80px -20px rgba(15,23,42,0.5)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full opacity-50"
            style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
          />
          <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-[2fr,1fr] lg:items-center">
            <div className="max-w-[680px]">
              <div
                className="font-display text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#00F0FF" }}
              >
                Apply
              </div>
              <h2 className="font-display mt-3 text-[28px] sm:text-[36px] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
                Send us a real artifact.
              </h2>
              <p className="font-body mt-4 text-[15.5px] leading-relaxed text-ink-150">
                Email{" "}
                <a
                  href="mailto:careers@logisticintel.com"
                  className="font-semibold text-white underline decoration-cyan-400/50 underline-offset-4 hover:decoration-cyan-400"
                >
                  careers@logisticintel.com
                </a>{" "}
                with a PR, a side project, a doc, or a teardown — anything that shows how you
                think. Skip the resume PDF; we&apos;ll ask if we need it.
              </p>
            </div>
            <div className="flex justify-start lg:justify-end">
              <a
                href="mailto:careers@logisticintel.com"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.45)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.55)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                <Mail className="h-4 w-4" />
                Email careers
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </Section>

      <CtaBanner
        eyebrow="Want the product story first?"
        title="Start with the platform."
        subtitle="Get a feel for what we build and how. Then send a real artifact — that conversation is faster than any cover letter."
        primaryCta={{ label: "See features", href: "/features", icon: "arrow" }}
        secondaryCta={{ label: "Read the blog", href: "/blog" }}
      />
    </PageShell>
  );
}
