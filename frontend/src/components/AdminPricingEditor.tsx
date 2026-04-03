/**
 * AdminPricingEditor — Admin-only UI to view and edit the `plans` table.
 *
 * What it does:
 *  - Loads all plans (active + inactive) from Supabase `plans` table
 *  - Lets an admin edit display fields: name, description, price_monthly, price_yearly,
 *    max_companies, max_emails, max_rfps, enrichment_enabled, campaigns_enabled, is_active
 *  - Does NOT let admins change stripe_price_id_* columns — those are Stripe-managed.
 *    Stripe price IDs must be set directly in the DB or via Stripe dashboard.
 *  - "Save All Changes" calls supabase.from('plans').update(...) for each dirty row.
 *  - Changes are immediately visible in the Billing tab because both read from `plans` table.
 *
 * Source of truth: Supabase `plans` table.
 * Billing tab must ALSO read from `plans` table (not a hardcoded getPlanMap()).
 * See SettingsPage loadBillingPlans().
 */

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AlertCircle, CheckCircle2, RefreshCw, Save } from "lucide-react";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_monthly: number | null;
  price_yearly: number | null;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  max_companies: number | null;
  max_emails: number | null;
  max_rfps: number | null;
  enrichment_enabled: boolean;
  campaigns_enabled: boolean;
  is_active: boolean;
  display_order: number;
};

type SaveState = "idle" | "saving" | "success" | "error";

export default function AdminPricingEditor() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [dirty, setDirty] = useState<Record<string, Partial<Plan>>>({});
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const loadPlans = useCallback(async () => {
    setLoading(true);
    // Admin needs to see ALL plans (active and inactive), hence no is_active filter.
    const { data, error } = await (supabase as any)
      .from("plans")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("[AdminPricingEditor] Failed to load plans:", error);
      setSaveMessage(`Failed to load plans: ${error.message}`);
      setSaveState("error");
    } else {
      setPlans((data as Plan[]) || []);
      setDirty({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const handleChange = (
    planId: string,
    field: keyof Plan,
    value: string | number | boolean | null
  ) => {
    setDirty((prev) => ({
      ...prev,
      [planId]: { ...prev[planId], [field]: value },
    }));
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, [field]: value } : p))
    );
  };

  const handleSaveAll = async () => {
    const dirtyPlanIds = Object.keys(dirty);
    if (dirtyPlanIds.length === 0) {
      setSaveState("success");
      setSaveMessage("No changes to save.");
      setTimeout(() => setSaveState("idle"), 2000);
      return;
    }

    setSaveState("saving");
    setSaveMessage("");

    const errors: string[] = [];

    for (const planId of dirtyPlanIds) {
      const changes = dirty[planId];
      // Remove Stripe price ID fields — they must not be overwritten from UI
      const safeChanges = { ...changes };
      delete (safeChanges as any).stripe_price_id_monthly;
      delete (safeChanges as any).stripe_price_id_yearly;
      delete (safeChanges as any).stripe_product_id;
      safeChanges.updated_at = new Date().toISOString() as any;

      const { error } = await (supabase as any)
        .from("plans")
        .update(safeChanges)
        .eq("id", planId);

      if (error) {
        console.error(`[AdminPricingEditor] Failed to save plan ${planId}:`, error);
        errors.push(error.message);
      }
    }

    if (errors.length > 0) {
      setSaveState("error");
      setSaveMessage(`Save failed for some plans: ${errors.join("; ")}`);
    } else {
      setSaveState("success");
      setSaveMessage(
        `Saved ${dirtyPlanIds.length} plan(s) successfully. Billing tab will reflect these values on reload.`
      );
      setDirty({});
      setTimeout(() => setSaveState("idle"), 4000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-8">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading plans…
      </div>
    );
  }

  const hasDirty = Object.keys(dirty).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Plan Configuration</h3>
          <p className="text-sm text-slate-500 mt-1">
            Edit display pricing and feature limits. Stripe price IDs are read-only
            and must be updated in the Stripe dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadPlans}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Reload
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saveState === "saving"}
            className={`px-4 py-2 rounded-lg text-sm text-white font-medium flex items-center gap-1 transition-colors ${
              hasDirty
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-slate-400 cursor-not-allowed"
            } disabled:opacity-60`}
          >
            <Save className="w-3 h-3" />
            {saveState === "saving" ? "Saving…" : "Save All Changes"}
          </button>
        </div>
      </div>

      {saveState === "success" && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {saveMessage}
        </div>
      )}
      {saveState === "error" && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {saveMessage}
        </div>
      )}

      <div className="space-y-4">
        {plans.map((plan) => {
          const isDirty = Boolean(dirty[plan.id]);
          return (
            <div
              key={plan.id}
              className={`bg-white rounded-xl border p-6 space-y-4 ${
                isDirty ? "border-blue-400 shadow-sm" : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">
                    {plan.code}
                  </span>
                  {isDirty && (
                    <span className="text-xs text-blue-600 font-medium">
                      • unsaved changes
                    </span>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={plan.is_active}
                    onChange={(e) =>
                      handleChange(plan.id, "is_active", e.target.checked)
                    }
                    className="rounded"
                  />
                  Active
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Display Name
                  </label>
                  <input
                    value={plan.name}
                    onChange={(e) => handleChange(plan.id, "name", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Description
                  </label>
                  <input
                    value={plan.description || ""}
                    onChange={(e) =>
                      handleChange(plan.id, "description", e.target.value || null)
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Monthly Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={plan.price_monthly ?? ""}
                    onChange={(e) =>
                      handleChange(
                        plan.id,
                        "price_monthly",
                        e.target.value === "" ? null : parseFloat(e.target.value)
                      )
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="e.g. 49.00"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Yearly Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={plan.price_yearly ?? ""}
                    onChange={(e) =>
                      handleChange(
                        plan.id,
                        "price_yearly",
                        e.target.value === "" ? null : parseFloat(e.target.value)
                      )
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="e.g. 490.00"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Max Companies
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={plan.max_companies ?? ""}
                    onChange={(e) =>
                      handleChange(
                        plan.id,
                        "max_companies",
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="null = unlimited"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Max Emails
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={plan.max_emails ?? ""}
                    onChange={(e) =>
                      handleChange(
                        plan.id,
                        "max_emails",
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Max RFPs
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={plan.max_rfps ?? ""}
                    onChange={(e) =>
                      handleChange(
                        plan.id,
                        "max_rfps",
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-2 pt-5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={plan.enrichment_enabled}
                      onChange={(e) =>
                        handleChange(plan.id, "enrichment_enabled", e.target.checked)
                      }
                      className="rounded"
                    />
                    Enrichment enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={plan.campaigns_enabled}
                      onChange={(e) =>
                        handleChange(plan.id, "campaigns_enabled", e.target.checked)
                      }
                      className="rounded"
                    />
                    Campaigns enabled
                  </label>
                </div>
              </div>

              {/* Read-only Stripe IDs — informational only */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                    Stripe Price ID — Monthly (read-only)
                  </label>
                  <input
                    readOnly
                    value={plan.stripe_price_id_monthly || ""}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-slate-400 cursor-not-allowed"
                    placeholder="Not set — configure in Stripe dashboard"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                    Stripe Price ID — Yearly (read-only)
                  </label>
                  <input
                    readOnly
                    value={plan.stripe_price_id_yearly || ""}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-slate-400 cursor-not-allowed"
                    placeholder="Not set — configure in Stripe dashboard"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {plans.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          No plans found in database. Run migrations to seed default plans.
        </div>
      )}
    </div>
  );
}
