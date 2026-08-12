/**
 * PublicQuotePage — the `/q/:token` LIVE quote view (digital quoting overhaul).
 *
 * PUBLIC, no login: this is where the "View live quote" button in the quote
 * email lands. It fetches `quote-view?token=<share_token>&format=json` (a
 * public, JWT-less edge function secured by the unguessable token) and renders
 * the quote read-only in the dashboard visual language (Space Grotesk display,
 * slate palette, navy/cyan brand hero).
 *
 * View tracking: the JSON fetch itself stamps `viewed_at` (first open only)
 * and flips status sent -> viewed server-side — opening this page IS the
 * funnel signal. No client-side tracking code needed.
 *
 * Data honesty: the payload is sell-side only (no cost/margin/benchmarks) —
 * the server enforces that; nothing here could leak internals even if styled.
 * PDF is a secondary "Download PDF" action, shown only when one exists.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowRight,
  FileDown,
  Loader2,
  ShieldCheck,
  Ship,
  Plane,
  Truck,
  Container,
  FileText,
} from "lucide-react";

// ── Payload types (mirror quote-view format=json) ─────────────────────────
interface PublicLineItem {
  name?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity?: number | string | null;
  unit_sell?: number | string | null;
  is_accessorial?: boolean | null;
  sort_order?: number | null;
}

interface PublicQuote {
  quote_number?: string | null;
  status?: string | null;
  mode?: string | null;
  service_type?: string | null;
  incoterms?: string | null;
  origin_port?: string | null;
  destination_port?: string | null;
  origin_city?: string | null;
  origin_state?: string | null;
  origin_country?: string | null;
  destination_city?: string | null;
  destination_state?: string | null;
  destination_country?: string | null;
  equipment_type?: string | null;
  container_count?: number | null;
  weight_lbs?: number | null;
  volume_cbm?: number | null;
  pallet_count?: number | null;
  commodity?: string | null;
  hs_code?: string | null;
  currency?: string | null;
  fuel_surcharge_pct?: number | null;
  fuel_surcharge_amount?: number | string | null;
  subtotal_sell?: number | string | null;
  accessorial_total?: number | string | null;
  total_sell?: number | string | null;
  valid_until?: string | null;
  terms_text?: string | null;
  notes?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
}

interface PublicBranding {
  company_name?: string | null;
  company_address?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
  logo_url?: string | null;
  prepared_by?: string | null;
  signature_name?: string | null;
  default_payment_terms?: string | null;
  terms_text?: string | null;
}

interface PublicPayload {
  quote: PublicQuote;
  line_items: PublicLineItem[];
  company_name: string | null;
  branding: PublicBranding;
  pdf_available: boolean;
  pdf_url: string | null;
}

// ── Formatting helpers ────────────────────────────────────────────────────
function money(value: unknown, currency = "USD"): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function fmtDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function endpoint(port?: string | null, city?: string | null, state?: string | null): string {
  if (port && port.trim()) return port.trim();
  return [city, state].map((v) => (v ? v.trim() : "")).filter(Boolean).join(", ") || "—";
}

const MODE_META: Record<string, { Icon: typeof Ship; label: string }> = {
  ocean: { Icon: Ship, label: "Ocean Freight" },
  air: { Icon: Plane, label: "Air Freight" },
  drayage: { Icon: Container, label: "Drayage" },
  ftl: { Icon: Truck, label: "Full Truckload (FTL)" },
  ltl: { Icon: Truck, label: "Less-than-Truckload (LTL)" },
};

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
    if (!base || !token) {
      setState("error");
      return;
    }
    setState("loading");
    // Plain fetch, NO auth headers: quote-view is deployed public
    // (verify_jwt off) and this very request stamps viewed_at server-side.
    fetch(`${base}/functions/v1/quote-view?token=${encodeURIComponent(token)}&format=json`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok || !body?.ok || !body?.data) {
          setState("error");
          return;
        }
        setPayload(body.data as PublicPayload);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <Shell>
        <div className="grid min-h-[50vh] place-items-center text-slate-400">
          <div className="flex items-center gap-2 text-[13px]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading quote…
          </div>
        </div>
      </Shell>
    );
  }

  if (state === "error" || !payload) {
    return (
      <Shell>
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-slate-100">
            <FileText className="h-6 w-6 text-slate-400" />
          </div>
          <h1 className="font-display text-[17px] font-bold text-slate-900">
            Quote not available
          </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            This quote link is invalid or has expired. If you received it by
            email, reply to the sender for a fresh link.
          </p>
        </div>
      </Shell>
    );
  }

  const { quote, line_items, company_name, branding, pdf_available, pdf_url } = payload;
  const currency = quote.currency || "USD";
  const origin = endpoint(quote.origin_port, quote.origin_city, quote.origin_state);
  const dest = endpoint(quote.destination_port, quote.destination_city, quote.destination_state);
  const mode = quote.mode ? MODE_META[quote.mode] : null;
  const ModeIcon = mode?.Icon;
  const validUntil = fmtDate(quote.valid_until);
  const senderName = branding.company_name || "Your logistics partner";
  const logo = branding.logo_url && /^https?:\/\//i.test(branding.logo_url) ? branding.logo_url : null;

  const items = [...(line_items ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  const shipmentFacts: Array<[string, string]> = [];
  if (mode) shipmentFacts.push(["Mode", mode.label]);
  if (quote.service_type) shipmentFacts.push(["Service", quote.service_type]);
  if (quote.incoterms) shipmentFacts.push(["Incoterms", quote.incoterms]);
  if (quote.equipment_type) shipmentFacts.push(["Equipment", quote.equipment_type]);
  if (quote.container_count) shipmentFacts.push(["Containers", String(quote.container_count)]);
  if (quote.weight_lbs) shipmentFacts.push(["Weight", `${Number(quote.weight_lbs).toLocaleString("en-US")} lbs`]);
  if (quote.volume_cbm) shipmentFacts.push(["Volume", `${quote.volume_cbm} CBM`]);
  if (quote.pallet_count) shipmentFacts.push(["Pallets", String(quote.pallet_count)]);
  if (quote.commodity) shipmentFacts.push(["Commodity", quote.commodity]);
  if (quote.hs_code) shipmentFacts.push(["HS Code", quote.hs_code]);

  const fuelAmt = Number(quote.fuel_surcharge_amount);
  const accTotal = Number(quote.accessorial_total);
  const terms = quote.terms_text || branding.terms_text || null;

  return (
    <Shell>
      <div className="mx-auto w-full max-w-[860px] px-4 py-6 sm:py-10">
        {/* Quote card */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_40px_rgba(2,6,23,0.08)]">
          {/* Hero — sender's brand on LIT navy */}
          <div className="bg-[#020617] px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                {logo && (
                  <img
                    src={logo}
                    alt={senderName}
                    className="mb-2 h-8 w-auto max-w-[200px]"
                  />
                )}
                <div className="font-display text-[19px] font-bold text-white">
                  {senderName}
                </div>
                <div className="font-display mt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#00e0ff]">
                  Freight Quotation
                </div>
              </div>
              <div className="text-right">
                {quote.quote_number && (
                  <div className="font-mono text-[14px] font-semibold text-slate-100">
                    {quote.quote_number}
                  </div>
                )}
                {validUntil && (
                  <div className="mt-1 text-[12px] text-slate-400">
                    Valid until {validUntil}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lane banner */}
          <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-display text-[17px] font-bold text-slate-900">{origin}</span>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <span className="font-display text-[17px] font-bold text-slate-900">{dest}</span>
              {mode && (
                <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600">
                  {ModeIcon && <ModeIcon className="h-3.5 w-3.5 text-slate-400" />}
                  {mode.label}
                </span>
              )}
            </div>
            {company_name && (
              <div className="mt-1.5 text-[13px] text-slate-500">
                Prepared for <span className="font-semibold text-slate-700">{company_name}</span>
              </div>
            )}
          </div>

          {/* Shipment facts */}
          {shipmentFacts.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-slate-100 px-6 py-4 sm:grid-cols-3 sm:px-8 lg:grid-cols-5">
              {shipmentFacts.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <div className="font-display text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    {label}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-semibold text-slate-800" title={value}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Charges */}
          <div className="px-6 py-5 sm:px-8">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#FAFBFC]">
                    <Th>Charge</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right">Unit</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-[12.5px] text-slate-400">
                        No line items on this quote.
                      </td>
                    </tr>
                  ) : (
                    items.map((li, i) => {
                      const qty = Number.isFinite(Number(li.quantity)) && li.quantity != null ? Number(li.quantity) : 1;
                      const unit = Number.isFinite(Number(li.unit_sell)) && li.unit_sell != null ? Number(li.unit_sell) : 0;
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-4 py-3">
                            <div className="text-[13px] font-semibold text-slate-900">
                              {(li.name ?? "Charge").toString().trim() || "Charge"}
                              {li.is_accessorial && (
                                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  Accessorial
                                </span>
                              )}
                            </div>
                            {li.description && (
                              <div className="mt-0.5 text-[11.5px] text-slate-400">{li.description}</div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-[12.5px] text-slate-600">
                            {qty.toLocaleString("en-US")}
                            {li.unit ? <span className="text-slate-400"> {li.unit}</span> : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-[12.5px] text-slate-600">
                            {money(unit, currency)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-[13px] font-semibold text-slate-900">
                            {money(qty * unit, currency)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-4 flex justify-end">
              <div className="w-full max-w-[320px] space-y-1.5">
                <TotalRow label="Subtotal" value={money(quote.subtotal_sell, currency)} />
                {Number.isFinite(fuelAmt) && fuelAmt > 0 && (
                  <TotalRow
                    label={`Fuel surcharge${quote.fuel_surcharge_pct != null ? ` (${quote.fuel_surcharge_pct}%)` : ""}`}
                    value={money(fuelAmt, currency)}
                  />
                )}
                {Number.isFinite(accTotal) && accTotal > 0 && (
                  <TotalRow label="Accessorials" value={money(accTotal, currency)} />
                )}
                <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span className="font-display text-[13px] font-bold text-slate-900">TOTAL</span>
                  <span className="font-mono text-[19px] font-bold text-blue-700">
                    {money(quote.total_sell, currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes + terms */}
          {(quote.notes || terms) && (
            <div className="space-y-4 border-t border-slate-100 px-6 py-5 sm:px-8">
              {quote.notes && (
                <div>
                  <div className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Notes
                  </div>
                  <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600">
                    {quote.notes}
                  </p>
                </div>
              )}
              {terms && (
                <div>
                  <div className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Terms &amp; Conditions
                  </div>
                  <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-slate-500">
                    {terms}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:px-8">
            <div className="flex items-center gap-2 text-[12px] text-slate-500">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 text-emerald-500" />
              <span>
                Questions? Reply to the quote email
                {branding.company_email ? (
                  <>
                    {" "}or write{" "}
                    <a
                      href={`mailto:${branding.company_email}`}
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      {branding.company_email}
                    </a>
                  </>
                ) : null}
                .
              </span>
            </div>
            {pdf_available && pdf_url && (
              <a
                href={pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display inline-flex h-9 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                <FileDown className="h-4 w-4" />
                Download PDF
              </a>
            )}
          </div>
        </div>

        {/* Sender contact + LIT credit */}
        <div className="mt-5 text-center text-[11.5px] text-slate-400">
          <div>
            {senderName}
            {branding.company_phone ? ` · ${branding.company_phone}` : ""}
            {branding.company_address ? ` · ${branding.company_address}` : ""}
          </div>
          <div className="mt-1.5">
            Digital quote powered by{" "}
            <a
              href="https://www.logisticintel.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-500 hover:text-slate-700"
            >
              Logistic Intel
            </a>
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ── Layout + table primitives ─────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-100 font-body">{children}</div>;
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={
        "font-display whitespace-nowrap px-4 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400 " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 text-[12.5px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-semibold text-slate-800">{value}</span>
    </div>
  );
}
