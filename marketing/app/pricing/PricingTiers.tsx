"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

const PRICE_SOURCE_LAST_SYNC = "2026-05-31";

type Tier = {
  id: "starter" | "growth" | "scale" | "enterprise";
  name: string;
  bestFor: string;
  outcome: string;
  monthly: number | null;
  annual: number | null;
  annualTotal: number | null;
  highlights: string[];
  details: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    bestFor: "One freight salesperson",
    outcome: "Build a focused book of active shipper accounts without buying another static list.",
    monthly: 125,
    annual: 94,
    annualTotal: 1125,
    highlights: ["75 shipment searches each month", "50 saved shipper accounts", "25 Pulse AI account briefs", "1 user seat"],
    details: ["10 CSV exports each month", "250 connected-mailbox sends each month", "75 LinkedIn activity touches each month", "Lane and shipper alerts", "Email support"],
    cta: { label: "Start 7-day trial", href: APP_SIGNUP_URL },
  },
  {
    id: "growth",
    name: "Growth",
    bestFor: "Freight sales teams",
    outcome: "Turn shipment signals into coordinated account research, outreach, and pipeline.",
    monthly: 499,
    annual: 374,
    annualTotal: 4491,
    highlights: ["350 shipment searches each month", "150 verified contact reveals", "100 Pulse AI account briefs", "3 user seats included"],
    details: ["250 saved contacts", "1,000 connected-mailbox sends each month", "250 LinkedIn activity touches each month", "Command Center CRM and pipeline stages", "Gmail and Outlook mailbox sending", "Priority support"],
    cta: { label: "Start 7-day trial", href: APP_SIGNUP_URL },
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    bestFor: "Established multi-seat teams",
    outcome: "Give a larger sales organization more research capacity, contacts, and managed support.",
    monthly: 999,
    annual: 749,
    annualTotal: 8991,
    highlights: ["1,000 shipment searches each month", "500 verified contact reveals", "500 Pulse AI account briefs", "5 user seats included"],
    details: ["1,000 saved contacts", "2,500 connected-mailbox sends each month", "750 LinkedIn activity touches each month", "100 CSV exports each month", "Command Center CRM and pipeline forecasting", "SLA-backed support"],
    cta: { label: "Start 7-day trial", href: APP_SIGNUP_URL },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    bestFor: "Large or multi-organization programs",
    outcome: "Configure governance, data access, integrations, and service levels around your operation.",
    monthly: null,
    annual: null,
    annualTotal: null,
    highlights: ["Custom usage and seat allocation", "SSO and SCIM provisioning", "Custom data feeds and integrations", "Named technical account manager"],
    details: ["Market benchmark analytics", "Data warehouse synchronization", "Custom security review and procurement support", "Audit logs and access controls", "Custom service-level agreement"],
    cta: { label: "Design your plan", href: "/demo" },
  },
];

const TRIAL_POINTS = [
  { icon: ShieldCheck, title: "No credit card", body: "Evaluate the real workflow first" },
  { icon: Sparkles, title: "10 + 10 included", body: "10 searches and 10 verified contacts" },
  { icon: ArrowRight, title: "Cancel without friction", body: "Monthly plans end at the billing period" },
];

export function PricingTiers() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  return (
    <section className="px-5 py-16 sm:px-8 sm:py-20" data-price-source-last-sync={PRICE_SOURCE_LAST_SYNC}>
      <div className="mx-auto max-w-container">
        <div className="relative overflow-hidden rounded-[32px] border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-cyan-50/80 px-6 py-9 shadow-[0_30px_80px_-48px_rgba(15,23,42,.55)] sm:px-10">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[700px]">
              <div className="eyebrow">Simple plans. Real freight workflows.</div>
              <h2 className="font-display mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink-900 sm:text-[48px]">Choose the capacity your sales team needs now.</h2>
              <p className="font-body mt-4 max-w-[620px] text-[15px] leading-relaxed text-ink-500">Every trial lasts 7 days and includes 10 searches plus 10 verified contacts. No credit card. Upgrade only when the workflow earns a place in your process.</p>
            </div>
            <div className="shrink-0">
              <div className="inline-flex rounded-xl border border-ink-100 bg-white/80 p-1 shadow-sm" role="group" aria-label="Billing period">
                {(["monthly", "annual"] as const).map((period) => (
                  <button key={period} type="button" aria-pressed={billing === period} onClick={() => setBilling(period)} className={["font-display rounded-lg px-4 py-2.5 text-[13px] font-semibold capitalize transition", billing === period ? "bg-blue-600 text-white shadow-sm" : "text-ink-500 hover:text-ink-900"].join(" ")}>
                    {period}{period === "annual" && <span className="ml-2 text-emerald-600">Save 25%</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="relative mt-8 grid gap-3 border-t border-blue-100 pt-6 sm:grid-cols-3">
            {TRIAL_POINTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white/65 p-4 shadow-sm backdrop-blur">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                <div><div className="font-display text-[13px] font-semibold text-ink-900">{title}</div><div className="font-body mt-1 text-[12px] leading-relaxed text-ink-500">{body}</div></div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-4">
          {TIERS.map((tier) => {
            const price = billing === "annual" ? tier.annual : tier.monthly;
            const custom = price === null;
            return (
              <article key={tier.id} className={["relative flex min-h-full flex-col overflow-hidden rounded-3xl border bg-white p-6 transition sm:p-7", tier.highlight ? "border-blue-500 shadow-[0_24px_64px_rgba(37,99,235,0.18)] ring-1 ring-blue-500/20" : "border-ink-100 shadow-sm hover:-translate-y-1 hover:shadow-lg"].join(" ")}>
                {tier.highlight && <div className="absolute right-0 top-0 rounded-bl-2xl bg-blue-600 px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-white">Best for teams</div>}
                <div className="font-display pr-14 text-[12px] font-bold uppercase tracking-[0.12em] text-brand-blue-700">{tier.bestFor}</div>
                <h3 className="font-display mt-3 text-[25px] font-semibold tracking-[-0.025em] text-ink-900">{tier.name}</h3>
                <p className="font-body mt-3 min-h-[72px] text-[13.5px] leading-relaxed text-ink-500">{tier.outcome}</p>
                <div className="mt-6 border-y border-ink-100 py-5">
                  {custom ? <><div className="font-display text-[35px] font-semibold leading-none text-ink-900">Custom</div><div className="font-body mt-2 text-[12px] text-ink-500">Scoped to seats, data, and governance.</div></> : <><div className="flex items-end gap-1.5"><span className="font-display text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink-900">${price}</span><span className="font-body pb-1 text-[12px] text-ink-500">/ month</span></div><div className="font-body mt-2 text-[12px] text-ink-500">{billing === "annual" ? `$${tier.annualTotal?.toLocaleString()} billed annually` : "Billed month to month"}</div></>}
                </div>
                <div className="mt-5 font-display text-[11px] font-bold uppercase tracking-[0.11em] text-ink-500">What matters most</div>
                <ul className="mt-3 space-y-3">
                  {tier.highlights.map((feature) => <li key={feature} className="flex items-start gap-2.5"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50"><Check className="h-3.5 w-3.5 text-blue-700" aria-hidden /></span><span className="font-body text-[13.5px] leading-relaxed text-ink-700">{feature}</span></li>)}
                </ul>
                <details className="group mt-5 border-t border-ink-100 pt-4">
                  <summary className="font-display flex cursor-pointer list-none items-center justify-between text-[12.5px] font-semibold text-ink-700">See everything included<ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden /></summary>
                  <ul className="mt-4 space-y-2.5">{tier.details.map((feature) => <li key={feature} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-500"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />{feature}</li>)}</ul>
                </details>
                <div className="mt-auto pt-7"><Button variant={tier.highlight ? "primary" : "secondary"} size="lg" href={tier.cta.href} className="w-full justify-center">{tier.cta.label}</Button></div>
              </article>
            );
          })}
        </div>
        <p className="font-body mt-7 text-center text-[12px] leading-relaxed text-ink-500">Prices are in USD. Usage resets each billing cycle. Gmail and Outlook sending are available; other integrations remain clearly marked as planned until released.</p>
      </div>
    </section>
  );
}
