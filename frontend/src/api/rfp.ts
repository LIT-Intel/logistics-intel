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

export interface RfpLane {
  id: string;
  origin: string;
  destination: string;
  mode: QuoteMode;
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
