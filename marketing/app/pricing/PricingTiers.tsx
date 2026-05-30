"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

/**
 * Plan-card grid with a monthly / annual billing toggle. Single toggle
 * controls all three cards.
 *
 * Pricing here is illustrative until the Stripe `plans` table is wired
 * through. Per CLAUDE.md, Stripe is the source of truth for billing —
 * these numbers exist only as a marketing anchor. See the TODO comments
 * tagged "confirm against Stripe plans table" for every number that
 * must be reconciled before this page can be considered production
 * billing surface (it is NOT a billing surface — checkout happens on
 * /signup).
 */

type Tier = {
  id: "starter" | "growth" | "scale";
  name: string;
  tagline: string;
  /* Monthly price in USD per seat. `null` => contact-sales. */
  monthly: number | null;
  /* Annual price billed monthly (per seat). `null` => contact-sales. */
  annual: number | null;
  rhythm: string; // "/ seat / month" or "Contact sales"
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For solo freight prospectors getting their first 50 conversations on the books.",
    /* TODO: confirm against Stripe plans table */
    monthly: 199,
    annual: 169,
    rhythm: "/ seat / month",
    features: [
      "U.S. customs shipment search",
      "1,000 verified contact reveals / mo",
      "Pulse AI account briefs (50/mo)",
      "Lane and shipper alerts",
      "1 user seat",
      "Email support",
    ],
    cta: { label: "Start free trial", href: APP_SIGNUP_URL },
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For revenue teams running multi-channel outbound across a real book of accounts.",
    /* TODO: confirm against Stripe plans table */
    monthly: 399,
    annual: 349,
    rhythm: "/ seat / month",
    features: [
      "Everything in Starter",
      "5,000 verified contact reveals / mo",
      "Pulse AI account briefs (500/mo)",
      "Multi-channel outbound (email + LinkedIn)",
      "Command Center CRM with shipment context",
      "HubSpot / Salesforce sync",
      "5 user seats included (additional $99/seat/mo)",
      "Priority support",
    ],
    cta: { label: "Start free trial", href: APP_SIGNUP_URL },
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For multi-org programs and enterprise freight teams with custom data needs.",
    monthly: null,
    annual: null,
    rhythm: "Custom pricing",
    features: [
      "Everything in Growth",
      "Unlimited contact reveals",
      "Unlimited Pulse AI briefs",
      "SSO + SCIM",
      "Custom data feeds",
      "Dedicated CSM",
      "Snowflake / data warehouse sync",
      "SLA-backed support",
      "Custom seat pricing",
    ],
    cta: { label: "Contact sales", href: "/demo" },
  },
];

export function PricingTiers() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  return (
    <section className="px-5 sm:px-8 py-16">
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="eyebrow">Plans</div>
          <h2 className="display-lg mt-3">Plans that scale with your pipeline.</h2>
          <p className="font-body mt-4 text-[15px] leading-relaxed text-ink-500">
            Start free, then pick the plan that matches your team. Switch or cancel any time.
          </p>
        </div>

        {/* Monthly / Annual toggle */}
        <div className="mt-10 flex justify-center">
          <div
            role="tablist"
            aria-label="Billing period"
            className="inline-flex items-center gap-1 rounded-full border border-ink-100 bg-white p-1 shadow-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={billing === "monthly"}
              onClick={() => setBilling("monthly")}
              className={[
                "font-display h-9 rounded-full px-4 text-[13px] font-semibold transition",
                billing === "monthly"
                  ? "bg-ink-900 text-white"
                  : "text-ink-500 hover:text-ink-900",
              ].join(" ")}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billing === "annual"}
              onClick={() => setBilling("annual")}
              className={[
                "font-display inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition",
                billing === "annual"
                  ? "bg-ink-900 text-white"
                  : "text-ink-500 hover:text-ink-900",
              ].join(" ")}
            >
              Annual
              <span
                className={[
                  "font-mono inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  billing === "annual"
                    ? "bg-white/15 text-white"
                    : "bg-brand-blue/10 text-brand-blue-700",
                ].join(" ")}
              >
                Save ~15%
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map((tier) => {
            const price = billing === "annual" ? tier.annual : tier.monthly;
            const isCustom = price === null;

            return (
              <div
                key={tier.id}
                className={[
                  "relative flex flex-col rounded-3xl border bg-white p-7 transition-all",
                  tier.highlight
                    ? "border-brand-blue/30 shadow-xl ring-1 ring-brand-blue/10"
                    : "border-ink-100 shadow-sm hover:-translate-y-0.5 hover:shadow-md",
                ].join(" ")}
              >
                {tier.highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2"
                    aria-hidden={false}
                  >
                    <span className="font-display inline-flex items-center rounded-full bg-gradient-to-b from-brand-blue to-brand-blue-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]">
                      Most popular
                    </span>
                  </div>
                )}

                <div className="font-display text-[18px] font-semibold text-ink-900">
                  {tier.name}
                </div>
                <p className="font-body mt-2 min-h-[44px] text-[13.5px] leading-relaxed text-ink-500">
                  {tier.tagline}
                </p>

                <div className="mt-6">
                  {isCustom ? (
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-[36px] font-semibold leading-none tracking-[-0.02em] text-ink-900">
                        Contact sales
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-[44px] font-semibold leading-none tracking-[-0.02em] text-ink-900">
                        ${price}
                      </span>
                      <span className="font-body text-[13px] text-ink-500">
                        {tier.rhythm}
                      </span>
                    </div>
                  )}
                  {!isCustom && billing === "annual" && (
                    <div className="font-body mt-2 text-[12.5px] text-ink-500">
                      Billed annually. {/* TODO: confirm against Stripe plans table */}
                    </div>
                  )}
                  {!isCustom && billing === "monthly" && (
                    <div className="font-body mt-2 text-[12.5px] text-ink-500">
                      Billed monthly. {/* TODO: confirm against Stripe plans table */}
                    </div>
                  )}
                  {isCustom && (
                    <div className="font-body mt-2 text-[12.5px] text-ink-500">
                      Built around your seat count and data needs.
                    </div>
                  )}
                </div>

                <ul className="mt-6 space-y-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue"
                        aria-hidden
                      />
                      <span className="font-body text-[14px] leading-relaxed text-ink-700">
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 flex-1" />
                <Button
                  variant={tier.highlight ? "primary" : "secondary"}
                  size="lg"
                  href={tier.cta.href}
                  className="w-full justify-center"
                >
                  {tier.cta.label}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="font-body mt-8 text-center text-[12.5px] text-ink-500">
          Prices in USD. Taxes and applicable fees billed separately.
        </p>
      </div>
    </section>
  );
}
