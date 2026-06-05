"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

/**
 * Plan-card grid with a monthly / annual billing toggle. Single toggle
 * controls all four cards.
 *
 * Pricing and limits sourced from the Supabase `plans` table (rows where
 * `is_active = true`). Annual values are stored as a yearly total
 * (`price_yearly`) and rendered here as the equivalent per-seat per-month
 * cost (yearly / 12, rounded). When plan rows change, re-sync by
 * re-running the same SELECT against `plans` and updating
 * PRICE_SOURCE_LAST_SYNC below. Stripe remains the source of truth at
 * checkout — these numbers exist as the marketing anchor and must match
 * the Stripe products linked by `stripe_price_id_monthly` /
 * `stripe_price_id_yearly`.
 *
 * Feature copy reflects the real per-tier integer limits from the
 * `plans` table — never claim "unlimited" for a tier that has finite
 * caps. Only the Enterprise row has all-null limits, so only Enterprise
 * may surface unlimited usage.
 */

// Pricing + limits sourced from Supabase plans table on 2026-05-31.
// When plan rows change, re-sync via the same SELECT and update
// PRICE_SOURCE_LAST_SYNC.
const PRICE_SOURCE_LAST_SYNC = "2026-05-31";

type Tier = {
  id: "starter" | "growth" | "scale" | "enterprise";
  name: string;
  tagline: string;
  /* Monthly price in USD per workspace. `null` => contact-sales. */
  monthly: number | null;
  /* Annual price billed monthly equivalent (per workspace). `null` => contact-sales. */
  annual: number | null;
  rhythm: string; // "/ month" or empty
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For solo freight prospectors getting their first 50 conversations on the books.",
    // Supabase plans.code = "starter": price_monthly $125.00, price_yearly $1125.00
    // Annual per-month equivalent: 1125 / 12 = $93.75 ≈ $94
    monthly: 125,
    annual: 94,
    rhythm: "/ month",
    features: [
      "75 customs shipment searches / mo",
      "50 saved companies",
      "25 Pulse AI account briefs / mo",
      "10 CSV exports / mo",
      "250 campaign email sends / mo",
      "75 LinkedIn touches / mo",
      "1 user seat",
      "Email support",
    ],
    cta: { label: "Start free trial", href: APP_SIGNUP_URL },
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For revenue teams running multi-channel outbound across a real book of accounts.",
    // Supabase plans.code = "growth": price_monthly $499.00, price_yearly $4491.00
    // Annual per-month equivalent: 4491 / 12 = $374.25 ≈ $374
    monthly: 499,
    annual: 374,
    rhythm: "/ month",
    features: [
      "Everything in Starter",
      "350 customs shipment searches / mo",
      "150 verified contact reveals / mo",
      "100 Pulse AI account briefs / mo",
      "250 saved contacts",
      "1,000 campaign email sends / mo",
      "250 LinkedIn touches / mo",
      "HubSpot / Salesforce sync",
      "3 user seats included",
      "Priority support",
    ],
    cta: { label: "Start free trial", href: APP_SIGNUP_URL },
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For multi-seat ops teams running outbound at high volume across every lane.",
    // Supabase plans.code = "scale": price_monthly $999.00, price_yearly $8991.00
    // Annual per-month equivalent: 8991 / 12 = $749.25 ≈ $749
    monthly: 999,
    annual: 749,
    rhythm: "/ month",
    features: [
      "Everything in Growth",
      "1,000 customs shipment searches / mo",
      "500 verified contact reveals / mo",
      "500 Pulse AI account briefs / mo",
      "1,000 saved contacts",
      "2,500 campaign email sends / mo",
      "750 LinkedIn touches / mo",
      "100 CSV exports / mo",
      "5 user seats included",
      "SLA-backed support",
    ],
    cta: { label: "Start free trial", href: APP_SIGNUP_URL },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For multi-org programs and large freight networks with custom data and security needs.",
    // Supabase plans.code = "enterprise": price_monthly null, price_yearly null
    // All usage limits null = unlimited. seat_limit = 10 (custom beyond).
    // market_benchmark_enabled = true (Enterprise-only).
    monthly: null,
    annual: null,
    rhythm: "",
    features: [
      "Everything in Scale",
      "Unlimited shipment searches",
      "Unlimited contact reveals",
      "Unlimited Pulse AI briefs",
      "Market benchmark analytics",
      "SSO + SCIM provisioning",
      "Snowflake / data warehouse sync",
      "Custom data feeds and integrations",
      "Custom seat count (10+ included)",
      "Named TAM and custom SLAs",
    ],
    cta: { label: "Contact sales", href: "/demo" },
  },
];

export function PricingTiers() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  return (
    <section className="px-5 sm:px-8 py-16" data-price-source-last-sync={PRICE_SOURCE_LAST_SYNC}>
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
                Save ~25%
              </span>
            </button>
          </div>
        </div>

        {/* Cards: 2x2 grid on desktop so each of the 4 tiers has breathing
            room. Growth keeps the "Most popular" badge as the focal card. */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
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
                        Custom
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
                      Billed annually.
                    </div>
                  )}
                  {!isCustom && billing === "monthly" && (
                    <div className="font-body mt-2 text-[12.5px] text-ink-500">
                      Billed monthly.
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
