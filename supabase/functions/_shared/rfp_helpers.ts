import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export const RFP_STATUSES = [
  "draft",
  "intake",
  "pricing",
  "review",
  "submitted",
  "won",
  "lost",
  "archived",
] as const;

export const RFP_MODES = ["ocean", "air", "drayage", "ftl", "ltl", "multimodal"] as const;

export type RfpStatus = (typeof RFP_STATUSES)[number];

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function cleanText(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function finiteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizePayload(raw: unknown) {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawSummary = source.summary && typeof source.summary === "object"
    ? source.summary as Record<string, unknown>
    : {};
  const lanes = Array.isArray(source.lanes)
    ? source.lanes.slice(0, 500).map((item, index) => {
        const lane = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const mode = cleanText(lane.mode, 20).toLowerCase();
        return {
          id: cleanText(lane.id, 80) || crypto.randomUUID(),
          origin: cleanText(lane.origin, 160),
          destination: cleanText(lane.destination, 160),
          mode: RFP_MODES.includes(mode as typeof RFP_MODES[number]) ? mode : "ocean",
          equipment: cleanText(lane.equipment, 80),
          frequency: cleanText(lane.frequency, 40),
          annual_volume: Math.max(0, finiteNumber(lane.annual_volume)),
          weight_lbs: Math.max(0, finiteNumber(lane.weight_lbs)),
          commodity: cleanText(lane.commodity, 160),
          incoterm: cleanText(lane.incoterm, 30).toUpperCase(),
          transit_days: Math.max(0, finiteNumber(lane.transit_days)),
          buy_rate: Math.max(0, finiteNumber(lane.buy_rate)),
          sell_rate: Math.max(0, finiteNumber(lane.sell_rate)),
          current_rate: Math.max(0, finiteNumber(lane.current_rate)),
          target_rate: Math.max(0, finiteNumber(lane.target_rate)),
          validity_start: cleanText(lane.validity_start, 20),
          validity_end: cleanText(lane.validity_end, 20),
          accessorials: Array.isArray(lane.accessorials)
            ? lane.accessorials.slice(0, 30).map((v) => cleanText(v, 120)).filter(Boolean)
            : [],
          sort_order: index,
        };
      })
    : [];

  const modes = [...new Set(lanes.map((lane) => lane.mode))];
  return {
    version: 2,
    summary: {
      contact_name: cleanText(rawSummary.contact_name, 120),
      contact_email: cleanText(rawSummary.contact_email, 200),
      owner_name: cleanText(rawSummary.owner_name, 120),
      description: cleanText(rawSummary.description, 3000),
      service_requirements: cleanText(rawSummary.service_requirements, 4000),
      currency: cleanText(rawSummary.currency, 3).toUpperCase() || "USD",
      modes,
    },
    lanes,
    output: source.output && typeof source.output === "object" ? source.output : {},
  };
}

export function summarizePayload(payload: ReturnType<typeof normalizePayload>) {
  const annualValue = payload.lanes.reduce(
    (sum, lane) => sum + lane.sell_rate * lane.annual_volume,
    0,
  );
  const modeSet = [...new Set(payload.lanes.map((lane) => lane.mode).filter(Boolean))];
  return {
    laneCount: payload.lanes.length,
    estimatedAnnualValue: Number(annualValue.toFixed(2)),
    primaryMode: modeSet.length > 1 ? "multimodal" : modeSet[0] ?? null,
  };
}

export async function assertOrgRfp(
  admin: SupabaseClient,
  orgId: string,
  rfpId: string,
) {
  const { data, error } = await admin
    .from("lit_rfps")
    .select("*")
    .eq("id", rfpId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
