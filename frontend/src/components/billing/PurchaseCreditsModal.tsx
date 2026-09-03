"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Zap, Loader2 } from "lucide-react";
import EmbeddedCheckoutModal, {
  type EmbeddedCheckoutResult,
} from "@/components/billing/EmbeddedCheckoutModal";
import {
  fetchCreditPackages,
  startCreditPackCheckout,
  type CreditPack,
} from "@/api/entitlements";
import { useEntitlements } from "@/hooks/useEntitlements";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/**
 * "Add LIT Credits" — pick a top-up pack, then complete an embedded Stripe
 * checkout. Purchased credits are added to the workspace balance by
 * billing-webhook (one-time payment). Admin-gated server-side (§77).
 */
export default function PurchaseCreditsModal({ onClose }: { onClose: () => void }) {
  const { creditBalance, invalidateCache } = useEntitlements();
  const [packs, setPacks] = useState<CreditPack[] | null>(null);
  const [selected, setSelected] = useState<CreditPack | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCreditPackages().then((p) => {
      if (alive) setPacks(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const returnUrl = useMemo(
    () =>
      typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}?credit_purchase=complete`
        : undefined,
    [],
  );

  // When a pack is chosen, hand off to the shared embedded-checkout modal.
  if (selected) {
    return (
      <EmbeddedCheckoutModal
        onClose={() => setSelected(null)}
        onComplete={() => {
          invalidateCache();
          onClose();
        }}
        fetchClientSecret={async (): Promise<EmbeddedCheckoutResult> => {
          const r = await startCreditPackCheckout(selected.id, returnUrl);
          if (r.ok) return { ok: true, client_secret: r.client_secret };
          return { ok: false, notConfigured: true, message: r.message };
        }}
        title={`Add ${selected.credits.toLocaleString()} credits`}
        eyebrow="LIT CREDITS"
        ariaLabel="Purchase LIT credits"
      />
    );
  }

  const total = creditBalance?.total_remaining ?? null;
  const purchased = creditBalance?.purchased_remaining ?? 0;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add LIT credits"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2147483000,
        background: "rgba(15,23,42,0.55)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto",
          background: "#FFFFFF", borderRadius: 18,
          boxShadow: "0 24px 64px rgba(15,23,42,0.28)", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 22px", background: "#0A1024", borderTopLeftRadius: 18, borderTopRightRadius: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(0,240,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Zap style={{ width: 20, height: 20, color: "#00F0FF" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: "#7DD3FC", letterSpacing: "0.22em", textTransform: "uppercase" }}>LIT CREDITS</div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.01em" }}>Add LIT Credits</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "rgba(255,255,255,0.08)", cursor: "pointer", color: "#CBD5E1", padding: 7, borderRadius: 8, flexShrink: 0, lineHeight: 0 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <p style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#475569", margin: "0 0 4px" }}>
            Add credits to your workspace. Purchased credits remain available for 12 months.
          </p>
          {creditBalance ? (
            <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#64748B", marginBottom: 14 }}>
              Current balance:{" "}
              <strong style={{ color: "#0F172A" }}>
                {creditBalance.unlimited ? "Unlimited" : `${(total ?? 0).toLocaleString()} credits`}
              </strong>
              {!creditBalance.unlimited && purchased > 0 ? ` (${purchased.toLocaleString()} purchased)` : ""}
            </div>
          ) : (
            <div style={{ height: 14 }} />
          )}

          {packs === null ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "36px 0", color: "#64748b", fontFamily: FONT_BODY, fontSize: 13 }}>
              <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Loading packs…
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {packs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  style={{
                    position: "relative", textAlign: "left", cursor: "pointer",
                    borderRadius: 14, padding: "14px 14px 12px",
                    border: p.is_most_popular ? "1.5px solid #06B6D4" : "1px solid #E2E8F0",
                    background: p.is_most_popular ? "rgba(6,182,212,0.05)" : "#FFFFFF",
                    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                  }}
                >
                  {p.is_most_popular ? (
                    <span style={{ position: "absolute", top: -9, right: 12, fontFamily: FONT_HEAD, fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fff", background: "#06B6D4", borderRadius: 9999, padding: "2px 8px" }}>
                      Most popular
                    </span>
                  ) : null}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Zap style={{ width: 15, height: 15, color: "#06B6D4" }} />
                    <span style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 800, color: "#0F172A" }}>
                      {p.credits.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: "#94A3B8", marginTop: 1 }}>credits</div>
                  <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: "#0F172A", marginTop: 8 }}>
                    {usd(p.price_usd_cents)}
                  </div>
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14, textAlign: "center", fontFamily: FONT_BODY, fontSize: 11.5, color: "#94A3B8" }}>
            🔒 Secured by Stripe · one-time charge
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
