/**
 * Quoting domain — typed client for the quote edge functions.
 *
 * Wraps the 10 `quote-*` Supabase edge functions behind a single typed object.
 * Uses the shared `invokeEdge` helper (see `_client.ts`) so auth-header
 * threading and `{ ok: false }` error normalization live in one place.
 *
 * Server-side enforcement (org scoping, entitlements, RLS) remains the actual
 * security boundary; this layer is purely the typed transport.
 */
import { invokeEdge } from "./_client";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "approved"
  | "closed_won"
  | "closed_lost"
  | "expired";
export type QuoteMode = "ocean" | "air" | "drayage" | "ftl" | "ltl";

export interface QuoteLineItem {
  id?: string;
  type?: string;
  name: string;
  description?: string;
  unit?: string;
  quantity?: number;
  unit_cost?: number;
  unit_sell?: number;
  is_accessorial?: boolean;
  taxable?: boolean;
  sort_order?: number;
}

export interface Quote {
  id: string;
  org_id: string;
  company_id: string;
  contact_id?: string | null;
  created_by: string;
  owner_user_id?: string | null;
  quote_number: string;
  status: QuoteStatus;
  mode?: QuoteMode | null;
  service_type?: string | null;
  incoterms?: string | null;
  origin_port?: string | null;
  destination_port?: string | null;
  origin_city?: string | null;
  origin_state?: string | null;
  origin_country?: string | null;
  origin_postal?: string | null;
  destination_city?: string | null;
  destination_state?: string | null;
  destination_country?: string | null;
  destination_postal?: string | null;
  distance_miles?: number | null;
  equipment_type?: string | null;
  container_count?: number | null;
  weight_lbs?: number | null;
  commodity?: string | null;
  hs_code?: string | null;
  cargo_value?: number | null;
  currency: string;
  fuel_surcharge_pct?: number | null;
  fuel_surcharge_amount: number;
  subtotal_cost: number;
  subtotal_sell: number;
  accessorial_total: number;
  total_cost: number;
  total_sell: number;
  gross_profit: number;
  gross_margin_pct: number;
  benchmark_low?: number | null;
  benchmark_high?: number | null;
  benchmark_source?: string | null;
  benchmark_confidence?: string | null;
  revenue_opportunity?: number | null;
  revenue_opportunity_confidence?: string | null;
  pdf_signed_url?: string | null;
  pdf_expires_at?: string | null;
  pdf_storage_path?: string | null;
  share_token?: string;
  notes?: string | null;
  terms_text?: string | null;
  valid_until?: string | null;
  sent_at?: string | null;
  approved_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteListItem {
  id: string;
  quote_number: string;
  company_id: string;
  status: QuoteStatus;
  mode?: QuoteMode | null;
  service_type?: string | null;
  origin_port?: string | null;
  origin_city?: string | null;
  destination_port?: string | null;
  destination_city?: string | null;
  total_sell: number;
  gross_profit: number;
  gross_margin_pct: number;
  owner_user_id?: string | null;
  sent_at?: string | null;
  valid_until?: string | null;
  updated_at: string;
  company?: {
    id: string;
    name: string;
    domain?: string | null;
    logo_url?: string | null;
  } | null;
}

export interface DashboardMetrics {
  draft: number;
  sent: number;
  approved: number;
  won: number;
  open_pipeline: number;
  count: number;
}

export interface CompanyMetrics {
  draft: number;
  sent: number;
  approved: number;
  won: number;
  lost: number;
  win_rate: number;
  count: number;
}

export interface QuoteCreateInput {
  company_id?: string;
  source_company_key?: string;
  source?: string;
  company_name?: string;
  contact_id?: string;
  owner_user_id?: string;
  mode?: QuoteMode;
  service_type?: string;
  incoterms?: string;
  origin_port?: string;
  destination_port?: string;
  origin_city?: string;
  origin_state?: string;
  origin_country?: string;
  origin_postal?: string;
  destination_city?: string;
  destination_state?: string;
  destination_country?: string;
  destination_postal?: string;
  distance_miles?: number;
  equipment_type?: string;
  container_count?: number;
  weight_lbs?: number;
  commodity?: string;
  hs_code?: string;
  cargo_value?: number;
  currency?: string;
  fuel_surcharge_pct?: number;
  notes?: string;
  terms_text?: string;
  valid_until?: string;
  line_items?: QuoteLineItem[];
}

export interface QuoteUpdateInput extends QuoteCreateInput {
  quote_id: string;
}

/**
 * Invoke a `quote-*` edge function. Delegates to the shared `invokeEdge`
 * helper, which throws `EdgeFunctionError` on transport failures and on
 * application-level `{ ok: false }` responses.
 */
async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  return invokeEdge<T>(fn, body);
}

export const quoting = {
  create: (input: QuoteCreateInput) =>
    invoke<{ ok: true; data: { quote: Quote } }>("quote-create", { ...input }),
  update: (input: QuoteUpdateInput) =>
    invoke<{ ok: true; data: { quote: Quote } }>("quote-update", { ...input }),
  list: (filter: { status?: QuoteStatus; company_id?: string } = {}) =>
    invoke<{ ok: true; items: QuoteListItem[] }>("quote-list", { ...filter }),
  detail: (quote_id: string) =>
    invoke<{
      ok: true;
      data: { quote: Quote; line_items: QuoteLineItem[]; events: any[]; company: any };
    }>("quote-detail", { quote_id }),
  setStatus: (quote_id: string, status: QuoteStatus) =>
    invoke<{ ok: true; data: { quote: Quote } }>("quote-status-update", {
      quote_id,
      status,
    }),
  generatePdf: (quote_id: string, pdf_base64: string) =>
    invoke<{
      ok: true;
      data: { pdf_signed_url: string; pdf_expires_at: string; pdf_storage_path: string };
    }>("quote-generate-pdf", { quote_id, pdf_base64 }),
  send: (input: {
    quote_id: string;
    email_account_id?: string;
    to_email: string;
    to_name?: string;
    subject?: string;
    body?: string;
  }) =>
    invoke<{ ok: true; data: { quote: Quote; message_id: string } }>("quote-send", {
      ...input,
    }),
  dashboardMetrics: () =>
    invoke<{ ok: true; data: DashboardMetrics }>("quote-dashboard-metrics", {}),
  companyMetrics: (company_id: string) =>
    invoke<{ ok: true; data: CompanyMetrics }>("quote-company-metrics", { company_id }),
};
