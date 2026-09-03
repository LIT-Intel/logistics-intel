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

export const RFP_CHARGE_BASES = [
  "per_container",
  "per_kg",
  "per_cbm",
  "per_shipment",
  "flat",
] as const;

const LBS_PER_KG = 2.2046226218;

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
          // service_type drives the PDF "Service: …" label; was previously dropped
          // on save (always defaulted). Persist it. Default door_to_door.
          service_type: cleanText(lane.service_type, 40) || "door_to_door",
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
          // Rate-sheet line items → All-In. Undefined when absent so legacy lanes
          // stay clean (JSONB drops undefined keys).
          charges: Array.isArray(lane.charges)
            ? lane.charges.slice(0, 40).map((c) => {
                const ch = c && typeof c === "object" ? c as Record<string, unknown> : {};
                const basis = cleanText(ch.basis, 20);
                return {
                  id: cleanText(ch.id, 80) || crypto.randomUUID(),
                  code: cleanText(ch.code, 24),
                  name: cleanText(ch.name, 120),
                  basis: RFP_CHARGE_BASES.includes(basis as typeof RFP_CHARGE_BASES[number])
                    ? basis
                    : "per_container",
                  amount: Math.max(0, finiteNumber(ch.amount)),
                  currency: cleanText(ch.currency, 3).toUpperCase() || undefined,
                  notes: cleanText(ch.notes, 200) || undefined,
                };
              })
            : undefined,
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
      // Proposal narrative sections (optional). cleanText → "" when absent.
      service_standards: cleanText(rawSummary.service_standards, 4000),
      assumptions: cleanText(rawSummary.assumptions, 4000),
      terms: cleanText(rawSummary.terms, 4000),
      evaluation_next_steps: cleanText(rawSummary.evaluation_next_steps, 4000),
    },
    lanes,
    output: source.output && typeof source.output === "object" ? source.output : {},
  };
}

export function summarizePayload(payload: ReturnType<typeof normalizePayload>) {
  const laneAllIn = (lane: (typeof payload.lanes)[number]): number => {
    if (Array.isArray(lane.charges) && lane.charges.length) {
      return lane.charges.reduce(
        (s, c) =>
          s + c.amount * (c.basis === "per_kg" ? Math.max(0, lane.weight_lbs / LBS_PER_KG) : 1),
        0,
      );
    }
    return lane.sell_rate || lane.target_rate || 0;
  };
  const annualValue = payload.lanes.reduce(
    (sum, lane) => sum + laneAllIn(lane) * lane.annual_volume,
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
