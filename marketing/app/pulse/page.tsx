import type { Metadata } from "next";
import { Sparkles, Search, Compass, Bell, Zap, MessageSquare } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { FaqSection } from "@/components/sections/FaqSection";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Pulse — natural-language market intelligence",
  description:
    "Pulse is the natural-language search and signal layer that powers LIT. Ask in plain English, get a live answer from 124K+ shippers, 8.2M shipments, and the lanes you care about.",
  path: "/pulse",
  eyebrow: "Pulse",
});

const FEATURES = [
  {
    icon: "Search",
    tag: "Search",
    title: "Ask in plain English",
    body: "\"Furniture importers shipping from Vietnam in the last 90 days\" — Pulse parses intent, applies filters, and returns ranked results.",
  },
  {
    icon: "Compass",
    tag: "Coach",
    title: "Pulse Coach",
    body: "An always-on guide that surfaces what changed across your tracked lanes, accounts, and pipelines — and tells you why it matters this week.",
  },
  {
    icon: "Bell",
    tag: "Signals",
    title: "Live trade signals",
    body: "New shipments on a watched lane, carrier mix shifts, sudden volume changes, port congestion — Pulse pings you the moment things move.",
  },
  {
    icon: "Zap",
    tag: "Actions",
    title: "Action triggers",
    body: "Promote any signal into a workflow: launch a campaign, queue a contact, alert a teammate, or update CRM — without leaving the result.",
  },
  {
    icon: "MessageSquare",
    tag: "Chat",
    title: "Conversational follow-up",
    body: "Pulse keeps the thread. Ask a follow-up — \"Now narrow to ones in California\" — and it remembers the prior context.",
  },
  {
    icon: "Sparkles",
    tag: "Coverage",
    title: "All your data, one box",
    body: "Pulse searches across companies, contacts, shipments, lanes, ports, HS codes, and your saved CRM. One question, one ranked answer.",
  },
];

const FAQS = [
  {
    question: "How is Pulse different from a normal search bar?",
    answer:
      "It understands intent, joins data across companies + shipments + contacts in one query, and ranks by signal recency. You can ask the same question three different ways and get the same accurate answer.",
  },
  {
    question: "Does it use my private CRM data?",
    answer:
      "Pulse can pull from your saved companies and CRM activity if you've connected one — and it never shares that across tenants. Public trade data and our company graph are shared infrastructure; your CRM is yours alone.",
  },
  {
    question: "What model powers Pulse Coach?",
    answer:
      "We orchestrate Anthropic Claude for reasoning + tool use. Embeddings for retrieval. Classification heuristics first, LLM augmentation when confidence is low — keeps latency snappy and costs predictable.",
  },
  {
    question: "Can I use Pulse via API?",
    answer:
      "Yes — Scale and Enterprise plans get programmatic Pulse access for your own apps and agents.",
  },
];

export default function PulsePage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Pulse · Natural-language intelligence"
        title="Ask the market"
        titleHighlight="anything."
        titleSuffix="Get an answer that's actionable."
        subtitle="Pulse is the conversational layer over LIT's company graph, trade signals, and your own CRM. It's not search — it's a teammate who already read everything."
        primaryCta={{ label: "Try Pulse free", href: "https://app.logisticintel.com/signup", icon: "arrow" }}
        secondaryCta={{ label: "Watch a 90s tour", href: "/demo" }}
      />

      <section className="px-8 pb-12">
        <div className="mx-auto max-w-container">
          <div
            className="relative overflow-hidden rounded-3xl border border-white/10 p-2"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "0 30px 80px -20px rgba(15,23,42,0.5)",
            }}
          >
            <div className="aspect-[16/8] rounded-2xl bg-dark-0 p-6">
              <div className="flex items-center gap-3 rounded-xl border border-dark-3 bg-dark-1 px-4 py-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{
                    background: "rgba(0,240,255,0.12)",
                    boxShadow: "0 0 0 1px rgba(0,240,255,0.2)",
                  }}
                >
                  <Sparkles className="h-4 w-4" style={{ color: "#00F0FF" }} />
                </div>
                <span className="font-body flex-1 text-[14px] text-ink-150">
                  Show me wire harness importers shipping from Mexico that pivoted carriers in the last 60 days
                  <span
                    className="ml-1 inline-block h-3.5 w-[2px] align-middle"
                    style={{ background: "#00F0FF", animation: "caret 1s steps(2) infinite" }}
                  />
                </span>
                <span
                  className="font-mono inline-flex items-center rounded border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color: "#00F0FF",
                    borderColor: "rgba(0,240,255,0.35)",
                    background: "rgba(0,240,255,0.08)",
                  }}
                >
                  Trade · Industry · Carrier
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "23 companies match",
                  "8 had volume +25% MoM",
                  "5 use Yusen, 3 use OOCL, 15 mixed",
                  "Top contact pattern: Logistics Mgr",
                ].map((chip) => (
                  <span
                    key={chip}
                    className="font-mono rounded-full border border-dark-3 bg-dark-1 px-3 py-1 text-[11px] text-ink-150"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureGrid
        eyebrow="What Pulse can do"
        title="A search bar, a coach, and a workflow trigger — in one box."
        features={FEATURES}
        cols={3}
      />

      <FaqSection faqs={FAQS} />
      <CtaBanner
        eyebrow="Try Pulse"
        title="Skip the boolean. Ask a question."
        subtitle="Free trial gives you Pulse search, Coach, and 10 saved companies. No credit card."
        primaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup", icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
