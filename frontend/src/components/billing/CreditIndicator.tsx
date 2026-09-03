"use client";

import React from "react";
import { Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEntitlements } from "@/hooks/useEntitlements";

/**
 * Compact ⚡ LIT Credits balance chip for the app header (§33). Click → the
 * Credit Usage page (balance, breakdown, purchase). Enterprise shows
 * "Unlimited". Renders nothing until the server emits credit_balance (older
 * get-entitlements versions), so it's a safe drop-in that lights up once the
 * Credits v2 engine snapshot ships.
 *
 * Restrained by design — a low-key status chip, not an aggressive upsell.
 */
export default function CreditIndicator({ className = "" }: { className?: string }) {
  const { creditBalance } = useEntitlements();
  const navigate = useNavigate();

  if (!creditBalance) return null;

  const unlimited = Boolean(creditBalance.unlimited);
  const total = creditBalance.total_remaining ?? 0;
  const low = !unlimited && total <= 25;

  const tone = low
    ? { border: "#FCA5A5", bg: "#FEF2F2", text: "#B91C1C", icon: "#EF4444" }
    : { border: "#E2E8F0", bg: "#FFFFFF", text: "#0F172A", icon: "#06B6D4" };

  return (
    <button
      type="button"
      onClick={() => navigate("/app/billing/credits")}
      title={unlimited ? "Unlimited usage" : "LIT Credits — view usage & add more"}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 34,
        padding: "0 11px",
        borderRadius: 9999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        cursor: "pointer",
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 12.5,
        fontWeight: 700,
        color: tone.text,
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      <Zap style={{ width: 14, height: 14, color: tone.icon }} />
      {unlimited ? (
        <span>Unlimited</span>
      ) : (
        <span>
          {total.toLocaleString()} <span style={{ fontWeight: 500, color: "#94A3B8" }}>credits</span>
        </span>
      )}
    </button>
  );
}
