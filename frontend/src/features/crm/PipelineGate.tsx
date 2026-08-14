"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Lock, Sparkles, Loader2 } from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useEntitlements } from "@/hooks/useEntitlements";
import { fetchCrmAddonPricing, type CrmAddonPricing } from "@/api/entitlements";
import PipelineBoard from "./PipelineBoard";
import CrmCheckoutModal from "./CrmCheckoutModal";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

/**
 * Gate for the Pipeline view. Entitled orgs (crm_enabled) see the real
 * owner-scoped PipelineBoard exactly as before. Everyone else sees a read-only
 * DEMO pipeline (well-known freight companies, badged EXAMPLE) plus a prominent
 * "Unlock CRM — $X/seat" banner that opens the embedded Stripe checkout.
 *
 * The security boundary remains server-side (get-entitlements + RLS); this gate
 * is a UX affordance. A non-entitled user cannot read real deals anyway.
 */
export default function PipelineGate({ viewAsUserId = "" }: { viewAsUserId?: string }) {
  const { crmEnabled, isChecking, plan, invalidateCache } = useEntitlements();
  const [pricing, setPricing] = useState<CrmAddonPricing | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Load the org tier's per-seat price for the banner. Best-effort — the banner
  // falls back to a generic label if pricing isn't available.
  useEffect(() => {
    let alive = true;
    if (crmEnabled) return;
    const code = plan || "free_trial";
    fetchCrmAddonPricing(code).then((p) => {
      if (alive) setPricing(p);
    });
    return () => {
      alive = false;
    };
  }, [plan, crmEnabled]);

  // After returning from a completed Stripe checkout (return_url carries
  // ?crm_checkout=complete) refetch entitlements so the real pipeline replaces
  // the demo. Strip the param so a refresh doesn't re-trigger.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("crm_checkout") === "complete") {
      invalidateCache();
      params.delete("crm_checkout");
      const q = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    }
  }, [invalidateCache]);

  if (isChecking) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#64748b", fontFamily: FONT_BODY, fontSize: 14, background: "#F8FAFC" }}>
        <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Loading pipeline…
      </div>
    );
  }

  if (crmEnabled) {
    // Entitled: real owner-scoped pipeline, unchanged.
    return <PipelineBoard viewAsUserId={viewAsUserId} />;
  }

  const perSeat = pricing ? pricing.per_seat_cents / 100 : null;
  const seats = pricing?.forced_seats ?? 1;
  const totalMo = perSeat != null ? perSeat * seats : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F8FAFC" }}>
      {/* Unlock banner */}
      <div
        style={{
          margin: "16px 24px 0",
          borderRadius: 16,
          padding: "18px 22px",
          background: "linear-gradient(120deg, #4F46E5 0%, #6366F1 55%, #7C3AED 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          boxShadow: "0 10px 30px rgba(79,70,229,0.28)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.9 }}>
            <Sparkles style={{ width: 14, height: 14 }} /> LIT CRM add-on
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, marginTop: 4, letterSpacing: "-0.02em" }}>
            Turn your saved companies into a real sales pipeline
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, marginTop: 4, opacity: 0.92 }}>
            {perSeat != null ? (
              <>
                <strong>${perSeat.toFixed(0)}/seat/mo</strong>
                {seats > 1 ? (
                  <> × {seats} seats = <strong>${totalMo?.toFixed(0)}/mo</strong></>
                ) : null}{" "}
                — drag-and-drop deals, tasks, forecasting, and owner-scoped reports.
              </>
            ) : (
              <>Unlock deals, tasks, forecasting, and reports for your team.</>
            )}
          </div>
        </div>
        <button
          onClick={() => setCheckoutOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "11px 20px",
            borderRadius: 12,
            border: "none",
            background: "#fff",
            color: "#4F46E5",
            fontFamily: FONT_HEAD,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(15,23,42,0.15)",
          }}
        >
          <Lock style={{ width: 15, height: 15 }} />
          {totalMo != null ? `Unlock CRM — $${totalMo.toFixed(0)}/mo` : "Unlock CRM"}
        </button>
      </div>

      {/* Demo pipeline (read-only, badged EXAMPLE) */}
      <DemoPipeline />

      {checkoutOpen ? (
        <CrmCheckoutModal
          onClose={() => setCheckoutOpen(false)}
          onComplete={() => {
            setCheckoutOpen(false);
            invalidateCache();
          }}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Static illustrative demo pipeline. Well-known freight-relevant companies
// spread across the five default stages, so the value of the CRM is obvious
// before purchase. Every card is read-only and badged EXAMPLE.
// ─────────────────────────────────────────────────────────────────────

interface DemoDeal {
  company: string;
  domain: string;
  title: string;
  value: number;
  owner: string;
}

const DEMO_STAGES: { name: string; color: string; deals: DemoDeal[] }[] = [
  {
    name: "New",
    color: "#94A3B8",
    deals: [
      { company: "Walmart", domain: "walmart.com", title: "Ocean FCL — Asia to US West", value: 480000, owner: "Alex Kim" },
      { company: "Costco", domain: "costco.com", title: "LCL consolidation program", value: 210000, owner: "Priya Nair" },
    ],
  },
  {
    name: "Qualified",
    color: "#3B82F6",
    deals: [
      { company: "Home Depot", domain: "homedepot.com", title: "Drayage + warehousing RFP", value: 325000, owner: "Alex Kim" },
      { company: "Adidas", domain: "adidas.com", title: "Air freight — peak season", value: 165000, owner: "Sam Ortiz" },
    ],
  },
  {
    name: "Quoted",
    color: "#8B5CF6",
    deals: [
      { company: "Tesla", domain: "tesla.com", title: "Battery components — expedited", value: 610000, owner: "Priya Nair" },
      { company: "Samsung", domain: "samsung.com", title: "Reefer lanes — EU import", value: 288000, owner: "Sam Ortiz" },
    ],
  },
  {
    name: "Negotiation",
    color: "#F59E0B",
    deals: [
      { company: "Nike", domain: "nike.com", title: "Multi-modal 3PL contract", value: 720000, owner: "Alex Kim" },
      { company: "Ford", domain: "ford.com", title: "Inbound parts — Mexico cross-border", value: 540000, owner: "Priya Nair" },
    ],
  },
  {
    name: "Won",
    color: "#10B981",
    deals: [
      { company: "Amazon", domain: "amazon.com", title: "Middle-mile linehaul", value: 950000, owner: "Sam Ortiz" },
      { company: "Toyota", domain: "toyota.com", title: "JIT ocean program", value: 430000, owner: "Alex Kim" },
    ],
  },
];

function money(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function DemoPipeline() {
  const columns = useMemo(() => DEMO_STAGES, []);
  return (
    <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: 16, position: "relative" }}>
      <div style={{ display: "flex", gap: 14, height: "100%", minWidth: "min-content" }}>
        {columns.map((stage) => {
          const total = stage.deals.reduce((a, d) => a + d.value, 0);
          return (
            <div
              key={stage.name}
              style={{
                width: 288,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                background: "#F1F5F9",
                border: "1px solid #E5E7EB",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #E5E7EB", background: "#FFFFFF" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: "#0F172A", flex: 1 }}>{stage.name}</span>
                  <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: "#64748b", background: "#F1F5F9", borderRadius: 9999, padding: "1px 8px" }}>{stage.deals.length}</span>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#64748b", marginTop: 4 }}>{money(total)}</div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {stage.deals.map((deal) => (
                  <div
                    key={deal.company}
                    style={{
                      position: "relative",
                      background: "#FFFFFF",
                      border: "1px solid #E5E7EB",
                      borderRadius: 12,
                      padding: 11,
                      boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
                      cursor: "default",
                      userSelect: "none",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        fontFamily: FONT_HEAD,
                        fontSize: 8.5,
                        fontWeight: 800,
                        letterSpacing: "0.14em",
                        color: "#6366F1",
                        background: "#EEF2FF",
                        border: "1px solid #C7D2FE",
                        borderRadius: 6,
                        padding: "2px 6px",
                      }}
                    >
                      EXAMPLE
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 54 }}>
                      <CompanyAvatar name={deal.company} domain={deal.domain} size="sm" className="shrink-0" />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deal.company}</div>
                        <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deal.title}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>{money(deal.value)}</span>
                      <span title={`Owner: ${deal.owner}`} style={{ width: 22, height: 22, borderRadius: "50%", background: "#6366F1", color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 9, fontWeight: 700 }}>
                        {initials(deal.owner)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
