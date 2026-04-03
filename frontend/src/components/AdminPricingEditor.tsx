import React, { useState } from "react";
import { DollarSign, Save, AlertCircle } from "lucide-react";

export type PlanConfig = {
  code: string;
  name: string;
  price: string;
  max_companies: number | Infinity;
  max_emails: number | Infinity;
  max_rfps: number | Infinity;
  enrichment_enabled: boolean;
  campaigns_enabled: boolean;
};

interface AdminPricingEditorProps {
  plans: Record<string, PlanConfig>;
  onSave: (plans: Record<string, PlanConfig>) => Promise<void>;
  isLoading?: boolean;
}

export default function AdminPricingEditor({
  plans: initialPlans,
  onSave,
  isLoading = false,
}: AdminPricingEditorProps) {
  const [plans, setPlans] = useState<Record<string, PlanConfig>>(initialPlans);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    kind: "idle" | "success" | "error";
    message: string;
  }>({ kind: "idle", message: "" });
  const [isSaving, setIsSaving] = useState(false);

  const handlePlanChange = (planCode: string, field: string, value: any) => {
    setPlans((prev) => ({
      ...prev,
      [planCode]: {
        ...prev[planCode],
        [field]: value,
      },
    }));
  };

  const handleSavePricing = async () => {
    setIsSaving(true);
    setSaveStatus({ kind: "idle", message: "" });
    try {
      await onSave(plans);
      setSaveStatus({
        kind: "success",
        message: "Pricing updated successfully",
      });
      setEditingPlan(null);
    } catch (error) {
      console.error("[AdminPricingEditor] Save failed:", error);
      setSaveStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to save pricing",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <DollarSign className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-slate-900">Edit Pricing Plans</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(plans).map(([planCode, plan]) => (
          <div
            key={planCode}
            className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-slate-900">
                {plan.name}
              </h4>
              <button
                onClick={() =>
                  setEditingPlan(editingPlan === planCode ? null : planCode)
                }
                className="px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                {editingPlan === planCode ? "Done" : "Edit"}
              </button>
            </div>

            {editingPlan === planCode ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={plan.name}
                    onChange={(e) =>
                      handlePlanChange(planCode, "name", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price per Month
                  </label>
                  <input
                    type="text"
                    value={plan.price}
                    onChange={(e) =>
                      handlePlanChange(planCode, "price", e.target.value)
                    }
                    placeholder="$49"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Companies
                  </label>
                  <input
                    type="text"
                    value={
                      plan.max_companies === Infinity
                        ? "Unlimited"
                        : plan.max_companies
                    }
                    onChange={(e) =>
                      handlePlanChange(
                        planCode,
                        "max_companies",
                        e.target.value === "Unlimited"
                          ? Infinity
                          : parseInt(e.target.value) || 0
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Emails
                  </label>
                  <input
                    type="text"
                    value={
                      plan.max_emails === Infinity
                        ? "Unlimited"
                        : plan.max_emails
                    }
                    onChange={(e) =>
                      handlePlanChange(
                        planCode,
                        "max_emails",
                        e.target.value === "Unlimited"
                          ? Infinity
                          : parseInt(e.target.value) || 0
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max RFPs
                  </label>
                  <input
                    type="text"
                    value={
                      plan.max_rfps === Infinity ? "Unlimited" : plan.max_rfps
                    }
                    onChange={(e) =>
                      handlePlanChange(
                        planCode,
                        "max_rfps",
                        e.target.value === "Unlimited"
                          ? Infinity
                          : parseInt(e.target.value) || 0
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={plan.enrichment_enabled}
                      onChange={(e) =>
                        handlePlanChange(
                          planCode,
                          "enrichment_enabled",
                          e.target.checked
                        )
                      }
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">
                      Enrichment Enabled
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={plan.campaigns_enabled}
                      onChange={(e) =>
                        handlePlanChange(
                          planCode,
                          "campaigns_enabled",
                          e.target.checked
                        )
                      }
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">
                      Campaigns Enabled
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Price:</span>
                  <span className="font-semibold text-slate-900">
                    {plan.price}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Companies:</span>
                  <span className="font-semibold text-slate-900">
                    {plan.max_companies === Infinity
                      ? "Unlimited"
                      : plan.max_companies}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Emails:</span>
                  <span className="font-semibold text-slate-900">
                    {plan.max_emails === Infinity
                      ? "Unlimited"
                      : plan.max_emails}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">RFPs:</span>
                  <span className="font-semibold text-slate-900">
                    {plan.max_rfps === Infinity ? "Unlimited" : plan.max_rfps}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Enrichment:</span>
                  <span className="font-semibold text-slate-900">
                    {plan.enrichment_enabled ? "✓" : "✗"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Campaigns:</span>
                  <span className="font-semibold text-slate-900">
                    {plan.campaigns_enabled ? "✓" : "✗"}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {saveStatus.kind !== "idle" && (
        <div
          className={`p-4 rounded-lg border flex items-start gap-3 ${
            saveStatus.kind === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{saveStatus.message}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSavePricing}
          disabled={isSaving || isLoading}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Saving..." : "Save All Changes"}
        </button>
      </div>
    </div>
  );
}
