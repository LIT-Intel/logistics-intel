// Phase 3 — Company Profile rebuild against the approved design bundle at
// docs/design-specs/. Replaces the prior 1,588-line dark-hero layout
// (Phases B.9–B.17) with the design's 4-tab structure:
//
//   Tab bar:   Supply Chain · Contacts · Pulse AI · Activity
//   Body:      <tab content>     |  <CDPDetailsPanel right rail>
//   Header:    <CDPHeader light, with breadcrumb + identity + KPI strip>
//
// Market Benchmark (Phase B.11 super-admin gate) is dropped per direction.
// Pulse AI (Phase 5; was "AI Research") renders the inline brief returned
// by the `pulse-ai-enrich` Supabase Edge Function (replaces the legacy
// `pulse-brief` modal flow). Mobile bottom-sheet (B.17) removed because
// CDPHeader has its own More menu.
//
// All data fetching, plan-gating, error-copy maps, and edge-fn handlers
// are preserved verbatim from the prior implementation:
//   - cached-first load via getSavedCompanyShellOnly (B.15)
//   - background refresh via getSavedCompanyDetail (B.15)
//   - PULSE_ERROR_COPY / EXPORT_ERROR_COPY (B.16 — provider names never
//     surfaced; only "AI brief search source" / "web search" copy)
//   - Save-contact RLS (B.7) handled inside CDPContacts.tsx by reusing the
//     existing listContacts / enrichContacts helpers; no schema drift
//   - Hooks declared above the early-return guard (B.13.1 fix)
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, Users, Workflow, Activity } from "lucide-react";
import AddToCampaignModal from "@/components/command-center/AddToCampaignModal";
import {
  getSavedCompanyDetail,
  getSavedCompanyShellOnly,
  buildYearScopedProfile,
  saveCompanyToCommandCenter,
} from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { capFutureDate } from "@/lib/dateUtils";
import { supabase } from "@/lib/supabase";

import CDPHeader from "@/components/company/CDPHeader";
import CDPDetailsPanel from "@/components/company/CDPDetailsPanel";
import PulseCoachQuotaCard from "@/components/company/PulseCoachQuotaCard";
import CDPSupplyChain from "@/components/company/CDPSupplyChain";
import CDPContacts from "@/components/company/CDPContacts";
import CDPResearch from "@/components/company/CDPResearch";
import CDPActivity from "@/components/company/CDPActivity";

// Phase 5 — friendly copy for `pulse-ai-enrich` / `export-company-profile`
// error codes. Provider names (Tavily / Gemini / OpenAI / etc.) are NEVER
// surfaced to the user — only neutral phrases like "AI search source" or
// "web search". Anything not in this map falls back to the raw `error`
// string so we never silently swallow an upstream message.
const PULSE_ERROR_COPY = {
  // pulse-ai-enrich
  LIMIT_EXCEEDED:
    "You've reached your Pulse AI report limit for this billing period.",
  MISSING_COMPANY_IDENTIFIER:
    "We couldn't identify this company to generate a Pulse AI report.",
  COMPANY_NOT_FOUND: "We couldn't find this company in the database.",
  PULSE_AI_FAILED: "Pulse AI generation failed. Try again in a moment.",
  // legacy pulse-brief codes (kept for any in-flight cached briefs)
  TAVILY_NOT_CONFIGURED:
    "AI search source not configured. Ask your admin to enable it.",
  TAVILY_FAILED: "Web search failed. Try again in a moment.",
  INVALID_INPUT: "We couldn't read this company's identity to build a report.",
  UNAUTHORIZED: "Sign in again to generate a Pulse AI report.",
  SUPABASE_NOT_CONFIGURED:
    "Pulse AI service is missing core configuration. Contact support.",
};

const EXPORT_ERROR_COPY = {
  STORAGE_NOT_PROVISIONED:
    "Storage bucket not configured. Page link copied instead.",
  PDF_NOT_AVAILABLE: "PDF render not available — open HTML version?",
  COMPANY_NOT_FOUND: "We couldn't find this company in the database.",
  COMPANY_FETCH_FAILED:
    "Couldn't load company details for export. Try again in a moment.",
  UPLOAD_FAILED: "Couldn't upload the export. Try again in a moment.",
  SIGN_FAILED: "Couldn't generate a share link. Try again in a moment.",
  INVALID_INPUT: "Export request was malformed.",
  UNAUTHORIZED: "Sign in again to export this profile.",
  SUPABASE_NOT_CONFIGURED:
    "Export service is missing core configuration. Contact support.",
};

/**
 * Pull a structured `{ ok:false, code, message, used, limit, plan, feature, error }`
 * payload out of a supabase-js `FunctionsHttpError`. supabase-js does not
 * parse the response body when status is non-2xx — it just returns
 * "Edge Function returned a non-2xx status code". The actual JSON lives on
 * `error.context` (a `Response`). Returns `null` when no JSON body exists
 * so callers can fall back to a generic message.
 */
async function parseEdgeFunctionError(invokeError) {
  if (!invokeError) return null;
  const ctx = invokeError.context;
  if (!ctx) return null;
  try {
    if (typeof ctx.clone === "function" && typeof ctx.json === "function") {
      const cloned = ctx.clone();
      const body = await cloned.json();
      if (body && typeof body === "object") return body;
    } else if (typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body && typeof body === "object") return body;
    } else if (typeof ctx.text === "function") {
      const text = await ctx.text();
      try {
        const body = JSON.parse(text);
        if (body && typeof body === "object") return body;
      } catch {}
    }
  } catch {
    // Either the body wasn't JSON, or context wasn't a Response — ignore.
  }
  return null;
}

// Phase B.5 — clamp future-dated values to today + 1 day so the page
// never claims a shipment from next month.
function capDateAtToday(value) {
  return capFutureDate(value);
}

function normalizeDateValue(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function getNestedValue(obj, path) {
  let current = obj;
  for (const key of path) {
    if (current == null) return null;
    current = current[key];
  }
  return current ?? null;
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function getShipmentDateValue(shipment) {
  const candidates = [shipment, shipment?.raw, shipment?.raw?.shipment, shipment?.raw?.data];
  const paths = [
    ["bill_of_lading_date"],
    ["bill_of_lading_date_formatted"],
    ["arrival_date"],
    ["shipment_date"],
    ["date"],
    ["estimated_arrival"],
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const path of paths) {
      const value = getNestedValue(candidate, path);
      const normalized = normalizeDateValue(value);
      const capped = capDateAtToday(normalized);
      if (capped) return capped;
    }
  }
  return null;
}

function getLatestShipmentFromProfile(profile) {
  const directLatest = normalizeDateValue(
    pickFirstValue(profile?.lastShipmentDate, profile?.last_shipment_date),
  );
  const safeDirectLatest = capDateAtToday(directLatest);
  if (safeDirectLatest) return safeDirectLatest;

  const shipments =
    profile?.recentBols ||
    profile?.recent_bols ||
    profile?.bols ||
    profile?.shipments ||
    [];
  if (!Array.isArray(shipments) || shipments.length === 0) return null;

  const validDates = shipments
    .map(getShipmentDateValue)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return validDates[0] || null;
}

function estimateMarketSpend(teu, fclTeu = null, lclTeu = null) {
  const total = Number(teu);
  if (!total || total <= 0) return null;
  if (fclTeu != null && lclTeu != null) {
    return Math.round(Number(fclTeu) * 1850 + Number(lclTeu) * 850);
  }
  const inferredFcl = total * 0.85;
  const inferredLcl = total * 0.15;
  return Math.round(inferredFcl * 1850 + inferredLcl * 850);
}

function getStoredSelectedCompany() {
  try {
    const raw = localStorage.getItem("lit:selectedCompany");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildShellCompany(companyId, stored) {
  if (!companyId && !stored) return null;
  return {
    companyId: companyId || stored?.company_id || stored?.source_company_key || null,
    name: stored?.name || stored?.title || "Company",
    address: stored?.address || null,
    countryCode: stored?.country_code || stored?.countryCode || null,
    domain: stored?.domain || null,
    website: stored?.website || null,
    phone: stored?.phone || null,
    kpis: {
      shipments: stored?.kpis?.shipments_12m ?? stored?.shipments_12m ?? null,
      teu: stored?.kpis?.teu_12m ?? stored?.teu_12m ?? null,
      spend: stored?.kpis?.est_spend_12m ?? stored?.est_spend_12m ?? null,
      latestShipment: stored?.kpis?.last_activity ?? stored?.last_activity ?? null,
      topRoute: stored?.kpis?.top_route_12m ?? stored?.top_route_12m ?? null,
      recentRoute: stored?.kpis?.recent_route ?? stored?.recent_route ?? null,
    },
  };
}

const TABS = [
  { id: "supply", label: "Supply Chain", Icon: Workflow },
  { id: "contacts", label: "Contacts", Icon: Users },
  { id: "research", label: "Pulse AI", Icon: Sparkles },
  { id: "activity", label: "Activity", Icon: Activity },
];

export default function Company() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, fullName } = useAuth();

  const decodedRouteId = useMemo(() => {
    try {
      return id ? decodeURIComponent(id) : null;
    } catch {
      return id || null;
    }
  }, [id]);

  const storedSelectedCompany = useMemo(() => getStoredSelectedCompany(), []);
  const companyId = decodedRouteId || storedSelectedCompany?.company_id || null;

  // ── State ──────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState(null);
  const [routeKpis, setRouteKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [canonicalDomain, setCanonicalDomain] = useState(null);
  const [companyEnrichment, setCompanyEnrichment] = useState(null);

  // Honor ?tab=<id> query param so deep-links (Pulse Coach action
  // buttons, Recent Enrichments page, etc.) land on the right tab.
  // Valid tabs: supply | contacts | research | activity.
  const [searchParams] = useSearchParams();
  const initialTab = (() => {
    const t = String(searchParams?.get("tab") || "").toLowerCase();
    return ["supply", "contacts", "research", "activity"].includes(t)
      ? t
      : "supply";
  })();
  const [tab, setTab] = useState(initialTab);
  // Re-sync if the URL changes after mount (e.g. user clicks a Coach
  // action that swaps `?tab=`).
  useEffect(() => {
    const t = String(searchParams?.get("tab") || "").toLowerCase();
    if (["supply", "contacts", "research", "activity"].includes(t)) {
      setTab(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams?.get("tab")]);
  const [starred, setStarred] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  // Phase E — when a refresh fails because the user hit a monthly
  // quota cap (or is close to it), we surface a richer Pulse-Coach-
  // styled card instead of a plain amber error banner. The shape
  // mirrors the gateData payload from check_usage_limit so we can
  // tell trial users which plan would unlock them.
  const [refreshLimitState, setRefreshLimitState] = useState(null);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Pulse AI inline brief (Phase 5 — was "AI Research"). Component state
  // caches the last `pulse-ai-enrich` response so tab switching doesn't
  // re-invoke the function; the function itself also persists the report
  // server-side. `pulseUsage` carries the backend's `plan` + `limit`
  // values so the tab can render an upgrade state without bypassing the
  // server-side cap.
  const [pulseLoading, setPulseLoading] = useState(false);
  const [pulseBrief, setPulseBrief] = useState(null);
  const [pulseError, setPulseError] = useState(null);
  const [pulseUsage, setPulseUsage] = useState(null);

  // Saved contacts list — pushed up from CDPContacts via
  // onContactsChanged so the right-rail Verified Contacts block can
  // summarize without owning the data.
  const [savedContacts, setSavedContacts] = useState([]);

  const [shareLoading, setShareLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [shareToast, setShareToast] = useState(null);

  // ── Cached-first load (Phase B.15 — preserved verbatim) ───────────────
  useEffect(() => {
    if (!companyId) {
      setError("Missing company id");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();

    setLoading(true);
    setError("");
    setRefreshing(false);
    setRefreshError(null);

    function applyYearFromProfile(nextProfile) {
      const years = Array.from(
        new Set(
          (nextProfile?.timeSeries || [])
            .map((point) => Number(point?.year))
            .filter((year) => Number.isFinite(year) && year > 2000),
        ),
      ).sort((a, b) => b - a);
      if (years.length) setSelectedYear(years[0]);
    }

    (async () => {
      // Cache-only mount. Previously the page auto-called the upstream
      // edge function (getSavedCompanyDetail) whenever the snapshot
      // was older than 7 days OR missing. On quota-capped accounts that
      // produced a "non-2xx status code" toast on every saved-company
      // click. The snapshot is the system of record; if it's missing we
      // fall back to the lit_companies shell. Refreshing fresh intel is
      // now opt-in via the "Refresh Intel" button.
      let cached = {
        profile: null,
        routeKpis: null,
        snapshotUpdatedAt: null,
        isStale: true,
      };
      try {
        cached = await getSavedCompanyShellOnly(companyId);
      } catch (cacheErr) {
        console.warn("Company.jsx: cached snapshot read failed", cacheErr);
      }
      if (cancelled) return;

      const haveCached = Boolean(cached.profile || cached.routeKpis);
      if (haveCached) {
        setProfile(cached.profile || null);
        setRouteKpis(cached.routeKpis || null);
        setSnapshotUpdatedAt(cached.snapshotUpdatedAt || null);
        if (cached.profile) applyYearFromProfile(cached.profile);
      } else {
        setProfile(null);
        setRouteKpis(null);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [companyId]);

  // Phase 5.1 v52 — load canonical domain (override → ai → raw) for clean website display
  useEffect(() => {
    if (!companyId) {
      setCanonicalDomain(null);
      setCompanyEnrichment(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: company } = await supabase
          .from("lit_companies")
          .select("source_company_key, enrichment_params, industry, revenue, headcount, website, domain")
          .eq("id", companyId)
          .maybeSingle();
        if (cancelled || !company) return;
        let canonical = null;
        const sck = company.source_company_key;
        if (sck) {
          const { data: override } = await supabase
            .from("lit_company_domain_overrides")
            .select("canonical_domain")
            .eq("source_company_key", sck)
            .maybeSingle();
          if (override?.canonical_domain) canonical = override.canonical_domain;
        }
        if (!canonical && company.enrichment_params?.canonicalDomain) {
          canonical = company.enrichment_params.canonicalDomain;
        }
        if (cancelled) return;
        setCanonicalDomain(canonical || null);
        setCompanyEnrichment({
          enrichment_params: company.enrichment_params ?? null,
          industry: company.industry ?? null,
          revenue: company.revenue ?? null,
          headcount: company.headcount ?? null,
        });
      } catch (e) {
        console.warn("Company.jsx: canonical domain lookup failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // ── Derived data ───────────────────────────────────────────────────────
  const yearScopedProfile = useMemo(() => {
    if (!profile) return null;
    return buildYearScopedProfile(profile, selectedYear) || profile;
  }, [profile, selectedYear]);

  const activeProfile = yearScopedProfile || profile;
  const activeRouteKpis = yearScopedProfile?.routeKpis || routeKpis || null;

  const shellCompany = useMemo(
    () => buildShellCompany(companyId, storedSelectedCompany),
    [companyId, storedSelectedCompany],
  );

  const companyName =
    activeProfile?.title ||
    activeProfile?.name ||
    shellCompany?.name ||
    "Company";

  const companyDomain =
    canonicalDomain ||
    activeProfile?.domain ||
    shellCompany?.domain ||
    null;

  const companyWebsite =
    canonicalDomain ||
    activeProfile?.website ||
    shellCompany?.website ||
    null;

  const companyAddress =
    activeProfile?.address || shellCompany?.address || null;

  const companyCountryCode =
    activeProfile?.countryCode || shellCompany?.countryCode || null;

  const companyCountryName =
    activeProfile?.country ||
    activeProfile?.country_name ||
    shellCompany?.country ||
    null;

  const companyPhone =
    activeProfile?.phoneNumber ||
    activeProfile?.phone ||
    shellCompany?.phone ||
    null;

  const years = useMemo(() => {
    return Array.from(
      new Set(
        (profile?.timeSeries || [])
          .map((point) => Number(point?.year))
          .filter((year) => Number.isFinite(year) && year > 2000),
      ),
    ).sort((a, b) => b - a);
  }, [profile]);

  const headerKpis = useMemo(() => {
    const teu =
      activeRouteKpis?.teuLast12m ??
      activeProfile?.teuLast12m ??
      shellCompany?.kpis?.teu ??
      null;

    const explicitSpend =
      activeRouteKpis?.estSpendUsd12m ??
      activeProfile?.estSpendUsd12m ??
      activeProfile?.marketSpend ??
      shellCompany?.kpis?.spend ??
      null;

    const allTimeSpend =
      activeProfile?.estSpendAllTime ??
      activeProfile?.estSpendUsd ??
      null;

    // Phase 5.1 v52 — prefer real numbers over TEU-derived guesses.
    // 12M spend is null until parser computes it; surface all-time as the
    // primary signal and let the UI label it "All-Time".
    const spend =
      explicitSpend != null && Number(explicitSpend) > 0
        ? Number(explicitSpend)
        : (allTimeSpend != null && Number(allTimeSpend) > 0
            ? Number(allTimeSpend)
            : null);

    const profileLatest = getLatestShipmentFromProfile(activeProfile);
    const shellLatest = capDateAtToday(
      normalizeDateValue(shellCompany?.kpis?.latestShipment),
    );

    return {
      shipments:
        activeRouteKpis?.shipmentsLast12m ??
        activeProfile?.totalShipments ??
        shellCompany?.kpis?.shipments ??
        null,
      shipmentsAllTime:
        activeProfile?.totalShipmentsAllTime ?? null,
      teu,
      spend,
      spendAllTime:
        activeProfile?.estSpendAllTime ??
        activeProfile?.estSpendUsd ??
        null,
      lastShipment: profileLatest || shellLatest,
      topRoute:
        activeRouteKpis?.topRouteLast12m ||
        activeProfile?.topRoutes?.[0]?.route ||
        activeProfile?.top_routes?.[0]?.route ||
        activeProfile?.tradeLaneIntelligence?.[0]?.route ||
        activeProfile?.trade_lane_intelligence?.[0]?.route ||
        shellCompany?.kpis?.topRoute ||
        null,
      recentRoute:
        activeRouteKpis?.mostRecentRoute ||
        shellCompany?.kpis?.recentRoute ||
        null,
      tradeLanes: (() => {
        const candidates = [
          activeProfile?.topRoutes,
          activeProfile?.top_routes,
          activeRouteKpis?.topRoutesLast12m,
          activeProfile?.tradeLaneIntelligence,
          activeProfile?.trade_lane_intelligence,
        ];
        for (const c of candidates) {
          if (Array.isArray(c) && c.length > 0) return c.length;
        }
        return null;
      })(),
      fclCount:
        activeProfile?.fcl_shipments_all_time ??
        activeProfile?.fcl_count ??
        null,
      lclCount:
        activeProfile?.lcl_shipments_all_time ??
        activeProfile?.lcl_count ??
        null,
      contacts: null,
      contactsVerified: null,
    };
  }, [activeProfile, activeRouteKpis, shellCompany]);

  const ownerName =
    fullName ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    null;

  const ownerInitials = useMemo(() => {
    if (!ownerName) return null;
    return ownerName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }, [ownerName]);

  // ── Handlers ──────────────────────────────────────────────────────────
  function showShareToast(message, tone = "info") {
    setShareToast({ message, tone });
    setTimeout(() => setShareToast(null), 3500);
  }

  async function copyToClipboardSafe(text) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // ignore — browser may block clipboard
    }
    return false;
  }

  // Phase 5 — Pulse AI handler. Calls `pulse-ai-enrich` with the logged-in
  // user's session (no service-role key, no OpenAI key in the browser).
  // The function returns either a cached or freshly generated report; we
  // only force a refresh when the user explicitly asks to. LIMIT_EXCEEDED
  // is surfaced via state so the tab can render an upgrade message — the
  // cap itself is enforced server-side and cannot be bypassed from here.
  async function handlePulseClick(options = {}) {
    if (pulseLoading) return;
    const forceRefresh = Boolean(options?.forceRefresh);
    if (!forceRefresh) {
      setTab("research");
    }
    setPulseLoading(true);
    setPulseError(null);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(companyId),
      );
      const sourceKey = isUuid
        ? activeProfile?.source_company_key ||
          activeProfile?.sourceCompanyKey ||
          storedSelectedCompany?.source_company_key ||
          null
        : String(companyId).startsWith("company/")
          ? companyId
          : `company/${companyId}`;
      if (!isUuid && !sourceKey) {
        setPulseError({
          code: "MISSING_COMPANY_IDENTIFIER",
          message: "Could not identify company.",
        });
        setPulseLoading(false);
        return;
      }
      const { data, error: invokeError } = await supabase.functions.invoke(
        "pulse-ai-enrich",
        {
          body: {
            ...(isUuid ? { company_id: companyId } : {}),
            ...(sourceKey ? { source_company_key: sourceKey } : {}),
            mode: "company_profile",
            force_refresh: forceRefresh,
          },
        },
      );
      // Phase B — when the edge function responds non-2xx, supabase-js
      // surfaces a generic FunctionsHttpError. Pull the structured JSON
      // out of error.context so the user sees the real LIMIT_EXCEEDED
      // / NO_ORG_MEMBERSHIP / etc. message, not the opaque relay text.
      const parsedErr = invokeError
        ? await parseEdgeFunctionError(invokeError)
        : null;
      const effective = parsedErr || data;
      if (invokeError && !parsedErr) {
        // No structured body to render — surface the relay error verbatim.
        throw invokeError;
      }
      if (!effective?.ok) {
        const code = effective?.code || "PULSE_AI_FAILED";
        const friendly =
          effective?.message ||
          PULSE_ERROR_COPY[code] ||
          effective?.error ||
          "Pulse AI failed.";
        setPulseError({
          code,
          message: friendly,
          used: effective?.used ?? null,
          limit: effective?.limit ?? null,
          plan: effective?.plan ?? null,
          feature: effective?.feature ?? null,
        });
        if (effective?.plan != null || effective?.limit != null) {
          setPulseUsage({
            plan: effective.plan ?? null,
            limit: effective.limit ?? null,
          });
        }
      } else {
        const report = data.report || {};
        const reportRow = data.report_row || {};
        setPulseBrief({
          generatedAt: reportRow.generated_at || report.generated_at || null,
          cached: Boolean(data.cached),
          report,
          reportRow,
          confidence:
            report.confidence_score ??
            report.confidence ??
            reportRow.confidence ??
            null,
          model: reportRow.model || report.model || null,
        });
        setPulseUsage({
          plan: data.plan ?? null,
          limit: data.limit ?? null,
        });
      }
    } catch (err) {
      setPulseError({
        code: "NETWORK",
        message: err?.message || "Pulse AI network error.",
      });
    } finally {
      setPulseLoading(false);
    }
  }

  function handlePulseRefresh() {
    return handlePulseClick({ forceRefresh: true });
  }

  // Auto-load cached Pulse AI brief on first visit to the Pulse AI tab so
  // users see their previously-generated report without re-clicking Generate.
  // pulse-ai-enrich's findCachedReport returns the most recent completed
  // report when force_refresh=false, so this is a cache hit (no usage cost).
  // Guarded: only fires once activeProfile has hydrated so we can resolve a
  // source_company_key when companyId is a UUID.
  useEffect(() => {
    if (tab !== "research") return;
    if (pulseLoading) return;
    if (pulseBrief?.report) return;
    if (pulseError) return;
    if (!companyId) return;
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(companyId),
      );
    // For UUID routes we need source_company_key from the loaded profile to
    // query the snapshot. Wait for hydration.
    if (isUuid && !activeProfile && !storedSelectedCompany?.source_company_key) {
      return;
    }
    handlePulseClick({ forceRefresh: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, companyId, activeProfile]);

  async function handleManualRefreshClick() {
    if (!companyId || manualRefreshing) return;
    setManualRefreshing(true);
    setRefreshError(null);
    try {
      // forceRefresh:true tells importyeti-proxy to bypass its 30-day
      // snapshot cache and pull fresh upstream data so the KPI cards,
      // top container, recent shipments, and right rail all visibly
      // update. Burns one company_profile_view quota credit (platform
      // admins bypass server-side via the platform_admins table — note
      // org-owner role does NOT bypass per check_usage_limit).
      const fresh = await getSavedCompanyDetail(companyId, undefined, {
        forceRefresh: true,
      });
      if (fresh) {
        setProfile(fresh.profile || null);
        setRouteKpis(fresh.routeKpis || null);
        setSnapshotUpdatedAt(new Date().toISOString());

        // Write the fresh profile back into lit_companies so the
        // Command Center saved-list, dashboard "What Matters Now",
        // and Pulse Coach lane aggregations see the updated KPIs
        // without needing another refresh. saveCompanyToCommandCenter
        // is an upsert against the existing saved row — it does NOT
        // create a duplicate or burn a saved_company quota credit
        // because the (user_id, company_id) row already exists.
        try {
          const fp = fresh.profile;
          if (fp) {
            const slug = String(fp.key || `company/${companyId}`).replace(
              /^company\//,
              "",
            );
            await saveCompanyToCommandCenter({
              shipper: {
                key: `company/${slug}`,
                companyId: `company/${slug}`,
                title: fp.title || fp.name || "",
                name: fp.title || fp.name || "",
                domain: fp.domain || undefined,
                website: fp.website || undefined,
                address: fp.address || undefined,
                countryCode: fp.countryCode || undefined,
                totalShipments: fp.routeKpis?.shipmentsLast12m,
                teusLast12m: fp.routeKpis?.teuLast12m,
                mostRecentShipment: fp.lastShipmentDate,
                lastShipmentDate: fp.lastShipmentDate,
                primaryRoute: fp.routeKpis?.topRouteLast12m,
                topSuppliers: Array.isArray(fp.topSuppliers)
                  ? fp.topSuppliers
                  : [],
              },
              profile: fp,
              stage: "prospect",
              source: "importyeti",
            });
          }
        } catch (writebackErr) {
          // Non-fatal — page still shows the fresh snapshot, the
          // dashboard list will catch up on the next save or refresh.
          console.warn(
            "[handleManualRefreshClick] writeback to lit_companies failed",
            writebackErr,
          );
        }

        showShareToast("Intelligence refreshed", "success");
      }
    } catch (err) {
      // Use the structured `code` attached by getIyCompanyProfile
      // (LIMIT_EXCEEDED, COMPANY_PROFILE_FAILED, etc) to route to the
      // right surface — never assume a non-2xx is a quota issue.
      const code = err?.code || null;
      if (code === "LIMIT_EXCEEDED") {
        // Phase E — Pulse Coach card instead of a raw "non-2xx"
        // toast. We have plan / used / limit / reset_at on the
        // gateData payload supabase-js attached to the error, so
        // surface a premium message that explains the monthly
        // refresh cycle and (for trial users) suggests an upgrade.
        const gate = err?.gate || {};
        setRefreshLimitState({
          feature: gate.feature || "company_profile_view",
          plan: gate.plan || null,
          used: gate.used ?? null,
          limit: gate.limit ?? null,
          reset_at: gate.reset_at ?? null,
          upgrade_url: gate.upgrade_url || "/app/billing",
        });
        // Drop the plain text banner so it doesn't double-render
        // alongside the rich card.
        setRefreshError(null);
      } else if (code === "COMPANY_PROFILE_FAILED" || code === "IY_API_KEY_MISSING") {
        const friendly =
          "Couldn't refresh trade intel right now. The data provider is temporarily unavailable — please try again in a moment.";
        setRefreshError(friendly);
        showShareToast(friendly, "error");
      } else if (code === "UNAUTHORIZED") {
        const friendly = "Your session expired. Please sign in again.";
        setRefreshError(friendly);
        showShareToast(friendly, "error");
      } else {
        const friendly = err?.message || "Refresh failed. Please try again.";
        setRefreshError(friendly);
        showShareToast(friendly, "error");
      }
    } finally {
      setManualRefreshing(false);
    }
  }

  async function handleShareHtmlClick() {
    if (!companyId || shareLoading) return;
    setShareLoading(true);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(companyId),
      );
      const sourceKey = isUuid
        ? activeProfile?.source_company_key ||
          activeProfile?.sourceCompanyKey ||
          null
        : String(companyId).startsWith("company/")
          ? companyId
          : `company/${companyId}`;
      const { data, error: invokeError } = await supabase.functions.invoke(
        "export-company-profile",
        {
          body: {
            ...(isUuid ? { company_id: companyId } : {}),
            ...(sourceKey ? { source_company_key: sourceKey } : {}),
            format: "html",
            include_pulse_brief: Boolean(pulseBrief),
          },
        },
      );
      const parsedErr = invokeError
        ? await parseEdgeFunctionError(invokeError)
        : null;
      const effective = parsedErr || data;
      if (invokeError && !parsedErr) throw invokeError;
      if (effective?.ok && effective.url) {
        const ok = await copyToClipboardSafe(effective.url);
        showShareToast(
          ok
            ? "Branded share link copied"
            : "Branded share link generated (copy failed — open console)",
          "success",
        );
        if (!ok) console.info("export-company-profile signed URL:", effective.url);
      } else if (effective?.code === "STORAGE_NOT_PROVISIONED") {
        const url = typeof window !== "undefined" ? window.location.href : "";
        await copyToClipboardSafe(url);
        showShareToast(EXPORT_ERROR_COPY.STORAGE_NOT_PROVISIONED, "warning");
      } else {
        const friendly =
          effective?.message ||
          EXPORT_ERROR_COPY[effective?.code] ||
          effective?.error ||
          "Share export failed.";
        showShareToast(friendly, "error");
      }
    } catch (err) {
      showShareToast(err?.message || "Share export error.", "error");
    } finally {
      setShareLoading(false);
    }
  }

  async function handleExportPdfClick() {
    if (!companyId || exportLoading) return;
    setExportLoading(true);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(companyId),
      );
      const sourceKey = isUuid
        ? activeProfile?.source_company_key ||
          activeProfile?.sourceCompanyKey ||
          null
        : String(companyId).startsWith("company/")
          ? companyId
          : `company/${companyId}`;
      const { data, error: invokeError } = await supabase.functions.invoke(
        "export-company-profile",
        {
          body: {
            ...(isUuid ? { company_id: companyId } : {}),
            ...(sourceKey ? { source_company_key: sourceKey } : {}),
            format: "pdf",
            include_pulse_brief: Boolean(pulseBrief),
          },
        },
      );
      const parsedErr = invokeError
        ? await parseEdgeFunctionError(invokeError)
        : null;
      const effective = parsedErr || data;
      if (invokeError && !parsedErr) throw invokeError;
      if (effective?.ok && effective.url) {
        if (typeof window !== "undefined") window.open(effective.url, "_blank");
      } else if (effective?.code === "PDF_NOT_AVAILABLE" && effective?.fallback?.url) {
        const open =
          typeof window !== "undefined" &&
          window.confirm(
            "PDF render not available — open the branded HTML version instead?",
          );
        if (open) window.open(effective.fallback.url, "_blank");
        else showShareToast("PDF export not available yet", "warning");
      } else if (effective?.code === "STORAGE_NOT_PROVISIONED") {
        const url = typeof window !== "undefined" ? window.location.href : "";
        await copyToClipboardSafe(url);
        showShareToast(EXPORT_ERROR_COPY.STORAGE_NOT_PROVISIONED, "warning");
      } else {
        const friendly =
          effective?.message ||
          EXPORT_ERROR_COPY[effective?.code] ||
          effective?.error ||
          "PDF export failed.";
        showShareToast(friendly, "error");
      }
    } catch (err) {
      showShareToast(err?.message || "PDF export error.", "error");
    } finally {
      setExportLoading(false);
    }
  }

  // ── Early return for missing companyId / load error ─────────────────
  if (error || !companyId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <button
            type="button"
            onClick={() => navigate("/app/command-center")}
            className="font-display inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Command Center
          </button>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-[13px] text-rose-700">
            {error || "Company unavailable"}
          </div>
        </div>
      </div>
    );
  }

  // ── Initial loading skeleton ─────────────────────────────────────────
  if (loading && !profile && !shellCompany) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="font-body inline-flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          Loading company profile…
        </div>
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <CDPHeader
        company={{
          id: companyId,
          name: companyName,
          domain: companyDomain,
          website: companyWebsite,
          address: companyAddress,
          countryCode: companyCountryCode,
          countryName: companyCountryName,
          phone: companyPhone,
        }}
        kpis={headerKpis}
        starred={starred}
        onToggleStar={() => setStarred((v) => !v)}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        onBack={() => navigate("/app/command-center")}
        onShare={handleShareHtmlClick}
        onExportPdf={handleExportPdfClick}
        onAddToList={() => setCampaignModalOpen(true)}
        onStartOutreach={() => setCampaignModalOpen(true)}
        onPulse={handlePulseClick}
        onRefresh={handleManualRefreshClick}
        shareLoading={shareLoading}
        exportLoading={exportLoading}
        refreshing={refreshing}
        manualRefreshing={manualRefreshing}
        snapshotUpdatedAt={snapshotUpdatedAt}
      />

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Company sections"
        className="flex shrink-0 items-center gap-0 border-b border-slate-200 bg-white px-6"
      >
        {TABS.map((t) => {
          const Icon = t.Icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={[
                "font-display -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold transition-colors",
                active
                  ? "border-blue-500 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Premium Pulse Coach quota card — only renders when refresh
          fails because the user hit a monthly cap. The plain refresh
          banner below covers all other failure modes. */}
      {refreshLimitState && (
        <PulseCoachQuotaCard
          plan={refreshLimitState.plan}
          feature={refreshLimitState.feature}
          used={refreshLimitState.used}
          limit={refreshLimitState.limit}
          reset_at={refreshLimitState.reset_at}
          upgrade_url={refreshLimitState.upgrade_url}
          onDismiss={() => setRefreshLimitState(null)}
        />
      )}

      {refreshError && (
        <div className="font-body shrink-0 border-b border-amber-100 bg-amber-50 px-6 py-2 text-[12px] text-amber-700">
          {refreshError}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {tab === "supply" && (
            <CDPSupplyChain
              profile={activeProfile}
              routeKpis={activeRouteKpis}
              selectedYear={selectedYear}
              years={years}
              onSelectYear={setSelectedYear}
            />
          )}
          {tab === "contacts" && (
            <CDPContacts
              companyId={companyId}
              companyName={companyName}
              companyDomain={companyDomain}
              companyLocation={companyAddress}
              onContactsChanged={setSavedContacts}
            />
          )}
          {tab === "research" && (
            <CDPResearch
              companyName={companyName}
              companyMeta={{
                ticker: companyEnrichment?.enrichment_params?.ticker ?? null,
                hq:
                  companyAddress ||
                  companyEnrichment?.enrichment_params?.hqLocation?.city ||
                  null,
                teuYr:
                  activeRouteKpis?.teuLast12m ??
                  activeProfile?.totalTeuAllTime ??
                  null,
                vertical:
                  companyEnrichment?.industry ||
                  companyEnrichment?.enrichment_params?.firmographics?.industry ||
                  null,
              }}
              tradeKpis={{
                shipments12m:
                  activeRouteKpis?.shipmentsLast12m ??
                  activeProfile?.totalShipments ??
                  null,
                teu12m:
                  activeRouteKpis?.teuLast12m ??
                  activeProfile?.totalTeuAllTime ??
                  null,
                activeLanes: Array.isArray(activeProfile?.topRoutes)
                  ? activeProfile.topRoutes.length
                  : Array.isArray(activeProfile?.top_routes)
                    ? activeProfile.top_routes.length
                    : null,
                topLaneLabel:
                  activeRouteKpis?.topRouteLast12m ||
                  activeProfile?.topRoutes?.[0]?.route ||
                  activeProfile?.top_routes?.[0]?.route ||
                  null,
                topLaneShare: (() => {
                  const top =
                    activeProfile?.topRoutes?.[0] ||
                    activeProfile?.top_routes?.[0] ||
                    null;
                  const total = Number(
                    activeRouteKpis?.shipmentsLast12m ??
                      activeProfile?.totalShipments,
                  );
                  const topShip = Number(top?.shipments);
                  if (!total || !topShip || total <= 0) return null;
                  return topShip / total;
                })(),
                yoyPct: null,
              }}
              pulseBrief={pulseBrief}
              pulseLoading={pulseLoading}
              pulseError={pulseError}
              pulseUsage={pulseUsage}
              onPulse={handlePulseClick}
              onRefresh={handlePulseRefresh}
              onShareHtml={handleShareHtmlClick}
              onExportPdf={handleExportPdfClick}
              shareLoading={shareLoading}
              exportLoading={exportLoading}
              navigate={navigate}
            />
          )}
          {tab === "activity" && (
            <CDPActivity companyId={companyId} ownerName={ownerName} />
          )}
        </div>
        {panelOpen && (
          <CDPDetailsPanel
            company={{
              domain: companyDomain,
              website: companyWebsite,
              address: companyAddress,
              countryCode: companyCountryCode,
              countryName: companyCountryName,
              phone: companyPhone,
            }}
            kpis={headerKpis}
            profile={activeProfile}
            ownerName={ownerName}
            ownerInitials={ownerInitials}
            lists={null}
            campaigns={null}
            onRefresh={handleManualRefreshClick}
            refreshing={manualRefreshing}
            snapshotUpdatedAt={snapshotUpdatedAt}
            contacts={savedContacts}
            onOpenContactsTab={() => setTab("contacts")}
          />
        )}
      </div>

      {/* Toast */}
      {shareToast && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "font-body fixed bottom-6 right-6 z-50 rounded-md border px-3.5 py-2 text-[12px] shadow-lg",
            shareToast.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : shareToast.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700",
          ].join(" ")}
        >
          {shareToast.message}
        </div>
      )}

      {/* Add-to-Campaign modal (preserved) */}
      <AddToCampaignModal
        open={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        company={{ company_id: companyId, name: companyName }}
      />
    </div>
  );
}