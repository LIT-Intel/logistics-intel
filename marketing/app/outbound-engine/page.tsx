import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { ProductHero } from "@/components/sections/ProductHero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { SequenceBuilderMock } from "@/components/sections/SequenceBuilderMock";
import { buildMetadata } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Outbound Campaigns for Freight Sales Teams | Logistic Intel",
  description:
    "Create freight-specific outreach campaigns using company intelligence, enriched contacts, Pulse AI insights, and connected Gmail or Outlook accounts.",
  path: "/outbound-engine",
  eyebrow: "Outbound Engine",
});

const SECTIONS = [
  {
    icon: "Send",
    tag: "Campaign builder",
    title: "Build email + LinkedIn + call sequences",
    body: "Multi-step sequences with email, LinkedIn invites, call tasks, wait steps, and follow-ups. Drag-and-drop builder. Templates from the play library — lane-launch, carrier-pivot, RFP follow-up, win-back.",
  },
  {
    icon: "MessageSquare",
    tag: "Persona-based messaging",
    title: "Write to the right person, with the right angle",
    body: "Logistics manager, procurement director, supply chain VP, operations lead, customs manager, executive — Pulse-aware messaging adapts to the recipient's role and the account's freight context.",
  },
  {
    icon: "AtSign",
    tag: "Connected inboxes",
    title: "Send through your real Gmail or Outlook",
    body: "Outreach goes from the rep's connected inbox, not a generic system address. Better deliverability, better reply rates, no SPF/DKIM weirdness. Setup takes 60 seconds.",
  },
  {
    icon: "Activity",
    tag: "Conversation tracking",
    title: "Sent, opened, replied — all in the account view",
    body: "Track sent messages, opens, replies, campaign status, and account activity in one place. Replies sync back to the company profile so the next rep sees the full thread.",
  },
];

export default function OutboundEnginePage() {
  return (
    <PageShell>
      <ProductHero
        eyebrow="Outbound Engine"
        title="Send outreach with"
        titleHighlight="a reason to reach out."
        subtitle="Logistic Intel helps logistics teams build campaigns around real account context. Use shipment activity, trade lanes, buying signals, and enriched contacts to create outreach that feels relevant from the first message."
        visual={<SequenceBuilderMock />}
      />

      <FeatureGrid
        eyebrow="What the Outbound Engine does"
        title="Four reasons freight outbound from Logistic Intel converts higher."
        features={SECTIONS}
        cols={2}
      />

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-container">
          <div
            className="relative overflow-hidden rounded-3xl border border-white/10 px-6 py-10 text-white sm:px-10 sm:py-12"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full opacity-50"
              style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
            />
            <div className="relative mx-auto max-w-[760px] text-center">
              <div
                className="font-display text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#00F0FF" }}
              >
                The reply-rate math
              </div>
              <h2 className="font-display mt-3 text-[28px] font-semibold leading-tight tracking-[-0.015em]">
                Cold list reply rates: 1–2%. Signal-triggered freight outbound: 25–35%.
              </h2>
              <p className="font-body mx-auto mt-3 max-w-[560px] text-[15px] leading-relaxed text-ink-150">
                The single biggest variable in B2B outbound is timing. Logistic Intel helps you
                reach buyers the week their carrier mix shifts, their volume jumps, or their lane
                strategy changes — not three months later when the contract is already signed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="Send better outreach"
        title="Replace cold lists with signal-triggered campaigns."
        subtitle="Free trial gives you the campaign builder, 5 verified contact reveals, and a connected inbox."
        primaryCta={{ label: "Start free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
