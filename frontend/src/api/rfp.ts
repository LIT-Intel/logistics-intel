import { invokeEdge } from "./_client";
import type { QuoteMode, QuoteStatus } from "./quoting";

export type RfpStatus =
  | "draft"
  | "intake"
  | "pricing"
  | "review"
  | "submitted"
  | "won"
  | "lost"
  | "archived";

export type RfpMode = QuoteMode | "multimodal";

// Freight service scope for a lane — how far the rate covers the door/port chain.
export const SERVICE_TYPES: Array<{ value: string; label: string; short: string }> = [
  { value: "door_to_door", label: "Door to Door", short: "D2D" },
  { value: "port_to_port", label: "Port to Port", short: "P2P" },
  { value: "door_to_port", label: "Door to Port", short: "D2P" },
  { value: "port_to_door", label: "Port to Door", short: "P2D" },
  { value: "cy_to_cy", label: "CY to CY", short: "CY/CY" },
  { value: "ramp_to_ramp", label: "Ramp to Ramp", short: "R2R" },
];
export function serviceTypeLabel(v?: string | null): string {
  return SERVICE_TYPES.find((s) => s.value === v)?.label ?? "Door to Door";
}
export function serviceTypeShort(v?: string | null): string {
  return SERVICE_TYPES.find((s) => s.value === v)?.short ?? "D2D";
}

// ─── Rate breakdown (freight rate-sheet line items) ────────────────────────
// A lane's all-in price is built from named charges the way a forwarder quotes:
// Base Ocean Freight + surcharges (BAF, CAF, THC, GRI, PSS, Doc, ISPS …) → All-In.
// `basis` is how the charge multiplies against the shipment. Optional on a lane
// for backward compatibility — a lane with no charges falls back to sell_rate.
export type RfpChargeBasis =
  | "per_container" // × container/unit count (annual_volume is a unit count)
  | "per_kg" // × chargeable weight
  | "per_cbm" // × volume (no cbm field yet → treated per-unit, qty 1)
  | "per_shipment" // × 1 per booking
  | "flat"; // × 1 one-time

export const CHARGE_BASES: RfpChargeBasis[] = [
  "per_container",
  "per_kg",
  "per_cbm",
  "per_shipment",
  "flat",
];

export const CHARGE_BASIS_LABELS: Record<RfpChargeBasis, string> = {
  per_container: "per container",
  per_kg: "per kg",
  per_cbm: "per cbm",
  per_shipment: "per shipment",
  flat: "flat",
};

export interface RfpCharge {
  id: string;
  code: string; // "BASE", "BAF", "THC-O", "GRI", "PSS", "DOC", "ISPS" …
  name: string; // human label
  basis: RfpChargeBasis;
  amount: number; // per-unit amount in the payload currency
  currency?: string; // optional per-charge override
  notes?: string;
}

export interface RfpLane {
  id: string;
  origin: string;
  destination: string;
  mode: QuoteMode;
  /** Freight scope — one of SERVICE_TYPES (door_to_door, port_to_port, …). */
  service_type: string;
  equipment: string;
  frequency: string;
  annual_volume: number;
  weight_lbs: number;
  commodity: string;
  incoterm: string;
  transit_days: number;
  buy_rate: number;
  sell_rate: number;
  current_rate: number;
  target_rate: number;
  validity_start: string;
  validity_end: string;
  accessorials: string[];
  /** Rate-sheet line items → All-In. Optional (back-compat: falls back to sell_rate). */
  charges?: RfpCharge[];
  sort_order?: number;
}

export interface RfpPayload {
  version: 2;
  summary: {
    contact_name: string;
    contact_email: string;
    owner_name: string;
    description: string;
    service_requirements: string;
    currency: string;
    modes?: string[];
    /** Proposal narrative sections (optional → back-compat). Rendered in the PDF. */
    service_standards?: string; // KPIs / service commitments
    assumptions?: string; // inclusions / exclusions / assumptions
    terms?: string; // commercial terms & conditions
    evaluation_next_steps?: string; // award criteria / next steps
  };
  lanes: RfpLane[];
  output: Record<string, unknown>;
}

export interface RfpCompany {
  id: string;
  name: string;
  domain?: string | null;
  website?: string | null;
  logo_url?: string | null;
  city?: string | null;
  state?: string | null;
  country_code?: string | null;
  source_company_key?: string | null;
  shipments_12m?: number | null;
  teu_12m?: number | null;
  top_route_12m?: string | null;
  most_recent_shipment_date?: string | null;
}

export interface RfpRecord {
  id: string;
  org_id: string;
  user_id: string;
  rfp_number?: string | null;
  title: string;
  status: RfpStatus;
  company_id: string;
  owner_user_id?: string | null;
  due_date?: string | null;
  estimated_annual_value: number;
  primary_mode?: RfpMode | null;
  lane_count: number;
  payload: RfpPayload;
  created_at: string;
  updated_at: string;
}

export interface RfpListItem extends Omit<RfpRecord, "payload" | "org_id" | "user_id"> {
  company?: Pick<RfpCompany, "id" | "name" | "domain" | "logo_url"> | null;
  quotes: { count: number; latest_status: QuoteStatus | null; latest_revision: number };
}

export interface RfpQuoteRevision {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  total_sell: number;
  gross_profit: number;
  gross_margin_pct: number;
  revision_no: number;
  updated_at: string;
}

export interface RfpDocument {
  id: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes: number;
  document_type: string;
  created_at: string;
}

export interface RfpEvent {
  id: string;
  event_type: string;
  event_payload: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
}

export interface RfpIntelligence {
  top_lanes: Array<{
    exit_port: string;
    exit_port_country?: string | null;
    entry_port: string;
    entry_port_region?: string | null;
    shipments: number;
    weight_kg: number;
    teu: number;
    updated_at: string;
  }>;
  recent_lane_months: Array<Record<string, unknown>>;
  recent_shipments: number;
}

export interface RfpDetail {
  rfp: RfpRecord;
  company: RfpCompany | null;
  quotes: RfpQuoteRevision[];
  documents: RfpDocument[];
  events: RfpEvent[];
  intelligence: RfpIntelligence;
}

export interface RfpSaveInput {
  rfp_id?: string;
  title: string;
  company_id: string;
  status: RfpStatus;
  owner_user_id?: string;
  due_date?: string;
  payload: RfpPayload;
}

export const rfp = {
  companyContext: (companyId: string) =>
    invokeEdge<{ ok: true; data: { company: RfpCompany; suggested_lanes: Array<Partial<RfpLane>> } }>(
      "rfp-company-context",
      { company_id: companyId },
    ),
  list: (filter: { status?: RfpStatus; company_id?: string } = {}) =>
    invokeEdge<{ ok: true; items: RfpListItem[]; metrics: Record<string, number> }>("rfp-list", filter),
  detail: (rfpId: string) =>
    invokeEdge<{ ok: true; data: RfpDetail }>("rfp-detail", { rfp_id: rfpId }),
  save: (input: RfpSaveInput) =>
    invokeEdge<{ ok: true; data: { rfp: RfpRecord } }>("rfp-save", input),
  uploadDocument: async (rfpId: string, file: File, documentType = "supporting") => {
    const content_base64 = await fileToDataUri(file);
    return invokeEdge<{ ok: true; data: { document: RfpDocument } }>("rfp-document", {
      action: "upload",
      rfp_id: rfpId,
      file_name: file.name,
      mime_type: file.type,
      document_type: documentType,
      content_base64,
    });
  },
  documentUrl: (rfpId: string, documentId: string) =>
    invokeEdge<{ ok: true; data: { signed_url: string } }>("rfp-document", {
      action: "signed_url",
      rfp_id: rfpId,
      document_id: documentId,
    }),
};

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function emptyLane(): RfpLane {
  return {
    id: crypto.randomUUID(),
    origin: "",
    destination: "",
    mode: "ocean",
    service_type: "door_to_door",
    equipment: "40HC",
    frequency: "monthly",
    annual_volume: 0,
    weight_lbs: 0,
    commodity: "",
    incoterm: "",
    transit_days: 0,
    buy_rate: 0,
    sell_rate: 0,
    current_rate: 0,
    target_rate: 0,
    validity_start: "",
    validity_end: "",
    accessorials: [],
  };
}

export function emptyPayload(): RfpPayload {
  return {
    version: 2,
    summary: {
      contact_name: "",
      contact_email: "",
      owner_name: "",
      description: "",
      service_requirements: "",
      currency: "USD",
    },
    lanes: [emptyLane()],
    output: {},
  };
}

// ─── Rate breakdown factories + all-in math ────────────────────────────────
export function emptyCharge(overrides: Partial<RfpCharge> = {}): RfpCharge {
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    basis: "per_container",
    amount: 0,
    ...overrides,
  };
}

/**
 * Standard ocean FCL rate breakdown seed. Values mirror lib/rfp/templates.ts
 * OCEAN_FCL and are a starting point the user edits per lane.
 */
export function defaultOceanCharges(): RfpCharge[] {
  return [
    emptyCharge({ code: "BASE", name: "Ocean Freight (Base)", basis: "per_container", amount: 2500 }),
    emptyCharge({ code: "BAF", name: "Bunker Adjustment Factor", basis: "per_container", amount: 200 }),
    emptyCharge({ code: "LSS", name: "Low Sulphur Surcharge", basis: "per_container", amount: 50 }),
    emptyCharge({ code: "THC-O", name: "Terminal Handling (Origin)", basis: "per_container", amount: 150 }),
    emptyCharge({ code: "THC-D", name: "Terminal Handling (Destination)", basis: "per_container", amount: 200 }),
    emptyCharge({ code: "DOC", name: "Documentation", basis: "per_shipment", amount: 45 }),
  ];
}

const LBS_PER_KG = 2.2046226218;

/** Per-unit multiplier a charge applies against for a lane's all-in unit price. */
function chargeQty(basis: RfpChargeBasis, lane: Pick<RfpLane, "weight_lbs">): number {
  switch (basis) {
    case "per_kg":
      return Math.max(0, (Number(lane.weight_lbs) || 0) / LBS_PER_KG);
    // per_cbm has no volume field yet → per-unit; per_container/per_shipment/flat
    // already express a per-unit amount.
    default:
      return 1;
  }
}

/**
 * All-in unit price for a lane (per container / shipment). Sums the charge line
 * items; if the lane has no charges, falls back to sell_rate (then target_rate)
 * so legacy lanes keep working.
 */
export function computeLaneAllIn(lane: RfpLane): number {
  if (lane.charges && lane.charges.length) {
    return lane.charges.reduce(
      (sum, c) => sum + (Number(c.amount) || 0) * chargeQty(c.basis, lane),
      0,
    );
  }
  return Number(lane.sell_rate) || Number(lane.target_rate) || 0;
}

/** Annualized all-in value for a lane (unit all-in × annual volume). */
export function computeLaneAnnual(lane: RfpLane): number {
  return computeLaneAllIn(lane) * (Number(lane.annual_volume) || 0);
}
