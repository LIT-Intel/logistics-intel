import React, { useEffect, useMemo, useState } from "react";
import { Zap, ChevronDown } from "lucide-react";
import { fetchCreditCostMatrix, type CreditCost } from "@/api/entitlements";

// Friendly section titles for the raw category keys in lit_credit_feature_costs.
const CATEGORY_LABELS: Record<string, string> = {
  discovery: "Discovery",
  contact: "Contacts",
  company: "Company intelligence",
  pulse: "Pulse",
  intelligence: "Intelligence",
  harvey: "Harvey (AI SDR)",
  benchmark: "Benchmarks",
  tariff: "Tariffs & API",
  exports: "Exports",
  other: "Other",
};
const CATEGORY_ORDER = [
  "discovery", "company", "contact", "intelligence", "pulse", "harvey", "benchmark", "tariff", "exports", "other",
];

/**
 * "How LIT Credits are used" — a plain-language guide to what each billable
 * action costs, grouped by category. Reads the live cost matrix so it never
 * drifts from what the engine actually charges. Collapsible; starts open on the
 * Credit Usage page and can be embedded compactly elsewhere.
 */
export default function CreditCostGuide({
  defaultOpen = true,
  compact = false,
}: {
  defaultOpen?: boolean;
  compact?: boolean;
}) {
  const [costs, setCosts] = useState<CreditCost[] | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    let alive = true;
    fetchCreditCostMatrix().then((c) => {
      if (alive) setCosts(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const byCat = new Map<string, CreditCost[]>();
    (costs ?? []).forEach((c) => {
      const k = c.category || "other";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(c);
    });
    return CATEGORY_ORDER.filter((k) => byCat.has(k)).map((k) => ({
      key: k,
      label: CATEGORY_LABELS[k] || k,
      items: byCat.get(k)!.sort((a, b) => a.credits - b.credits),
    }));
  }, [costs]);

  if (costs !== null && costs.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-cyan-500" />
          <span className="font-display text-[13.5px] font-semibold text-slate-800">How LIT Credits are used</span>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="font-body mb-3 text-[12px] leading-relaxed text-slate-500">
            One shared balance of LIT Credits is spent across the product. Discovery and
            campaign emails are the lightest actions; deep enrichment and AI briefs cost more.
            Re-opening something you've already unlocked is always free.
          </p>
          <div className={compact ? "space-y-3" : "grid gap-x-6 gap-y-3 sm:grid-cols-2"}>
            {groups.map((g) => (
              <div key={g.key}>
                <div className="font-display mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                  {g.label}
                </div>
                <div className="divide-y divide-slate-50">
                  {g.items.map((it) => (
                    <div key={it.feature_key} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="font-body text-[12.5px] text-slate-700">{it.label}</span>
                      <span className="font-mono inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11.5px] font-semibold text-slate-600">
                        <Zap size={10} className="text-cyan-500" />
                        {it.credits}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
