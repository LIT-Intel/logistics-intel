import type { Metadata } from "next";
import { Calendar, CheckCircle2, Sparkles } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { DemoRequestForm } from "@/components/sections/DemoRequestForm";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Book a demo — LIT",
  description:
    "30-minute live demo. We'll show you LIT with your accounts, your lanes, and your industry — no slides, just product.",
  path: "/demo",
  eyebrow: "Demo",
});

const POINTS = [
  "We pre-load your top 5 target accounts so the tour is relevant.",
  "Live Pulse search against your buyer ICP — natural language, no Boolean.",
  "Trade lane and shipment intelligence walkthrough.",
  "Outbound campaign + signal trigger demo on your real pipeline.",
  "Q&A with a senior product person, not an SDR.",
];

export default function DemoPage() {
  return (
    <PageShell>
      <section className="relative px-6 pt-[72px] pb-16 sm:px-8">
        <div className="mx-auto grid max-w-container gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div>
            <div className="lit-pill">
              <span className="dot" />
              30 min · Live with your accounts
            </div>
            <h1 className="display-xl mt-5">
              Book a <span className="grad-text">live demo</span> with the team.
            </h1>
            <p className="lead mt-5 max-w-[560px]">
              No slides. We'll load your real ICP into LIT and walk through how a typical week works
              once you're up and running.
            </p>
            <ul className="mt-8 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
                  <span className="font-body text-[15px] leading-relaxed text-ink-700">{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-9 flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: "rgba(0,240,255,0.12)",
                  boxShadow: "inset 0 0 0 1px rgba(0,240,255,0.3)",
                }}
              >
                <Sparkles className="h-4 w-4" style={{ color: "#00F0FF" }} />
              </div>
              <div className="flex-1">
                <div className="font-display text-[12.5px] font-semibold text-ink-900">
                  Already on a free trial?
                </div>
                <p className="font-body text-[12px] leading-snug text-ink-500">
                  Skip the form — email{" "}
                  <a href="mailto:sales@logisticintel.com" className="font-medium text-brand-blue underline">
                    sales@logisticintel.com
                  </a>{" "}
                  to fast-track an upgrade walkthrough.
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.18)] sm:p-8">
              <div className="mb-5">
                <div className="font-display flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-200">
                  <Calendar className="h-3.5 w-3.5" />
                  Request a demo
                </div>
                <h2 className="font-display mt-2 text-[20px] font-semibold tracking-[-0.015em] text-ink-900">
                  Tell us a bit about you.
                </h2>
                <p className="font-body mt-1 text-[13px] leading-snug text-ink-500">
                  We'll respond within one business day with available times that match your team.
                </p>
              </div>
              <DemoRequestForm />
            </div>
            <p className="font-body mt-3 text-center text-[12px] text-ink-200">
              Prefer email?{" "}
              <a
                href="mailto:sales@logisticintel.com"
                className="font-medium text-brand-blue underline"
              >
                sales@logisticintel.com
              </a>
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
