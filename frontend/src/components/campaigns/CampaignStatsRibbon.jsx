import React from "react";

/**
 * Outbound summary ribbon — 4 KPI cards showing real counts from the
 * loaded campaign rows. Numbers render in JetBrains Mono per the LIT
 * design tokens. No hardcoded metrics.
 */
export default function CampaignStatsRibbon({
  totalCampaigns,
  activeCampaigns,
  draftCampaigns,
  totalRecipients,
  recipientsKnown,
}) {
  const cards = [
    { label: "Total campaigns", value: totalCampaigns, accent: "indigo" },
    { label: "Active", value: activeCampaigns, accent: "emerald" },
    { label: "Drafts", value: draftCampaigns, accent: "slate" },
    {
      label: "Recipients",
      value: recipientsKnown ? totalRecipients : "—",
      accent: "cyan",
      helper: recipientsKnown ? "across all campaigns" : "No data yet",
    },
  ];

  const accentMap = {
    indigo: { border: "border-indigo-100", dot: "bg-indigo-500" },
    emerald: { border: "border-emerald-100", dot: "bg-emerald-500" },
    slate: { border: "border-slate-200", dot: "bg-slate-400" },
    cyan: { border: "border-cyan-100", dot: "bg-cyan-500" },
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const accent = accentMap[card.accent];
        return (
          <div
            key={card.label}
            className={`rounded-2xl border ${accent.border} bg-white p-4 shadow-sm transition hover:shadow-md`}
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
              {card.label}
            </div>
            <p
              className="mt-3 text-3xl font-semibold text-slate-900"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {card.value}
            </p>
            {card.helper ? (
              <p className="mt-1 text-xs text-slate-400">{card.helper}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
