/**
 * QuoteBuilder — the `/app/quoting/new` and `/app/quoting/:quoteId` page.
 *
 * Self-contained, default-exported component. Routes are wired in a later task;
 * this component reads `:quoteId` (edit) and `?company_id=` (new-from-profile)
 * itself via react-router.
 *
 * Layout mirrors the design reference (designs/quoting-20260624/quote-builder.html):
 *   - sticky action header (back, title, status pill, Save/Generate PDF/Send)
 *   - two-column grid: left = collapsible form sections, right = sticky summary
 *
 * Data honesty: live totals are a LOCAL preview (`computeTotals`); the server is
 * authoritative and its returned numbers replace the preview after each save.
 * Generate PDF / Send are rendered but inert here — wired in Task 15.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  FileDown,
  Send,
  CheckCircle2,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEntitlements } from "@/hooks/useEntitlements";

import {
  quoting,
  type Quote,
  type QuoteLineItem,
  type QuoteMode,
  type QuoteStatus,
  type QuoteCreateInput,
} from "@/api/quoting";
import { computeTotals, type QuoteTotals } from "@/lib/quoting/totals";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { QuoteStatusPill } from "@/features/quoting/components/QuoteStatusPill";
import QuoteCompanySelector, {
  type AttachedCompany,
} from "@/features/quoting/components/QuoteCompanySelector";
import QuoteLaneShipmentForm, {
  type LaneFields,
} from "@/features/quoting/components/QuoteLaneShipmentForm";
import QuoteLineItemsTable from "@/features/quoting/components/QuoteLineItemsTable";
import QuoteTotalsPanel from "@/features/quoting/components/QuoteTotalsPanel";
import QuoteBenchmarkPanel from "@/features/quoting/components/QuoteBenchmarkPanel";
import QuoteRevenueOpportunityPanel from "@/features/quoting/components/QuoteRevenueOpportunityPanel";
import QuotePdfPreview from "@/features/quoting/components/QuotePdfPreview";
import QuoteSendBox from "@/features/quoting/components/QuoteSendBox";
import { exportQuotePdf } from "@/lib/quoting/exportQuotePdf";

/**
 * Editable builder state. Keyed to QuoteCreateInput fields plus the line items
 * the table maintains. `company_id` is required by the server on create.
 */
/** True for a canonical lit_companies UUID; false for an ImportYeti slug. */
const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

interface BuilderState {
  company_id?: string;
  source_company_key?: string;
  contact_id?: string;
  mode: QuoteMode;
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
  currency: string;
  fuel_surcharge_pct?: number;
  notes?: string;
  terms_text?: string;
  valid_until?: string;
  line_items: QuoteLineItem[];
}

type Action =
  | { type: "patch"; patch: Partial<BuilderState> }
  | { type: "setLineItems"; items: QuoteLineItem[] }
  | { type: "hydrate"; quote: Quote; line_items: QuoteLineItem[] };

function initialState(companyKey?: string): BuilderState {
  // TODO: prefill from org_settings.quote_defaults once an endpoint exists.
  // `?company_id=` from a saved-company launch is normally an internal UUID, but
  // guard against a slug sneaking in by routing non-UUIDs to source_company_key.
  return {
    company_id: isUuid(companyKey) ? companyKey : undefined,
    source_company_key: companyKey && !isUuid(companyKey) ? companyKey : undefined,
    mode: "ocean",
    currency: "USD",
    fuel_surcharge_pct: undefined,
    line_items: [],
  };
}

function reducer(state: BuilderState, action: Action): BuilderState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "setLineItems":
      return { ...state, line_items: action.items };
    case "hydrate": {
      const q = action.quote;
      return {
        company_id: q.company_id,
        source_company_key: undefined,
        contact_id: q.contact_id ?? undefined,
        mode: (q.mode ?? "ocean") as QuoteMode,
        service_type: q.service_type ?? undefined,
        incoterms: q.incoterms ?? undefined,
        origin_port: q.origin_port ?? undefined,
        destination_port: q.destination_port ?? undefined,
        origin_city: q.origin_city ?? undefined,
        origin_state: q.origin_state ?? undefined,
        origin_country: q.origin_country ?? undefined,
        origin_postal: q.origin_postal ?? undefined,
        destination_city: q.destination_city ?? undefined,
        destination_state: q.destination_state ?? undefined,
        destination_country: q.destination_country ?? undefined,
        destination_postal: q.destination_postal ?? undefined,
        distance_miles: q.distance_miles ?? undefined,
        equipment_type: q.equipment_type ?? undefined,
        container_count: q.container_count ?? undefined,
        weight_lbs: q.weight_lbs ?? undefined,
        commodity: q.commodity ?? undefined,
        hs_code: q.hs_code ?? undefined,
        cargo_value: q.cargo_value ?? undefined,
        currency: q.currency ?? "USD",
        fuel_surcharge_pct: q.fuel_surcharge_pct ?? undefined,
        notes: q.notes ?? undefined,
        terms_text: q.terms_text ?? undefined,
        valid_until: q.valid_until ?? undefined,
        line_items: action.line_items ?? [],
      };
    }
    default:
      return state;
  }
}

/** Strip the editable state down to the create/update input the edge fn wants. */
function toInput(state: BuilderState): QuoteCreateInput {
  return {
    // Send both — the server resolves source_company_key → a real company UUID
    // when company_id is absent (or a non-UUID slug slips through).
    company_id: state.company_id,
    source_company_key: state.source_company_key,
    contact_id: state.contact_id,
    mode: state.mode,
    service_type: state.service_type,
    incoterms: state.incoterms,
    origin_port: state.origin_port,
    destination_port: state.destination_port,
    origin_city: state.origin_city,
    origin_state: state.origin_state,
    origin_country: state.origin_country,
    origin_postal: state.origin_postal,
    destination_city: state.destination_city,
    destination_state: state.destination_state,
    destination_country: state.destination_country,
    destination_postal: state.destination_postal,
    distance_miles: state.distance_miles,
    equipment_type: state.equipment_type,
    container_count: state.container_count,
    weight_lbs: state.weight_lbs,
    commodity: state.commodity,
    hs_code: state.hs_code,
    cargo_value: state.cargo_value,
    currency: state.currency,
    fuel_surcharge_pct: state.fuel_surcharge_pct,
    notes: state.notes,
    terms_text: state.terms_text,
    valid_until: state.valid_until,
    line_items: state.line_items,
  };
}

function laneSummary(s: BuilderState): string {
  const origin = s.origin_port || s.origin_city;
  const dest = s.destination_port || s.destination_city;
  const parts: string[] = [];
  if (origin || dest) parts.push(`${origin ?? "—"} → ${dest ?? "—"}`);
  if (s.service_type) parts.push(s.service_type);
  return parts.join(" · ");
}

export default function QuoteBuilder() {
  const navigate = useNavigate();
  const { entitlements, isAdmin } = useEntitlements();
  // Gate persist/PDF/send ONLY when the server explicitly disables quoting.
  // Viewing/editing the form stays open; the server re-checks on every write.
  const quotingLocked = !isAdmin && entitlements?.features?.quoting === false;
  const { quoteId } = useParams<{ quoteId: string }>();
  const [searchParams] = useSearchParams();
  const companyIdParam = searchParams.get("company_id") ?? undefined;

  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(companyIdParam),
  );
  const [company, setCompany] = useState<AttachedCompany | null>(
    companyIdParam
      ? isUuid(companyIdParam)
        ? { company_id: companyIdParam, company_name: "Company" }
        : { source_company_key: companyIdParam, company_name: "Company" }
      : null,
  );

  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
  const [status, setStatus] = useState<QuoteStatus>("draft");
  const [serverTotals, setServerTotals] = useState<QuoteTotals | null>(null);
  // Last server-authoritative Quote — the source for PDF generation + send.
  const [savedQuote, setSavedQuote] = useState<Quote | null>(null);

  // PDF state.
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [loading, setLoading] = useState(Boolean(quoteId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // --- Auto-mileage (domestic lanes only) ---------------------------------
  // Once the user types in the Distance field we stop auto-overriding it.
  const distanceManuallyEdited = useRef(false);
  // Monotonic guard so a slow earlier request can't clobber a newer one.
  const distanceReqSeq = useRef(0);
  const [distanceCalcing, setDistanceCalcing] = useState(false);
  const [autoDistanceSource, setAutoDistanceSource] = useState<string | null>(null);

  // Hydrate an existing quote.
  useEffect(() => {
    if (!quoteId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    quoting
      .detail(quoteId)
      .then((res) => {
        if (cancelled) return;
        const { quote, line_items, company: co } = res.data;
        dispatch({ type: "hydrate", quote, line_items: line_items ?? [] });
        // A saved quote with a distance is treated as user-owned; don't
        // auto-override it on load.
        if (quote.distance_miles != null) distanceManuallyEdited.current = true;
        setQuoteNumber(quote.quote_number);
        setStatus(quote.status);
        setServerTotals(totalsFromQuote(quote));
        setSavedQuote(quote);
        setPdfSignedUrl(quote.pdf_signed_url ?? null);
        if (co && (co.id || co.company_id)) {
          setCompany({
            company_id: co.id ?? co.company_id,
            company_name: co.name ?? co.company_name ?? "Company",
            domain: co.domain ?? null,
            shipments_12m: co.shipments_12m ?? null,
            top_routes: co.top_routes ?? null,
            address: co.address ?? null,
          });
        } else {
          setCompany({ company_id: quote.company_id, company_name: "Company" });
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e?.message ?? "Failed to load quote.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  // Live local totals — server is authoritative on save, but this drives the
  // panel on every keystroke.
  const liveTotals = useMemo(
    () => computeTotals(state.line_items, state.fuel_surcharge_pct),
    [state.line_items, state.fuel_surcharge_pct],
  );
  // Prefer freshly-saved server totals only until the next local edit.
  const totals = serverTotals ?? liveTotals;

  const laneValue: LaneFields = state;

  // Domestic modes drive a road-miles lookup; ocean/air have no mileage.
  const isDomesticMode = state.mode === "ftl" || state.mode === "ltl" || state.mode === "drayage";
  // Mode-aware origin/destination strings for geocoding. For ftl/ltl the lane
  // fields write to the city columns; drayage origin is a port/ramp (city-ish)
  // string and its destination is an address kept in the city column.
  const autoOrigin = (state.mode === "drayage" ? state.origin_port : state.origin_city) ?? "";
  const autoDestination = state.destination_city ?? "";

  // Debounced auto-mileage. Fires ~700ms after both endpoints are non-empty,
  // skips when the user has manually edited the distance, and ignores stale
  // responses via a monotonic request id.
  useEffect(() => {
    if (!isDomesticMode) return;
    if (distanceManuallyEdited.current) return;
    const origin = autoOrigin.trim();
    const destination = autoDestination.trim();
    if (origin.length < 2 || destination.length < 2) return;

    const seq = ++distanceReqSeq.current;
    const handle = setTimeout(() => {
      setDistanceCalcing(true);
      quoting
        .distance(origin, destination)
        .then((res) => {
          if (seq !== distanceReqSeq.current) return; // stale
          if (distanceManuallyEdited.current) return; // user took over mid-flight
          if (typeof res.miles === "number") {
            setAutoDistanceSource(res.source ?? "osrm");
            patch({ distance_miles: res.miles });
          }
          // res.miles === null → leave the field for manual entry; never fake a number.
        })
        .catch(() => {
          // Network/edge failure: silently leave the field for manual entry.
        })
        .finally(() => {
          if (seq === distanceReqSeq.current) setDistanceCalcing(false);
        });
    }, 700);

    return () => clearTimeout(handle);
  }, [isDomesticMode, autoOrigin, autoDestination]);

  // Manual edit of the Distance field: stop auto-calc from overriding it and
  // drop the "Auto" hint.
  function patchDistanceManual(distance_miles: number | undefined) {
    distanceManuallyEdited.current = true;
    distanceReqSeq.current++; // invalidate any in-flight auto request
    setDistanceCalcing(false);
    setAutoDistanceSource(null);
    patch({ distance_miles });
  }

  /**
   * Persist the quote and return the server-authoritative Quote. Returns null
   * when validation fails (no company) so callers can abort. Used directly by
   * the Save button and as the save-first step of Generate PDF.
   */
  async function saveQuote(): Promise<Quote | null> {
    if (!state.company_id && !state.source_company_key) {
      setSaveError("Select a company first.");
      return null;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const input = toInput(state);
      let quote: Quote;
      if (quoteId) {
        const res = await quoting.update({ quote_id: quoteId, ...input });
        quote = res.data.quote;
      } else {
        const res = await quoting.create(input);
        quote = res.data.quote;
        navigate(`/app/quoting/${quote.id}`);
      }
      applySaved(quote);
      setSavedAt(Date.now());
      return quote;
    } catch (e: any) {
      setSaveError(e?.message ?? "Save failed.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    void saveQuote();
  }

  function applySaved(quote: Quote) {
    setQuoteNumber(quote.quote_number);
    setStatus(quote.status);
    setServerTotals(totalsFromQuote(quote));
    setSavedQuote(quote);
  }

  /**
   * Generate the branded quote PDF client-side and upload it. Saves the quote
   * first when it's unsaved (or has unsaved edits) so the server has the
   * authoritative totals the PDF renders, then forwards the base64 data URI to
   * `quote-generate-pdf` and stores the returned signed URL.
   */
  async function handleGeneratePdf() {
    setPdfError(null);
    setGeneratingPdf(true);
    try {
      // Always save first: guarantees a quote id and that the PDF renders the
      // server's authoritative totals rather than the local preview.
      const quote = await saveQuote();
      if (!quote) {
        setGeneratingPdf(false);
        return;
      }
      const dataUri = await exportQuotePdf(quote, state.line_items, {
        companyName: company?.company_name ?? null,
      });
      const res = await quoting.generatePdf(quote.id, dataUri);
      setPdfSignedUrl(res.data.pdf_signed_url);
    } catch (e: any) {
      setPdfError(e?.message ?? "Failed to generate the PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  }

  // Any edit invalidates the cached server totals so the live preview shows.
  function patch(p: Partial<BuilderState>) {
    setServerTotals(null);
    dispatch({ type: "patch", patch: p });
  }
  function setLineItems(items: QuoteLineItem[]) {
    setServerTotals(null);
    dispatch({ type: "setLineItems", items });
  }

  // Patch from the lane form. A direct edit to its Distance (mi) input counts
  // as a manual override, same as the dedicated field below.
  function patchLane(p: Partial<BuilderState>) {
    if ("distance_miles" in p) {
      patchDistanceManual(p.distance_miles);
      const { distance_miles, ...rest } = p;
      if (Object.keys(rest).length) patch(rest);
    } else {
      patch(p);
    }
  }

  const lane = useMemo(() => laneSummary(state), [state]);

  const sendRef = useRef<HTMLDivElement | null>(null);
  function scrollToSend() {
    sendRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-slate-400">
        <div className="flex items-center gap-2 text-[13px]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading quote…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-[15px] font-bold text-slate-900">Couldn&apos;t load this quote</div>
        <p className="mt-1 text-[13px] text-slate-500">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate("/app/quoting")}
          className="mt-5 inline-flex h-10 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to Quoting
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Sticky action header */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={() => navigate("/app/quoting")}
          aria-label="Back to quoting"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[9px] border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>

        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              className="font-display text-[18px] font-bold tracking-[-0.3px] text-slate-900"
            >
              Quote Builder
            </h1>
            {quoteNumber && (
              <span className="font-mono text-[12px] font-semibold text-blue-700">
                {quoteNumber}
              </span>
            )}
            <QuoteStatusPill status={status} />
          </div>
          {(company || lane) && (
            <small className="truncate text-[12px] text-slate-500">
              {[company?.company_name, lane].filter(Boolean).join(" · ")}
            </small>
          )}
        </div>

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {savedAt && !saving && (
            <span className="hidden items-center gap-1.5 text-[12px] text-slate-400 sm:inline-flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || quotingLocked}
            title={quotingLocked ? "Upgrade to Growth to save quotes" : undefined}
            className="inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 font-display text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Draft
          </button>
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={generatingPdf || saving || quotingLocked}
            title={quotingLocked ? "Upgrade to Growth to generate PDFs" : undefined}
            className="inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[10px] px-4 font-display text-[13px] font-semibold text-white transition disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none"
            style={{ background: "linear-gradient(180deg,#0891b2,#0e7490)" }}
          >
            {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Generate PDF
          </button>
          <button
            type="button"
            onClick={scrollToSend}
            disabled={quotingLocked}
            title={quotingLocked ? "Upgrade to Growth to send quotes" : undefined}
            className="inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[10px] px-4 font-display text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none"
            style={{ background: "linear-gradient(180deg,#2563eb,#1d4ed8)" }}
          >
            <Send className="h-4 w-4" />
            Send Quote
          </button>
        </div>
      </div>

      {quotingLocked && (
        <div className="mx-auto mt-3 max-w-[1320px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px] bg-amber-100 text-amber-700">
              <Lock className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[13px] font-semibold text-amber-900">
                Quoting is available on Growth and above.
              </div>
              <p className="text-[12.5px] text-amber-800">
                Upgrade to create and send quotes.
              </p>
            </div>
            <Link
              to="/app/billing"
              className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-[10px] bg-amber-600 px-3.5 font-display text-[12.5px] font-semibold text-white transition hover:bg-amber-700"
            >
              <Sparkles className="h-4 w-4" />
              Upgrade
            </Link>
          </div>
        </div>
      )}

      {saveError && (
        <div className="mx-auto mt-3 max-w-[1320px] px-4 sm:px-6">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
            {saveError}
          </div>
        </div>
      )}

      {/* Two-column body */}
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-5 px-4 py-5 pb-20 sm:px-6 lg:grid-cols-[1fr_372px]">
        {/* LEFT — form sections */}
        <div className="flex flex-col gap-4">
          <LitSectionCard title="Company" collapsible defaultOpen>
            <QuoteCompanySelector
              company={company}
              onSelect={(c) => {
                setCompany(c);
                // A UUID is a real internal company; otherwise it's a source
                // slug the server resolves on save. Clear the other field so we
                // never send a stale value.
                if (isUuid(c.company_id)) {
                  patch({ company_id: c.company_id, source_company_key: undefined });
                } else {
                  patch({ source_company_key: c.source_company_key, company_id: undefined });
                }
              }}
            />
          </LitSectionCard>

          <LitSectionCard title="Lane & Shipment Details" collapsible defaultOpen>
            <QuoteLaneShipmentForm value={laneValue} onChange={patchLane} />
          </LitSectionCard>

          <LitSectionCard title="Line Items & Accessorials" collapsible defaultOpen padded={false}>
            <div className="px-2 pb-2 pt-1 sm:px-3">
              <QuoteLineItemsTable items={state.line_items} onChange={setLineItems} />
            </div>
          </LitSectionCard>

          <LitSectionCard title="Fuel, Mileage & Terms" collapsible defaultOpen>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FieldLabel label="Distance (mi)" mono>
                  <input
                    value={state.distance_miles == null ? "" : String(state.distance_miles)}
                    onChange={(e) => patchDistanceManual(toNum(e.target.value))}
                    inputMode="decimal"
                    className={inputMono}
                  />
                  {distanceCalcing ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Calculating…
                    </span>
                  ) : autoDistanceSource && !distanceManuallyEdited.current ? (
                    <span className="mt-1 text-[10.5px] font-medium text-cyan-700">
                      Auto (via {autoDistanceSource})
                    </span>
                  ) : null}
                </FieldLabel>
                <FieldLabel label="Fuel Surcharge %" mono>
                  <input
                    value={
                      state.fuel_surcharge_pct == null ? "" : String(state.fuel_surcharge_pct)
                    }
                    onChange={(e) =>
                      patch({ fuel_surcharge_pct: toNum(e.target.value) })
                    }
                    inputMode="decimal"
                    className={inputMono}
                  />
                </FieldLabel>
                <FieldLabel label="Valid Until">
                  <input
                    type="date"
                    value={state.valid_until ?? ""}
                    onChange={(e) => patch({ valid_until: e.target.value || undefined })}
                    className={input}
                  />
                </FieldLabel>
              </div>
              <FieldLabel label="Notes & Terms">
                <textarea
                  value={state.notes ?? ""}
                  onChange={(e) => patch({ notes: e.target.value })}
                  rows={2}
                  placeholder="Rates exclude duties & taxes. Subject to space & equipment availability."
                  className={input + " h-auto py-2 leading-relaxed"}
                />
              </FieldLabel>
            </div>
          </LitSectionCard>
        </div>

        {/* RIGHT — sticky summary */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-[78px] lg:self-start">
          <QuoteTotalsPanel totals={totals} fuelPct={state.fuel_surcharge_pct} />
          <QuoteBenchmarkPanel lane={lane || null} />
          <QuoteRevenueOpportunityPanel
            shipments12m={company?.shipments_12m ?? null}
            totalSell={totals.total_sell}
            lineItemCount={state.line_items.length}
          />

          {pdfError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
              {pdfError}
            </div>
          )}

          <QuotePdfPreview
            generating={generatingPdf}
            signedUrl={pdfSignedUrl}
            onGenerate={handleGeneratePdf}
          />

          <div ref={sendRef} className="scroll-mt-[88px]">
            {savedQuote ? (
              <QuoteSendBox
                quote={savedQuote}
                signedUrl={pdfSignedUrl}
                onSent={() => setStatus("sent")}
              />
            ) : (
              <section className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[12.5px] text-slate-500">
                Save the quote to enable sending.
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const input =
  "h-10 w-full rounded-[9px] border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15";
const inputMono = input + " font-mono font-semibold";

function FieldLabel({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  void mono;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function toNum(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Build a QuoteTotals view from a saved Quote's authoritative server fields. */
function totalsFromQuote(q: Quote): QuoteTotals {
  return {
    subtotal_cost: q.subtotal_cost ?? 0,
    subtotal_sell: q.subtotal_sell ?? 0,
    accessorial_total: q.accessorial_total ?? 0,
    fuel_surcharge_amount: q.fuel_surcharge_amount ?? 0,
    total_cost: q.total_cost ?? 0,
    total_sell: q.total_sell ?? 0,
    gross_profit: q.gross_profit ?? 0,
    gross_margin_pct: q.gross_margin_pct ?? 0,
  };
}
