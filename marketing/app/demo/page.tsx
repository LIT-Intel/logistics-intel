import type { Metadata } from "next";
import { Calendar, CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
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
      <section className="relative px-8 pt-[72px] pb-16">
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
              No slides. We'll load your real ICP into LIT and walk through how a typical week works once
              you're up and running.
            </p>
            <ul className="mt-8 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
                  <span className="font-body text-[15px] leading-relaxed text-ink-700">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div
              className="rounded-3xl border border-ink-100 bg-white p-2 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.18)]"
            >
              {/* Calendar embed slot — replace with real Calendly / Cal.com URL when env wired */}
              <div className="aspect-[5/6] rounded-2xl border border-ink-100 bg-ink-25 flex items-center justify-center">
                <div className="px-8 text-center">
                  <Calendar className="mx-auto h-9 w-9 text-brand-blue" />
                  <div className="font-display mt-4 text-[16px] font-semibold text-ink-900">
                    Calendar embed
                  </div>
                  <p className="font-body mt-2 text-[13px] leading-relaxed text-ink-500">
                    Connect Calendly, Cal.com, or HubSpot Meetings. The team prefers Cal.com — drop the public
                    page slug into{" "}
                    <code className="font-mono rounded bg-ink-50 px-1 py-0.5 text-[12px] text-brand-blue-700">
                      NEXT_PUBLIC_DEMO_CAL_URL
                    </code>{" "}
                    to swap this placeholder for the live booker.
                  </p>
                </div>
              </div>
            </div>
            <p className="font-body mt-4 text-center text-[12.5px] text-ink-200">
              Prefer email? <a href="mailto:sales@logisticintel.com" className="font-medium text-brand-blue underline">sales@logisticintel.com</a>
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
