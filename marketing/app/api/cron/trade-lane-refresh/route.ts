import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agents/runner";
import { sanityWriteClient } from "@/sanity/lib/client";
import { getSupabase, hasSupabase } from "@/lib/supabase";
import { topShippers, carrierMix, monthlyTrend, laneKpis } from "@/lib/programmatic/stats";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * TradeLane Refresher — runs daily.
 *
 * For every tradeLane document in Sanity, query the live shipment graph
 * for that origin → destination pair, recompute KPIs / top shippers /
 * carrier mix / monthly trend, and patch the Sanity doc. The marketing
 * /lanes/[slug] page reads from Sanity, so this keeps it fresh.
 *
 * No-ops gracefully if Supabase env not set.
 */
export async function GET(req: NextRequest) {
  return runAgent("trade-lane-refresh", req, async () => {
    if (!hasSupabase()) {
      return { skipped: 1, notes: ["SUPABASE_URL + key not set — agent skipped."] };
    }
    const sb = getSupabase()!;
    const lanes = await sanityWriteClient.fetch<any[]>(
      `*[_type == "tradeLane" && defined(originPort.code) && defined(destinationPort.code)]{
        _id, originPort, destinationPort
      }`,
    );
    let written = 0;
    const notes: string[] = [];
    for (const lane of lanes) {
      const since = new Date();
      since.setMonth(since.getMonth() - 24);
      const { data, error } = await sb
        .from("lit_company_search_results")
        .select(
          "shipper_name, shipper_domain, shipper_industry, origin_port, destination_port, carrier, scac, hs_code, arrival_date, teu, shipment_count",
        )
        .eq("origin_port", lane.originPort.code)
        .eq("destination_port", lane.destinationPort.code)
        .gte("arrival_date", since.toISOString().slice(0, 10))
        .limit(5000);
      if (error) {
        notes.push(`${lane.originPort.code}→${lane.destinationPort.code}: ${error.message}`);
        continue;
      }
      const rows = data || [];
      if (!rows.length) continue;
      await sanityWriteClient
        .patch(lane._id)
        .set({
          kpis: laneKpis(rows),
          topShippers: topShippers(rows, 25),
          carrierMix: carrierMix(rows),
          monthlyTrend: monthlyTrend(rows, 12),
          lastRefreshedAt: new Date().toISOString(),
        })
        .commit();
      written++;
    }
    return { scanned: lanes.length, written, notes };
  });
}
