import type { Metadata } from "next";
import { Save, GitMerge, FileText, UsersRound } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { ProductHero } from "@/components/sections/ProductHero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Freight CRM and Command Center | Logistics Intel",
  description:
    "Manage freight accounts, contacts, deals, pipeline stages, weighted forecasts, tasks, reports, campaigns, and activity in one freight-native CRM.",
  path: "/command-center",
  eyebrow: "Command Center",
});

const SECTIONS = [
  {
    icon: "Save",
    tag: "Shipment-aware accounts",
    title: "Work every account with freight context attached",
    body: "Save companies from Search or Pulse and keep shipment cadence, TEU, estimated spend, top routes, contacts, notes, tasks, campaigns, and deals on one shared account record.",
  },
  {
    icon: "GitMerge",
    tag: "Full deal pipeline",
    title: "Move opportunities from new to won",
    body: "Create deals, assign owners and contacts, set values and expected close dates, and move work through New, Qualified, Quoted, Negotiation, Won, and Lost on a visual pipeline board.",
  },
  {
    icon: "FileText",
    tag: "Tasks + activity",
    title: "Keep the next action visible",
    body: "Create and assign follow-up tasks, track due dates, capture deal activity, connect replies and meetings, and flag stale opportunities before they disappear from the forecast.",
  },
  {
    icon: "UsersRound",
    tag: "Forecasting + reports",
    title: "See pipeline health without rebuilding a spreadsheet",
    body: "Track open pipeline, active deals, weighted forecast, won revenue, tasks due, stage conversion, deal velocity, win/loss results, and owner performance from the same CRM workspace.",
  },
];

const PIPELINE_STAGES = [
  { name: "New", count: 18, tint: "#6366f1" },
  { name: "Qualified", count: 11, tint: "#0ea5e9" },
  { name: "Quoted", count: 7, tint: "#f59e0b" },
  { name: "Negotiation", count: 4, tint: "#8b5cf6" },
  { name: "Won", count: 3, tint: "#10b981" },
  { name: "Lost", count: 2, tint: "#94a3b8" },
];

export default function CommandCenterPage() {
  return (
    <PageShell>
      <ProductHero
        eyebrow="Command Center · Freight CRM"
        title="A full CRM built around"
        titleHighlight="freight opportunities."
        subtitle="Command Center connects shipment-aware accounts, contacts, deals, tasks, campaigns, pipeline forecasting, and performance reporting. Your reps can prospect, qualify, quote, follow up, and manage revenue without moving freight context into a generic CRM."
        visual={<PipelineMock />}
      />

      <FeatureGrid
        eyebrow="What's inside Command Center"
        title="The complete CRM workflow freight teams actually need."
        features={SECTIONS}
        cols={2}
      />

      <CtaBanner
        eyebrow="From first signal to closed deal"
        title="Run your freight pipeline in the same workspace as your intelligence."
        subtitle="The 7-day trial includes Command Center accounts, deals, pipeline stages, tasks, forecasting, and reports."
        primaryCta={{ label: "Start your 7-day trial", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}

/** Right-side hero visual — six-stage pipeline board mock. */
function PipelineMock() {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)]">
      <div className="font-display flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
          Q2 Outreach · 57 saved accounts
        </span>
        <span className="font-mono text-[10.5px] text-ink-200">Owner: Gabriel K.</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {PIPELINE_STAGES.map((s) => (
          <div key={s.name} className="rounded-lg border border-ink-100 bg-white p-2.5 shadow-xs">
            <div className="font-display flex items-center justify-between gap-2">
              <span className="truncate text-[10px] font-bold uppercase tracking-wider text-ink-500">
                {s.name}
              </span>
              <span
                className="font-mono shrink-0 text-[10px] font-semibold"
                style={{ color: s.tint }}
              >
                {s.count}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {[...Array(Math.min(3, s.count))].map((_, i) => (
                <div
                  key={i}
                  className="rounded-md border border-ink-100 bg-ink-25 px-2 py-1.5"
                >
                  <div className="h-2 w-3/4 rounded bg-ink-100" />
                  <div className="mt-1 h-1.5 w-1/2 rounded bg-ink-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="font-display mt-4 flex items-center justify-between rounded-lg bg-ink-25 px-3 py-2">
        <span className="text-[11px] font-semibold text-ink-700">Open pipeline · $8.4M · Weighted forecast · $3.7M</span>
        <span
          className="font-mono inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
          style={{
            color: "#10b981",
            background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.25)",
          }}
        >
          +18% MoM
        </span>
      </div>
    </div>
  );
}
