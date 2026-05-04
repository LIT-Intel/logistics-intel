import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, Save, GitMerge, FileText, UsersRound } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "Freight CRM and Command Center | Logistic Intel",
  description:
    "Manage saved shippers, prospects, contacts, campaign activity, notes, and pipeline stages in a freight-focused CRM workspace.",
  path: "/command-center",
  eyebrow: "Command Center",
});

const SECTIONS = [
  {
    icon: "Save",
    tag: "Save the right companies",
    title: "Turn searches into organized prospect lists",
    body: "Build saved-company lists from any Pulse search, lane, industry, or HS code. Lists are the unit of outbound coordination — sales, BD, and ops can all work the same list.",
  },
  {
    icon: "GitMerge",
    tag: "Pipeline stages",
    title: "Move accounts through the freight buying cycle",
    body: "Prospecting → Contacted → Engaged → Quoting → Won → Lost. Custom stages on Scale and Enterprise. Drag-and-drop board view + table view.",
  },
  {
    icon: "FileText",
    tag: "Context attached",
    title: "Notes, tasks, activity, and intelligence in one place",
    body: "Every saved company holds shipment intelligence, contacts, notes, tasks, campaigns, and activity. Open the company, see everything that's happened on it.",
  },
  {
    icon: "UsersRound",
    tag: "Team workspace",
    title: "Assign owners, manage lists, share visibility",
    body: "Assign accounts to reps, manage shared lists, keep sales activity visible across the org. Role-based permissions on Scale and Enterprise.",
  },
];

const PIPELINE_STAGES = [
  { name: "Prospecting", count: 28, tint: "#94a3b8" },
  { name: "Contacted", count: 14, tint: "#3b82f6" },
  { name: "Engaged", count: 9, tint: "#06b6d4" },
  { name: "Quoting", count: 4, tint: "#f59e0b" },
  { name: "Won", count: 2, tint: "#10b981" },
];

export default function CommandCenterPage() {
  return (
    <PageShell>
      <section className="relative px-5 pt-[72px] pb-12 sm:px-8">
        <div className="mx-auto grid max-w-container gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
          <div>
            <div className="lit-pill">
              <span className="dot" />
              Command Center · Freight CRM
            </div>
            <h1 className="display-xl mt-5">
              A CRM workspace built around{" "}
              <span className="grad-text">freight opportunities.</span>
            </h1>
            <p className="lead mt-5 max-w-[560px]">
              Command Center gives your team one place to manage saved companies, contacts, notes,
              tasks, campaigns, and pipeline movement. It is the bridge between intelligence and
              action — so reps stop maintaining a separate CRM that doesn't know what your buyers
              are shipping.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={APP_SIGNUP_URL}
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                Start Prospecting <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
              >
                <Calendar className="h-4 w-4" /> Book a Demo
              </Link>
            </div>
          </div>

          {/* Visual: pipeline mock */}
          <div className="relative">
            <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)]">
              <div className="font-display flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                  Q2 Outreach · 57 saved accounts
                </span>
                <span className="font-mono text-[10.5px] text-ink-200">Owner: V. Raymond</span>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-1.5">
                {PIPELINE_STAGES.map((s) => (
                  <div
                    key={s.name}
                    className="rounded-lg border border-ink-100 bg-white p-2.5 shadow-xs"
                  >
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
                <span className="text-[11px] font-semibold text-ink-700">
                  Pipeline value · $8.4M
                </span>
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
          </div>
        </div>
      </section>

      <FeatureGrid
        eyebrow="What's inside Command Center"
        title="The CRM layer freight teams actually use."
        features={SECTIONS}
        cols={2}
      />

      <CtaBanner
        eyebrow="Stop running two CRMs"
        title="Move your freight pipeline into the same workspace as your intelligence."
        subtitle="Free trial includes Command Center, saved-company lists, and pipeline tracking."
        primaryCta={{ label: "Start free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
