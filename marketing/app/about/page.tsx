import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "About LIT — built for the next generation of revenue teams",
  description:
    "We started LIT because data tools, CRMs, and outbound platforms all assumed the work was someone else's problem. We built one system that makes the whole motion faster.",
  path: "/about",
  eyebrow: "About",
});

const PRINCIPLES = [
  {
    title: "Signal beats list-buying.",
    body:
      "There is more public trade and corporate signal than anyone is using. Most teams still buy lists. The future is acting on what is happening now, not what was true last quarter.",
  },
  {
    title: "Intelligence belongs next to action.",
    body:
      "If you have to switch tabs to act on what you just learned, you'll forget two-thirds of it. LIT keeps the data, the workflow, and the outreach in one place.",
  },
  {
    title: "AI assists, humans decide.",
    body:
      "Pulse Coach surfaces what changed and what to do about it. It never sends an email without your sign-off. We think generative outreach without judgment is how trust gets burned.",
  },
  {
    title: "Pricing should match value.",
    body:
      "No hidden overage fees. No per-seat traps. We win when you find more revenue than you would have without us — and that is the only number we optimize for.",
  },
];

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="About"
        title="We're building the platform"
        titleHighlight="we wanted"
        titleSuffix="when we were running revenue teams."
        subtitle="LIT brings together company intelligence, trade signals, CRM, and execution into one platform — so revenue teams can move from signal to action without switching tools."
        align="center"
      />

      <section className="px-8 py-16">
        <div className="mx-auto max-w-[820px]">
          <div className="eyebrow text-center">Our story</div>
          <h2 className="display-lg mt-3 text-center">From frustrated operators to a real platform.</h2>
          <div className="font-body mt-6 space-y-5 text-[17px] leading-[1.7] text-ink-700">
            <p>
              LIT started where every honest software product starts: a problem we kept hitting at our last company. We
              were running outbound at a logistics SaaS, trying to stitch together company data from one tool, contact
              data from another, trade signals from a third, and a CRM that knew none of it. Every week we'd watch a
              great account slip past us because the right person heard about us two months too late.
            </p>
            <p>
              We tried buying our way out. We were paying for six tools, a data team, and an analyst — and the answer
              to "which 50 companies should we hit this week" still took two days to put together. Something was
              broken, and it wasn't us.
            </p>
            <p>
              So we built LIT. One platform that watches the market, surfaces what changed, tells you why it matters,
              and lets you act — without leaving the page. We obsess over the moment a signal becomes pipeline, and
              everything we ship is in service of making that moment as short as possible.
            </p>
          </div>
        </div>
      </section>

      <section className="px-8 py-16">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">Principles</div>
            <h2 className="display-lg mt-3">What we believe.</h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <h3 className="display-sm">{p.title}</h3>
                <p className="font-body mt-3 text-[15px] leading-relaxed text-ink-500">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-8 py-16">
        <div className="mx-auto max-w-[820px]">
          <div className="eyebrow text-center">Where we're going</div>
          <h2 className="display-lg mt-3 text-center">Boring goals, ambitious software.</h2>
          <div className="font-body mt-6 space-y-5 text-[17px] leading-[1.7] text-ink-700">
            <p>
              We aren't here to be the next consumer-AI moonshot. We are here to build durable software that makes
              every revenue team that uses it materially faster than the one across the street. That looks like
              tighter signal coverage, faster CRM workflows, and AI that understands your specific accounts.
            </p>
            <p>
              We're hiring engineers, designers, and revenue operators who care about the same things. If that's
              you,{" "}
              <Link href="/contact" className="font-medium text-brand-blue underline">
                say hello
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="Get in touch"
        title="Want to see what we've built?"
        subtitle="A 30-minute live tour with the team. No deck. Real product, your accounts."
        primaryCta={{ label: "Book a Demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Read the blog", href: "/blog" }}
      />
    </PageShell>
  );
}
