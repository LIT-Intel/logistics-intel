"use client";

import React, { useState } from "react";
import { Zap, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEntitlements } from "@/hooks/useEntitlements";
import PurchaseCreditsModal from "@/components/billing/PurchaseCreditsModal";

/**
 * "LIT Credits" card for the Billing page. Shows the workspace balance
 * (included + purchased) with links to the full Credit Usage page and the
 * Purchase Credits flow. Renders nothing until the server emits credit_balance
 * (Credits v2), so it's a safe additive drop-in on the existing Billing page.
 */
export default function BillingCreditsCard() {
  const { creditBalance } = useEntitlements();
  const navigate = useNavigate();
  const [showPurchase, setShowPurchase] = useState(false);

  if (!creditBalance) return null;

  const unlimited = Boolean(creditBalance.unlimited);
  const total = creditBalance.total_remaining ?? 0;
  const includedRemaining = creditBalance.included_remaining ?? 0;
  const includedQuota = creditBalance.included_quota ?? 0;
  const purchased = creditBalance.purchased_remaining ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(6,182,212,0.1)" }}>
            <Zap className="h-5 w-5" style={{ color: "#06B6D4" }} />
          </div>
          <div>
            <div className="font-display text-[13px] font-semibold text-slate-900">LIT Credits</div>
            <div className="font-display mt-0.5 text-[26px] font-bold leading-none text-slate-900">
              {unlimited ? "Unlimited" : total.toLocaleString()}
              {!unlimited ? <span className="ml-1.5 text-[13px] font-medium text-slate-400">available</span> : null}
            </div>
            {!unlimited ? (
              <div className="font-body mt-1.5 text-[12px] text-slate-500">
                {includedRemaining.toLocaleString()} of {includedQuota.toLocaleString()} monthly
                {purchased > 0 ? ` · ${purchased.toLocaleString()} purchased` : ""}
              </div>
            ) : (
              <div className="font-body mt-1.5 text-[12px] text-slate-500">Enterprise — unlimited customer usage</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/app/billing/credits")}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            View usage <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {!unlimited ? (
            <button
              type="button"
              onClick={() => setShowPurchase(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-slate-800"
            >
              <Zap className="h-3.5 w-3.5 text-cyan-300" /> Purchase Credits
            </button>
          ) : null}
        </div>
      </div>

      {showPurchase ? <PurchaseCreditsModal onClose={() => setShowPurchase(false)} /> : null}
    </div>
  );
}
