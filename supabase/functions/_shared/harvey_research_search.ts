import { executeForwarderDirectorySearch } from "./harvey_forwarder_search.ts";

/**
 * First evidence-backed Harvey research result contract.
 * Only the historical provider-directory tool is currently eligible.
 * Complex air, lane, period and TEU questions must not fall back to a
 * client-side sample or a plausible-looking unverified ranking.
 */
function buildGroundedNarrative(rows: Array<{company_name?: string | null; vertical?: string | null}>, provider: string, state: string | null, hasMore: boolean) {
  const location = state ? ` in ${state}` : " across the available directory";
  const count = rows.length;
  const verticalCounts = new Map<string, number>();
  for (const row of rows) {
    const category = String(row.vertical || "").trim();
    if (category && category.toLowerCase() !== "undefined") {
      verticalCounts.set(category, (verticalCounts.get(category) ?? 0) + 1);
    }
  }
  const grouped = [...verticalCounts.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  const segment = grouped.length
    ? `Among the returned records, the most common listed sectors are ${grouped.slice(0,3).map(([name,n])=>`${name} (${n})`).join(", ")}.`
    : "The available records do not contain reliable industry classifications, so I cannot segment them yet.";
  const limit = hasMore ? "This is a partial page, not the full number of matches." : "This is the returned page; I have not independently verified a total-market count.";
  return `I found ${count} companies${location} whose historical directory records reference ${provider}. ${segment} ${limit} These associations are not proof that the company currently uses this provider, or of specific lanes or shipment volumes. I'd start by opening the profiles of companies in the sectors most relevant to your sales targets, then verify their shipment records and decision makers before prioritizing outreach.`;
}

export async function executeHarveyResearchSearch(userClient: any, question: unknown) {
  if (typeof question !== "string" || !question.trim() || question.length > 1500) {
    return { ok: false, error: "invalid_question", clarification: "Enter a research question of up to 1,500 characters." };
  }
  const directory = await executeForwarderDirectorySearch(userClient, question);
  if (!directory.ok) {
    return {
      ok: false,
      error: directory.error,
      clarification: directory.clarification ??
        "This search needs verified freight analytics that are not enabled yet. Try a historical DSV, Expeditors, or Kuehne+Nagel company search.",
      supported_scope: "historical_company_provider_directory",
      safe_alternatives: [
        "Find 25 Georgia companies using DSV; exclude freight forwarders",
        "Show 25 companies in Texas using Expeditors",
      ],
    };
  }

  const rows = directory.rows ?? [];
  const count = typeof directory.count === "number" ? directory.count : null;
  const plan = directory.plan;
  return {
    ok: true,
    version: "harvey_research_search_v1",
    mode: "historical_provider_directory",
    plan,
    result_set_id: null, // A persisted server-side result set is NOT implemented.
    result_count: count,
    result_count_status: count === null ? "not_computed" : "exact",
    returned: rows.length,
    truncated: Boolean(directory.truncated),
    rows,
    next_cursor: null, // No cursor: do not promise pagination beyond the returned page.
    summary: {
      title: "Historical provider relationships",
      explanation: buildGroundedNarrative(rows, plan.providerName, plan.state, Boolean(directory.truncated)),
      caveats: [
        "Provider association applies to a historical, company-wide directory record, not a confirmed current incumbent.",
        "No specific lane, air waybill, booking period, shipment volume or TEU ranking was verified.",
        "List and map may only display the rows returned here; a truncated response is not a complete ranking.",
      ],
    },
    evidence: {
      dataset: directory.source,
      provenance: directory.provenance,
      metric_scope: "historical_company_wide",
      transport_mode: "unverified",
      reporting_window: null,
      quality_status: "historical_provider_label_only",
      qualification: directory.quality_notice,
    },
    suggestions: [
      "Open a company profile to inspect available source records",
      "Refine to one supported provider and an available state",
      "Select accounts for a source-qualified sales review",
    ],
    read_only: true,
    crm_actions_executed: false,
  };
}
