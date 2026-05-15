/**
 * Phase 3.4 — Canonical Company Profile container.
 *
 * Near-clone of `frontend/src/pages/Company.jsx`. The render tree, state,
 * and handlers are copied verbatim from the legacy page so V2 has byte-
 * identical layout / KPI mapping / Pulse generation / refresh / share /
 * export behavior. The only V2 deltas are the wrappers at the top
 * (CompanyProfileGuard + V2ErrorBoundary) and a directory-only Save &
 * Enrich card that replaces the Supply Chain tab body when the resolved
 * company is absent from `lit_companies` but present in
 * `lit_company_directory`.
 *
 * Mounted at /app/companies/:id (canonical) with /app/companies/:id/preview
 * (alias) and /app/companies/:id/legacy (the actual legacy page) as
 * peers. Production app.logisticintel.com is unchanged until promoted.
 */

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Users,
  Workflow,
  Activity,
  Inbox,
  Wrench,
  Bookmark,
  Anchor,
  TrendingUp,
  Radio,
} from "lucide-react";
import AddToCampaignModal from "@/components/command-center/AddToCampaignModal";
import AddToListPicker from "@/features/pulse/AddToListPicker";
import { PulseLIVETab } from "@/features/pulse/PulseLIVETab";
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
import CompanySignalsStrip from "@/components/company/CompanySignalsStrip";
import CDPDetailsPanel from "@/components/company/CDPDetailsPanel";
import PulseCoachQuotaCard from "@/components/company/PulseCoachQuotaCard";
import CDPSupplyChain from "@/components/company/CDPSupplyChain";
import CDPContacts from "@/components/company/CDPContacts";
import CDPResearch from "@/components/company/CDPResearch";
import CDPActivity from "@/components/company/CDPActivity";
import CDPRateBenchmark from "@/components/company/CDPRateBenchmark";
import CDPRevenueOpportunity from "@/components/company/CDPRevenueOpportunity";
import CompanyInboxTab from "@/components/company/CompanyInboxTab";
import CompanyProfileGuard from "@/components/company/CompanyProfileGuard";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { loadSyntheticProfile } from "@/lib/companyProfileFallback";
import {
  loadLatestBenchmarks,
  matchAllRoutesForCompany,
  type FreightLane,
} from "@/lib/freightRateBenchmark";

// =============================================================================
// Constants & helpers — verbatim from Company.jsx 51–209.
// =============================================================================

const PULSE_ERROR_COPY: Record<string, string> = {
  LIMIT_EXCEEDED:
    "You've reached your Pulse AI report limit for this billing period.",
  MISSING_COMPANY_IDENTIFIER:
    "We couldn't identify this company to generate a Pulse AI report.",
  COMPANY_NOT_FOUND: "We couldn't find this company in the database.",
  PULSE_AI_FAILED: "Pulse AI generation failed. Try again in a moment.",
  TAVILY_NOT_CONFIGURED:
    "AI search source not configured. Ask your admin to enable it.",
  TAVILY_FAILED: "Web search failed. Try again in a moment.",
  INVALID_INPUT: "We couldn't read this company's identity to build a report.",
  UNAUTHORIZED: "Sign in again to generate a Pulse AI report.",
  SUPABASE_NOT_CONFIGURED:
    "Pulse AI service is missing core configuration. Contact support.",
};

const EXPORT_ERROR_COPY: Record<string, string> = {
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

async function parseEdgeFunctionError(invokeError: any): Promise<any | null> {
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
  } catch {}
  return null;
}

function capDateAtToday(value: any): string | null {
  return capFutureDate(value);
}

function normalizeDateValue(value: any): string | null {
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

function getNestedValue(obj: any, path: string[]): any {
  let current = obj;
  for (const key of path) {
    if (current == null) return null;
    current = current[key];
  }
  return current ?? null;
}

function pickFirstValue(...values: any[]): any {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function getShipmentDateValue(shipment: any): string | null {
  const candidates = [
    shipment,
    shipment?.raw,
    shipment?.raw?.shipment,
    shipment?.raw?.data,
  ];
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

function getLatestShipmentFromProfile(profile: any): string | null {
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
    .sort(
      (a: any, b: any) => new Date(b).getTime() - new Date(a).getTime(),
    );

  return (validDates[0] as string) || null;
}

function getStoredSelectedCompany(): any {
  try {
    const raw = localStorage.getItem("lit:selectedCompany");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildShellCompany(companyId: string | null, stored: any): any {
  if (!companyId && !stored) return null;
  const stripPrefix = (v: any) =>
    String(v || "").replace(/^company\//, "").toLowerCase();
  const routeBare = stripPrefix(companyId);
  const storedCandidates = [
    stored?.company_id,
    stored?.source_company_key,
    stored?.companyId,
    stored?.id,
  ]
    .filter(Boolean)
    .map(stripPrefix);
  const storedMatches =
    !!stored && routeBare && storedCandidates.includes(routeBare);
  const safe = storedMatches ? stored : null;

  return {
    companyId:
      companyId || safe?.company_id || safe?.source_company_key || null,
    name: safe?.name || safe?.title || "Company",
    address: safe?.address || null,
    countryCode: safe?.country_code || safe?.countryCode || null,
    domain: safe?.domain || null,
    website: safe?.website || null,
    phone: safe?.phone || null,
    kpis: {
      shipments: safe?.kpis?.shipments_12m ?? safe?.shipments_12m ?? null,
      teu: safe?.kpis?.teu_12m ?? safe?.teu_12m ?? null,
      spend: safe?.kpis?.est_spend_12m ?? safe?.est_spend_12m ?? null,
      latestShipment: safe?.kpis?.last_activity ?? safe?.last_activity ?? null,
      topRoute: safe?.kpis?.top_route_12m ?? safe?.top_route_12m ?? null,
      recentRoute: safe?.kpis?.recent_route ?? safe?.recent_route ?? null,
    },
    country: safe?.country || null,
  };
}

const TABS = [
  { id: "supply", label: "Supply Chain", Icon: Workflow },
  { id: "live", label: "Pulse LIVE", Icon: Radio },
  { id: "rates", label: "Rate Benchmark", Icon: Anchor },
  { id: "contacts", label: "Contacts", Icon: Users },
  { id: "research", label: "Pulse AI", Icon: Sparkles },
  { id: "revenue", label: "Revenue Opportunity", Icon: TrendingUp },
  { id: "activity", label: "Activity", Icon: Activity },
  { id: "inbox", label: "Inbox", Icon: Inbox },
] as const;
type TabId = (typeof TABS)[number]["id"];

// =============================================================================
// V2-only: error boundary + directory-only Save & Enrich card.
// =============================================================================

type BoundaryProps = { rawId: string; children: ReactNode };
type BoundaryState = { error: Error | null };
class V2ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error("[CompanyProfileV2] render crash", { error, info });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-4">
              <Wrench className="w-6 h-6 text-rose-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Something went wrong loading this profile
            </h2>
            <p className="text-xs text-slate-400 mb-6 break-all">
              {String(this.state.error?.message ?? this.state.error)}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
              >
                Reload page
              </button>
              <Link
                to="/app/command-center"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Command Center
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DirectoryOnlyEmptyState({
  companyName,
  onSave,
  saving,
}: {
  companyName: string;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="max-w-2xl mx-auto mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <Bookmark className="w-7 h-7 text-blue-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">
        Save {companyName} to ingest shipment intelligence
      </h2>
      <p className="text-sm text-slate-600 mb-6 max-w-md mx-auto">
        This company exists in the LIT directory but hasn't been added to
        your Command Center yet. Save it to pull live trade lanes, FCL/LCL
        breakdown, recent shipments, and supplier intelligence.
      </p>
      <button
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Bookmark className="w-4 h-4" />
        )}
        {saving ? "Saving…" : "Save & Enrich"}
      </button>
      <p className="text-xs text-slate-400 mt-4">
        We won't burn ImportYeti credits until the company is saved and
        eligible.
      </p>
    </div>
  );
}

// =============================================================================
// ProfilePanel — clone of legacy Company.jsx body.
// =============================================================================

function ProfilePanel({ rawId }: { rawId: string }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const { user, fullName } = auth ?? ({} as any);

  // Aggregator-side identity (drives directory-only branch + canonical UUID
  // when the URL param is a slug). The legacy page derives companyId from
  // the URL param + localStorage; V2 keeps that path AND additionally uses
  // the resolver to surface a clean directory-only state when the company
  // isn't in lit_companies.
  const { data: bundle } = useCompanyProfile(rawId, {
    include: ["identity", "contacts", "activity"],
  });

  const decodedRouteId = useMemo(() => {
    try {
      return rawId ? decodeURIComponent(rawId) : null;
    } catch {
      return rawId || null;
    }
  }, [rawId]);

  const storedSelectedCompany = useMemo(() => getStoredSelectedCompany(), []);
  const routeOrStoredId =
    decodedRouteId || storedSelectedCompany?.company_id || null;

  // Phase 4.x — slug→UUID resolver. Bell-notification CTAs land here with a
  // bare slug (e.g. "city-furniture") because the notification trigger
  // strips the "company/" prefix. The downstream data path (snapshot
  // lookup, lit_companies reads, writebacks) was originally written for
  // UUIDs that originate from Command Center search, so a bare slug
  // arrives at the loaders unnormalized and the page renders with empty
  // KPI cards.
  //
  // The resolver checks the route param's shape:
  //   - UUID → use as-is (Command Center path, unchanged)
  //   - anything else → treat as slug, look up the UUID via
  //     lit_companies.source_company_key (both "company/<slug>" and bare
  //     forms), then promote the UUID as the canonical companyId.
  //
  // Resolution is non-fatal: if the lookup misses, we fall through with
  // the raw value so the existing error/not-found UI still fires.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(
    () => (routeOrStoredId && UUID_RE.test(routeOrStoredId) ? routeOrStoredId : null),
  );
  const [resolvingSlug, setResolvingSlug] = useState<boolean>(
    !!routeOrStoredId && !UUID_RE.test(routeOrStoredId),
  );
  useEffect(() => {
    if (!routeOrStoredId) {
      setResolvedCompanyId(null);
      setResolvingSlug(false);
      return;
    }
    if (UUID_RE.test(routeOrStoredId)) {
      setResolvedCompanyId(routeOrStoredId);
      setResolvingSlug(false);
      return;
    }
    // Slug path — try to find the canonical UUID.
    let cancelled = false;
    setResolvingSlug(true);
    (async () => {
      try {
        const bare = String(routeOrStoredId).replace(/^company\//i, "");
        const candidates = Array.from(
          new Set([bare, `company/${bare}`].filter(Boolean)),
        );
        const { data: rows } = await supabase
          .from("lit_companies")
          .select("id, source_company_key")
          .in("source_company_key", candidates)
          .limit(1);
        if (cancelled) return;
        const uuid = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any).id : null;
        // Fall through to raw slug if no UUID match — downstream loaders
        // already handle the slug shape via their own normalization.
        setResolvedCompanyId(uuid || routeOrStoredId);
      } catch (e) {
        if (cancelled) return;
        console.warn("[CompanyProfileV2] slug→UUID resolve failed", e);
        setResolvedCompanyId(routeOrStoredId);
      } finally {
        if (!cancelled) setResolvingSlug(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeOrStoredId]);

  const companyId = resolvedCompanyId;

  // ── State (verbatim from Company.jsx 290–351) ──────────────────────────
  const [profile, setProfile] = useState<any>(null);
  const [routeKpis, setRouteKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [canonicalDomain, setCanonicalDomain] = useState<string | null>(null);
  const [companyEnrichment, setCompanyEnrichment] = useState<any>(null);

  const [searchParams] = useSearchParams();
  const initialTab: TabId = (() => {
    const t = String(searchParams?.get("tab") || "").toLowerCase();
    return (["supply", "rates", "contacts", "research", "activity", "inbox"] as const).includes(
      t as TabId,
    )
      ? (t as TabId)
      : "supply";
  })();
  const [tab, setTab] = useState<TabId>(initialTab);
  useEffect(() => {
    const t = String(searchParams?.get("tab") || "").toLowerCase();
    if (
      (["supply", "rates", "contacts", "research", "activity", "inbox"] as const).includes(
        t as TabId,
      )
    ) {
      setTab(t as TabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams?.get("tab")]);

  const [starred, setStarred] = useState(false);
  const [savingStar, setSavingStar] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  // Universal Saved Lists picker — shared with Pulse / Pulse Library / Campaigns.
  // Distinct from the campaign modal (which is for outreach send), so users can
  // organize companies into lists without committing to a campaign.
  const [addToListOpen, setAddToListOpen] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshLimitState, setRefreshLimitState] = useState<any>(null);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const [pulseLoading, setPulseLoading] = useState(false);
  const [pulseBrief, setPulseBrief] = useState<any>(null);
  const [pulseError, setPulseError] = useState<any>(null);
  const [pulseUsage, setPulseUsage] = useState<any>(null);

  const [savedContacts, setSavedContacts] = useState<any[]>([]);

  const [shareLoading, setShareLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [shareToast, setShareToast] = useState<{
    message: string;
    tone: string;
  } | null>(null);

  // ── Cached-first load (verbatim from Company.jsx 354–418) ──────────────
  useEffect(() => {
    if (resolvingSlug) {
      // Still resolving slug → UUID — keep the spinner up rather than
      // briefly flashing "Missing company id".
      setLoading(true);
      return;
    }
    if (!companyId) {
      setError("Missing company id");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setRefreshing(false);
    setRefreshError(null);

    function applyYearFromProfile(nextProfile: any) {
      const yrs = Array.from(
        new Set(
          (nextProfile?.timeSeries || [])
            .map((point: any) => Number(point?.year))
            .filter(
              (year: number) => Number.isFinite(year) && year > 2000,
            ),
        ),
      ).sort((a: any, b: any) => b - a);
      if (yrs.length) setSelectedYear(yrs[0] as number);
    }

    (async () => {
      let cached: any = {
        profile: null,
        routeKpis: null,
        snapshotUpdatedAt: null,
        isStale: true,
      };
      try {
        cached = await getSavedCompanyShellOnly(companyId);
      } catch (cacheErr) {
        console.warn(
          "[CompanyProfileV2] cached snapshot read failed",
          cacheErr,
        );
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
    };
  }, [companyId]);

  // V2 addition — synthetic profile fallback when the snapshot is missing
  // but the company exists in lit_companies (the saved row has KPIs even
  // without a snapshot). Mirrors legacy's lit_companies fallback path
  // inside getSavedCompanyShellOnly but reaches the synthesizer when that
  // helper returns null.
  useEffect(() => {
    if (loading) return;
    if (profile) return;
    const savedUuid = bundle?.identity?.id;
    const savedPresent = bundle?.identity?.sources?.saved?.present === true;
    if (!savedUuid || !savedPresent) return;
    let cancelled = false;
    (async () => {
      const synthetic = await loadSyntheticProfile(savedUuid);
      if (cancelled || !synthetic) return;
      setProfile(synthetic);
      setRouteKpis(synthetic.routeKpis ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, profile, bundle?.identity?.id, bundle?.identity?.sources?.saved?.present]);

  // Canonical domain + enrichment lookup (verbatim from Company.jsx 421–462).
  useEffect(() => {
    if (!companyId) {
      setCanonicalDomain(null);
      setCompanyEnrichment(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            String(companyId),
          );
        const lookup = isUuid
          ? supabase
              .from("lit_companies")
              .select(
                "source_company_key, enrichment_params, industry, revenue, headcount, website, domain",
              )
              .eq("id", companyId)
          : supabase
              .from("lit_companies")
              .select(
                "source_company_key, enrichment_params, industry, revenue, headcount, website, domain",
              )
              .eq("source_company_key", companyId);
        const { data: company } = await lookup.maybeSingle();
        if (cancelled || !company) return;
        let canonical: string | null = null;
        const sck = (company as any).source_company_key;
        if (sck) {
          try {
            const { data: override } = await supabase
              .from("lit_company_domain_overrides")
              .select("canonical_domain")
              .eq("source_company_key", sck)
              .maybeSingle();
            if ((override as any)?.canonical_domain)
              canonical = (override as any).canonical_domain;
          } catch {
            // table may not exist in this env — non-fatal.
          }
        }
        if (!canonical && (company as any).enrichment_params?.canonicalDomain) {
          canonical = (company as any).enrichment_params.canonicalDomain;
        }
        if (cancelled) return;
        setCanonicalDomain(canonical || null);
        setCompanyEnrichment({
          enrichment_params: (company as any).enrichment_params ?? null,
          industry: (company as any).industry ?? null,
          revenue: (company as any).revenue ?? null,
          headcount: (company as any).headcount ?? null,
        });
      } catch (e) {
        console.warn(
          "[CompanyProfileV2] canonical domain lookup failed",
          e,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Auto-heal lit_companies row from snapshot — verbatim from Company.jsx 473–537.
  const autoHealedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || !companyId) return;
    const hasSnapshotData =
      Array.isArray(profile?.recentBols) && profile.recentBols.length > 0;
    if (!hasSnapshotData) return;
    if (autoHealedRef.current === companyId) return;
    autoHealedRef.current = companyId;

    const sourceKey =
      profile.key ||
      profile.companyId ||
      `company/${String(companyId).replace(/^company\//, "")}`;
    const bareSlug = String(sourceKey).replace(/^company\//, "");
    const candidates = Array.from(
      new Set([sourceKey, `company/${bareSlug}`, bareSlug].filter(Boolean)),
    );

    // NOTE: `est_spend_12m` is intentionally written by a separate effect
    // (`marketSpendWriteback` below) that runs after the lane-matched
    // market-rate calc has resolved. Writing the raw IY total_shipping_cost
    // here would have Command Center / Dashboard list cards showing the
    // structurally-low importer figure for any company viewed in V2.
    const update: Record<string, any> = {
      shipments_12m:
        profile.routeKpis?.shipmentsLast12m ?? profile.totalShipments ?? null,
      teu_12m: profile.routeKpis?.teuLast12m ?? null,
      fcl_shipments_12m: profile.containers?.fclShipments12m ?? null,
      lcl_shipments_12m: profile.containers?.lclShipments12m ?? null,
      most_recent_shipment_date: profile.lastShipmentDate ?? null,
      top_route_12m: profile.routeKpis?.topRouteLast12m ?? null,
      recent_route: profile.routeKpis?.mostRecentRoute ?? null,
    };
    if (
      profile.industry &&
      (!companyEnrichment || companyEnrichment.industry == null)
    ) {
      update.industry = profile.industry;
    }
    const cleaned = Object.fromEntries(
      Object.entries(update).filter(
        ([, v]) => v !== null && v !== undefined,
      ),
    );
    if (Object.keys(cleaned).length === 0) return;

    (async () => {
      try {
        const { error } = await supabase
          .from("lit_companies")
          .update(cleaned)
          .in("source_company_key", candidates);
        if (error) {
          console.warn(
            "[CompanyProfileV2] autoHeal update failed",
            error,
          );
        }
      } catch (err) {
        console.warn("[CompanyProfileV2] autoHeal update threw", err);
      }
    })();
  }, [profile, companyId, companyEnrichment]);

  // ── Derived data (verbatim from Company.jsx 540–626) ───────────────────
  const yearScopedProfile = useMemo(() => {
    if (!profile) return null;
    return buildYearScopedProfile(profile, selectedYear) || profile;
  }, [profile, selectedYear]);

  const baseActiveProfile = yearScopedProfile || profile;
  const activeProfile = useMemo(() => {
    if (!baseActiveProfile && !companyEnrichment) return null;
    const merged: any = { ...(baseActiveProfile || {}) };
    if (companyEnrichment?.industry && !merged.industry) {
      merged.industry = companyEnrichment.industry;
    }
    if (
      companyEnrichment?.revenue != null &&
      merged.estimatedRevenue == null &&
      merged.revenue == null
    ) {
      merged.estimatedRevenue = companyEnrichment.revenue;
      merged.revenue = companyEnrichment.revenue;
    }
    if (
      companyEnrichment?.headcount != null &&
      merged.employeeCount == null &&
      merged.headcount == null
    ) {
      merged.employeeCount = companyEnrichment.headcount;
      merged.headcount = companyEnrichment.headcount;
    }
    return merged;
  }, [baseActiveProfile, companyEnrichment]);
  const activeRouteKpis = yearScopedProfile?.routeKpis || routeKpis || null;

  const shellCompany = useMemo(
    () => buildShellCompany(companyId, storedSelectedCompany),
    [companyId, storedSelectedCompany],
  );

  const companyName =
    activeProfile?.title ||
    activeProfile?.name ||
    shellCompany?.name ||
    bundle?.identity?.display?.name ||
    "Company";

  const companyDomain =
    canonicalDomain ||
    activeProfile?.domain ||
    shellCompany?.domain ||
    bundle?.identity?.display?.domain ||
    null;

  const companyWebsite =
    canonicalDomain ||
    activeProfile?.website ||
    shellCompany?.website ||
    bundle?.identity?.display?.website ||
    null;

  const companyAddress =
    activeProfile?.address ||
    shellCompany?.address ||
    [
      bundle?.identity?.display?.address?.line1,
      bundle?.identity?.display?.address?.city,
      bundle?.identity?.display?.address?.state,
    ]
      .filter(Boolean)
      .join(", ") ||
    null;

  const companyCountryCode =
    activeProfile?.countryCode ||
    shellCompany?.countryCode ||
    bundle?.identity?.display?.address?.country_code ||
    null;

  const companyCountryName =
    activeProfile?.country ||
    activeProfile?.country_name ||
    shellCompany?.country ||
    bundle?.identity?.display?.address?.country ||
    null;

  const companyPhone =
    activeProfile?.phoneNumber ||
    activeProfile?.phone ||
    shellCompany?.phone ||
    bundle?.identity?.display?.phone ||
    null;

  const years = useMemo(() => {
    return Array.from(
      new Set(
        (profile?.timeSeries || [])
          .map((point: any) => Number(point?.year))
          .filter(
            (year: number) => Number.isFinite(year) && year > 2000,
          ),
      ),
    ).sort((a: any, b: any) => b - a) as number[];
  }, [profile]);

  // Benchmark lanes — used to compute a market-rate spend override that
  // refresh-write can't revert. Loaded once on mount.
  const [benchmarkLanes, setBenchmarkLanes] = useState<FreightLane[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await loadLatestBenchmarks();
      if (!cancelled) setBenchmarkLanes(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Market-rate spend computed client-side from teu_12m + lcl_shipments
  // + matched lane rates. Overrides the database est_spend (which is
  // ImportYeti's structurally-undervalued total_shipping_cost).
  //
  // Two-tier sizing:
  //   1. Top-route match → sum(per-lane TEU × matched FBX $/TEU + LCL bench)
  //      — high accuracy when ImportYeti gave us route-level TEU.
  //   2. TEU-only fallback → total_TEU × global FBX average $/TEU + LCL bench
  //      — kicks in when top_routes is empty OR every route fails to match
  //      (large catch-all importers like Old Navy whose top_routes list is
  //      sparse). Without this fallback the header was reverting to
  //      ImportYeti's customs-disclosed total_shipping_cost (~$82K for Old
  //      Navy on 27.9K shipments — clearly wrong).
  const marketSpendBreakdown = useMemo(() => {
    if (!benchmarkLanes.length) return null;

    // CRITICAL: `buildYearScopedProfile` returns a routeKpis with all-zero
    // teu/topRoutes when the profile has no timeSeries (companies without
    // a snapshot — Old Navy, Tesla, Flexport, etc.). Trusting those zeros
    // collapses spend to $0 → fallback chain shows the broken IY value.
    // Always prefer the BASE profile data over year-scoped zeros for spend
    // sizing — year scoping is a display filter, not the source of truth.
    const baseTopRoutes =
      (Array.isArray((profile as any)?.routeKpis?.topRoutesLast12m) &&
      (profile as any).routeKpis.topRoutesLast12m.length > 0
        ? (profile as any).routeKpis.topRoutesLast12m
        : Array.isArray((profile as any)?.topRoutes) &&
            (profile as any).topRoutes.length > 0
          ? (profile as any).topRoutes
          : Array.isArray((profile as any)?.top_routes) &&
              (profile as any).top_routes.length > 0
            ? (profile as any).top_routes
            : []) as any[];

    const yearTopRoutes =
      (Array.isArray(activeRouteKpis?.topRoutesLast12m) &&
      activeRouteKpis.topRoutesLast12m.length > 0
        ? activeRouteKpis.topRoutesLast12m
        : []) as any[];

    // Use whichever has more route data. Year-scoped wins only if it
    // actually has routes; otherwise base.
    const topRoutesArr =
      yearTopRoutes.length > 0 ? yearTopRoutes : baseTopRoutes;

    // Tier-1 lane-matched calc — high accuracy ONLY when per-route TEU
    // covers most of the company's actual volume. For catch-all importers
    // (Old Navy, Tesla, Flexport) the snapshot's top_routes captures
    // <0.1% of total TEU, producing wildly low spend ($82K on 106K TEU).
    // We compute the lane match but only TRUST it when per-route TEU
    // covers ≥70% of total TEU.
    const baseTeuTotal = Number(
      (profile as any)?.routeKpis?.teuLast12m ??
        (profile as any)?.teuLast12m ??
        (profile as any)?.totalTeu ??
        0,
    );
    if (topRoutesArr.length > 0) {
      const matches = matchAllRoutesForCompany(topRoutesArr, benchmarkLanes);
      const matchedTeuSum = matches.reduce(
        (s, m) => s + (Number(m.ourTeu) || 0),
        0,
      );
      const total = matches.reduce((s, m) => s + (m.marketSpend || 0), 0);
      // Coverage gate: top_routes must explain ≥70% of total TEU OR we
      // have no total_teu reference to compare against (small importer
      // with comprehensive routes).
      const coverageOk =
        baseTeuTotal <= 0 || matchedTeuSum >= baseTeuTotal * 0.7;
      if (total > 0 && coverageOk) return total;
    }

    // Tier 2 — TEU-only fallback. Same anti-zero rule: prefer base profile
    // teu over year-scoped zero.
    const baseTeu = Number(
      (profile as any)?.routeKpis?.teuLast12m ??
        (profile as any)?.teuLast12m ??
        (profile as any)?.totalTeu ??
        0,
    );
    const yearTeu = Number(activeRouteKpis?.teuLast12m ?? 0);
    const teu = yearTeu > 0 ? yearTeu : baseTeu;
    if (!Number.isFinite(teu) || teu <= 0) return null;

    const lcl = Number(
      (profile as any)?.containers?.lclShipments12m ??
        (profile as any)?.lcl_count ??
        activeProfile?.containers?.lclShipments12m ??
        activeProfile?.lcl_count ??
        0,
    );
    const avgPerTeu =
      benchmarkLanes.reduce(
        (s, l) => s + (Number(l.rate_usd_per_teu) || 0),
        0,
      ) / benchmarkLanes.length;
    if (avgPerTeu <= 0) return null;
    const lclTeu = Math.min(Math.max(0, Math.round(lcl)), teu * 0.15);
    const fclTeu = Math.max(0, teu - lclTeu);
    const total = Math.round(fclTeu * avgPerTeu + lclTeu * 850);
    return total > 0 ? total : null;
  }, [
    benchmarkLanes,
    profile,
    activeRouteKpis?.topRoutesLast12m,
    activeRouteKpis?.teuLast12m,
    activeProfile?.containers?.lclShipments12m,
    activeProfile?.lcl_count,
  ]);

  // Phase 4 — refresh-proof market-rate writeback. Persists the lane-matched
  // spend to `lit_companies.est_spend_12m` so Command Center / Dashboard list
  // cards stop showing the IY total_shipping_cost. Runs once per company,
  // gated on benchmarkLanes being loaded so we never write the broken value.
  const marketSpendWrittenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || !companyId) return;
    if (!benchmarkLanes.length) return;
    if (marketSpendBreakdown == null || marketSpendBreakdown <= 0) return;
    const hasSnapshotData =
      Array.isArray(profile?.recentBols) && profile.recentBols.length > 0;
    if (!hasSnapshotData) return;
    if (marketSpendWrittenRef.current === companyId) return;
    marketSpendWrittenRef.current = companyId;

    const sourceKey =
      profile.key ||
      profile.companyId ||
      `company/${String(companyId).replace(/^company\//, "")}`;
    const bareSlug = String(sourceKey).replace(/^company\//, "");
    const candidates = Array.from(
      new Set([sourceKey, `company/${bareSlug}`, bareSlug].filter(Boolean)),
    );

    (async () => {
      try {
        const { error } = await supabase
          .from("lit_companies")
          .update({ est_spend_12m: Math.round(marketSpendBreakdown) })
          .in("source_company_key", candidates);
        if (error) {
          console.warn(
            "[CompanyProfileV2] market-spend writeback failed",
            error,
          );
        }
      } catch (err) {
        console.warn("[CompanyProfileV2] market-spend writeback threw", err);
      }
    })();
  }, [profile, companyId, benchmarkLanes.length, marketSpendBreakdown]);

  // Header KPIs — verbatim from Company.jsx 628–713 (with marketSpend override).
  const headerKpis = useMemo(() => {
    const teu =
      activeRouteKpis?.teuLast12m ??
      activeProfile?.teuLast12m ??
      shellCompany?.kpis?.teu ??
      null;

    // Phase 4: the EST Spend KPI is now strictly the lane-matched market
    // rate. We deliberately do NOT fall back to ImportYeti's reported
    // `total_shipping_cost` — that's the customs-disclosed value which
    // structurally undervalues high-TEU lanes (e.g. Old Navy showing $82K
    // on 27,918 shipments). When `marketSpendBreakdown` hasn't resolved
    // yet (benchmarks loading, or company has zero TEU) we show "—" rather
    // than a misleading number.
    const spend =
      marketSpendBreakdown != null && marketSpendBreakdown > 0
        ? marketSpendBreakdown
        : null;

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
      shipmentsAllTime: activeProfile?.totalShipmentsAllTime ?? null,
      teu,
      spend,
      spendAllTime:
        activeProfile?.estSpendAllTime ?? activeProfile?.estSpendUsd ?? null,
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
      contacts: bundle?.contacts?.count ?? null,
      contactsVerified:
        bundle?.contacts?.items.filter((x) => x.is_verified).length ?? null,
    };
  }, [activeProfile, activeRouteKpis, shellCompany, bundle, marketSpendBreakdown]);

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
      .map((part: string) => part.charAt(0).toUpperCase())
      .join("");
  }, [ownerName]);

  // ── Handlers (verbatim from Company.jsx 733–1112) ──────────────────────
  function showShareToast(message: string, tone: string = "info") {
    setShareToast({ message, tone });
    setTimeout(() => setShareToast(null), 3500);
  }

  async function copyToClipboardSafe(text: string) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    return false;
  }

  async function handlePulseClick(options: { forceRefresh?: boolean } = {}) {
    if (pulseLoading) return;
    const forceRefresh = Boolean(options?.forceRefresh);
    if (!forceRefresh) {
      setTab("research");
    }
    setPulseLoading(true);
    setPulseError(null);
    try {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(companyId),
        );
      const sourceKey = isUuid
        ? activeProfile?.source_company_key ||
          activeProfile?.sourceCompanyKey ||
          storedSelectedCompany?.source_company_key ||
          bundle?.identity?.key ||
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
      // Phase 4 — pass lane-matched freight market intelligence to Pulse AI
      // so the brief grounds spend talk in current FBX rates (e.g. "EAE moves
      // ~1,881 TEU/yr on Med→US East Coast — $2.1M at current rates").
      // Computed client-side because the matching logic lives in
      // freightRateBenchmark.ts and we already have it loaded for the
      // benchmark tab.
      let freightMarketIntelligence: any = null;
      try {
        if (benchmarkLanes.length > 0) {
          const topRoutesArr =
            (Array.isArray(activeRouteKpis?.topRoutesLast12m) &&
            activeRouteKpis.topRoutesLast12m.length > 0
              ? activeRouteKpis.topRoutesLast12m
              : Array.isArray(activeProfile?.topRoutes)
                ? activeProfile.topRoutes
                : Array.isArray(activeProfile?.top_routes)
                  ? activeProfile.top_routes
                  : []) as any[];
          if (topRoutesArr.length > 0) {
            const matches = matchAllRoutesForCompany(topRoutesArr, benchmarkLanes);
            const total = matches.reduce(
              (s, m) => s + (m.marketSpend || 0),
              0,
            );
            if (total > 0) {
              freightMarketIntelligence = {
                source: "FBX_LIT_extended",
                as_of_date:
                  benchmarkLanes[0]?.as_of_date ??
                  benchmarkLanes[0]?.fetched_at?.slice(0, 10) ??
                  null,
                total_market_spend_usd: Math.round(total),
                methodology:
                  "Lane spend = (FCL TEU × matched lane $/TEU) + (LCL TEU × $850 LCL benchmark). LCL TEU is bounded at min(LCL ships × 1, total TEU × 0.15). Honest, refresh-proof.",
                lane_matches: matches.map((m) => ({
                  route: m.route,
                  our_shipments_12m: m.ourShipments,
                  our_teu_12m: Math.round(m.ourTeu),
                  our_fcl_12m: m.ourFcl,
                  our_lcl_12m: m.ourLcl,
                  matched_lane_code: m.matched?.lane.lane_code ?? null,
                  matched_lane_label: m.matched?.lane.lane_label ?? null,
                  match_confidence: m.matched?.confidence ?? null,
                  rate_usd_per_teu: m.matched?.lane.rate_usd_per_teu ?? null,
                  rate_usd_per_40ft: m.matched?.lane.rate_usd_per_40ft ?? null,
                  market_spend_usd: m.marketSpend,
                })),
              };
            }
          }
        }
      } catch (mErr) {
        console.warn(
          "[CompanyProfileV2] freightMarketIntelligence build failed",
          mErr,
        );
      }

      const { data, error: invokeError } = await supabase.functions.invoke(
        "pulse-ai-enrich",
        {
          body: {
            ...(isUuid ? { company_id: companyId } : {}),
            ...(sourceKey ? { source_company_key: sourceKey } : {}),
            mode: "company_profile",
            force_refresh: forceRefresh,
            ...(freightMarketIntelligence
              ? { freight_market_intelligence: freightMarketIntelligence }
              : {}),
          },
        },
      );
      const parsedErr = invokeError
        ? await parseEdgeFunctionError(invokeError)
        : null;
      const effective: any = parsedErr || data;
      if (invokeError && !parsedErr) {
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
    } catch (err: any) {
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

  // Auto-load cached Pulse AI brief on first visit to the Pulse tab.
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
    if (
      isUuid &&
      !activeProfile &&
      !storedSelectedCompany?.source_company_key &&
      !bundle?.identity?.key
    ) {
      return;
    }
    handlePulseClick({ forceRefresh: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, companyId, activeProfile, bundle?.identity?.key]);

  async function handleManualRefreshClick() {
    if (!companyId || manualRefreshing) return;
    setManualRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await getSavedCompanyDetail(companyId, undefined, {
        forceRefresh: true,
      } as any);
      if (fresh) {
        setProfile(fresh.profile || null);
        setRouteKpis(fresh.routeKpis || null);
        setSnapshotUpdatedAt(new Date().toISOString());

        try {
          const fp: any = fresh.profile;
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
              } as any,
              profile: fp as any,
              stage: "prospect",
              source: "importyeti",
            } as any);
          }
        } catch (writebackErr) {
          console.warn(
            "[CompanyProfileV2] writeback to lit_companies failed",
            writebackErr,
          );
        }

        showShareToast("Intelligence refreshed", "success");
      }
    } catch (err: any) {
      const code = err?.code || null;
      if (code === "LIMIT_EXCEEDED") {
        const gate = err?.gate || {};
        setRefreshLimitState({
          feature: gate.feature || "company_profile_view",
          plan: gate.plan || null,
          used: gate.used ?? null,
          limit: gate.limit ?? null,
          reset_at: gate.reset_at ?? null,
          upgrade_url: gate.upgrade_url || "/app/billing",
        });
        setRefreshError(null);
      } else if (
        code === "COMPANY_PROFILE_FAILED" ||
        code === "IY_API_KEY_MISSING"
      ) {
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
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(companyId),
        );
      const sourceKey = isUuid
        ? activeProfile?.source_company_key ||
          activeProfile?.sourceCompanyKey ||
          bundle?.identity?.key ||
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
      const effective: any = parsedErr || data;
      if (invokeError && !parsedErr) throw invokeError;
      if (effective?.ok && effective.url) {
        const ok = await copyToClipboardSafe(effective.url);
        showShareToast(
          ok
            ? "Branded share link copied"
            : "Branded share link generated (copy failed — open console)",
          "success",
        );
        if (!ok)
          console.info(
            "export-company-profile signed URL:",
            effective.url,
          );
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
    } catch (err: any) {
      showShareToast(err?.message || "Share export error.", "error");
    } finally {
      setShareLoading(false);
    }
  }

  async function handleExportPdfClick() {
    if (!companyId || exportLoading) return;
    setExportLoading(true);
    try {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(companyId),
        );
      const sourceKey = isUuid
        ? activeProfile?.source_company_key ||
          activeProfile?.sourceCompanyKey ||
          bundle?.identity?.key ||
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
      const effective: any = parsedErr || data;
      if (invokeError && !parsedErr) throw invokeError;
      if (effective?.ok && effective.url) {
        if (typeof window !== "undefined") window.open(effective.url, "_blank");
      } else if (
        effective?.code === "PDF_NOT_AVAILABLE" &&
        effective?.fallback?.url
      ) {
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
    } catch (err: any) {
      showShareToast(err?.message || "PDF export error.", "error");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleSaveCompany() {
    if (!bundle?.identity || savingStar) return;
    setSavingStar(true);
    try {
      const ident = bundle.identity;
      const slug = (ident.key || `company/${ident.id ?? rawId}`).replace(
        /^company\//,
        "",
      );
      await saveCompanyToCommandCenter({
        shipper: {
          key: `company/${slug}`,
          companyId: `company/${slug}`,
          title: ident.display.name,
          name: ident.display.name,
          domain: ident.display.domain || undefined,
          website: ident.display.website || undefined,
          countryCode: ident.display.address.country_code || undefined,
        } as any,
        stage: "prospect",
        source: "importyeti",
      } as any);
      setStarred(true);
      showShareToast(starred ? "Saved" : "Saved to Command Center", "success");
    } catch (e: any) {
      showShareToast(`Couldn't save company: ${String(e?.message ?? e)}`, "error");
    } finally {
      setSavingStar(false);
    }
  }

  // ── Early return for missing companyId / load error ────────────────────
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

  // ── Initial loading skeleton ────────────────────────────────────────────
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

  // V2 directory-only state — replaces the Supply Chain tab body when the
  // resolved company exists in lit_company_directory but not in
  // lit_companies. Header / right rail / other tabs render normally so the
  // page is still useful for identity browsing.
  const isDirectoryOnly =
    bundle?.identity?.sources?.saved?.present === false &&
    bundle?.identity?.sources?.directory?.present === true;

  // ── Main layout — verbatim from Company.jsx 1148–1354 ──────────────────
  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <CDPHeader
        company={
          {
            id: companyId,
            name: companyName,
            domain: companyDomain,
            website: companyWebsite,
            address: companyAddress,
            countryCode: companyCountryCode,
            countryName: companyCountryName,
            phone: companyPhone,
          } as any
        }
        kpis={headerKpis as any}
        starred={starred}
        onToggleStar={handleSaveCompany}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        onBack={() => navigate("/app/command-center")}
        onShare={handleShareHtmlClick}
        onExportPdf={handleExportPdfClick}
        onAddToList={() => setAddToListOpen(true)}
        onStartOutreach={() => setCampaignModalOpen(true)}
        onPulse={handlePulseClick}
        onRefresh={handleManualRefreshClick}
        shareLoading={shareLoading}
        exportLoading={exportLoading}
        refreshing={refreshing}
        manualRefreshing={manualRefreshing}
        snapshotUpdatedAt={snapshotUpdatedAt}
      />

      <CompanySignalsStrip
        companyId={companyId}
        sourceCompanyKey={
          (bundle?.identity as any)?.source_company_key ??
          (bundle?.identity as any)?.sourceCompanyKey ??
          undefined
        }
      />

      {/* Tab bar — verbatim density from legacy. */}
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
            isDirectoryOnly ? (
              <DirectoryOnlyEmptyState
                companyName={companyName}
                onSave={handleSaveCompany}
                saving={savingStar}
              />
            ) : (
              <CDPSupplyChain
                profile={activeProfile as any}
                routeKpis={activeRouteKpis as any}
                selectedYear={selectedYear}
                years={years}
                onSelectYear={setSelectedYear}
              />
            )
          )}
          {tab === "live" && (
            <PulseLIVETab
              sourceCompanyKey={bundle?.identity?.key || activeProfile?.identity?.key || null}
              companyName={companyName}
            />
          )}
          {tab === "rates" && (
            <CDPRateBenchmark
              companyName={companyName}
              topRoute={
                activeRouteKpis?.topRouteLast12m ||
                activeProfile?.topRoutes?.[0]?.route ||
                activeProfile?.top_routes?.[0]?.route ||
                shellCompany?.kpis?.topRoute ||
                null
              }
              topRoutes={
                (Array.isArray(activeRouteKpis?.topRoutesLast12m) &&
                activeRouteKpis.topRoutesLast12m.length > 0
                  ? activeRouteKpis.topRoutesLast12m
                  : Array.isArray(activeProfile?.topRoutes)
                    ? activeProfile.topRoutes
                    : Array.isArray(activeProfile?.top_routes)
                      ? activeProfile.top_routes
                      : []) as any[]
              }
              teu12m={
                activeRouteKpis?.teuLast12m ??
                activeProfile?.teuLast12m ??
                shellCompany?.kpis?.teu ??
                null
              }
              fcl12m={
                activeProfile?.containers?.fclShipments12m ??
                activeProfile?.fcl_count ??
                null
              }
              lcl12m={
                activeProfile?.containers?.lclShipments12m ??
                activeProfile?.lcl_count ??
                null
              }
              ships12m={
                activeRouteKpis?.shipmentsLast12m ??
                activeProfile?.totalShipments ??
                shellCompany?.kpis?.shipments ??
                null
              }
              importyetiReportedSpend={
                activeProfile?.estSpendUsd ??
                (shellCompany as any)?.kpis?.spend ??
                null
              }
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
              } as any}
              topRoutes={
                ((): any[] => {
                  const fromKpis = activeRouteKpis?.topRoutesLast12m;
                  if (Array.isArray(fromKpis) && fromKpis.length > 0)
                    return fromKpis;
                  if (Array.isArray(activeProfile?.topRoutes))
                    return activeProfile.topRoutes;
                  if (Array.isArray(activeProfile?.top_routes))
                    return activeProfile.top_routes;
                  return [];
                })() as any
              }
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
          {tab === "revenue" && (
            <CDPRevenueOpportunity
              companyName={companyName}
              shipments12m={
                activeRouteKpis?.shipmentsLast12m ??
                activeProfile?.totalShipments ??
                shellCompany?.kpis?.shipments ??
                null
              }
              teu12m={
                activeRouteKpis?.teuLast12m ??
                activeProfile?.teuLast12m ??
                shellCompany?.kpis?.teu ??
                null
              }
              fclShipments12m={
                (activeProfile as any)?.containers?.fclShipments12m ??
                (activeProfile as any)?.fcl_count ??
                null
              }
              lclShipments12m={
                (activeProfile as any)?.containers?.lclShipments12m ??
                (activeProfile as any)?.lcl_count ??
                null
              }
              topRoutes={
                (Array.isArray(activeRouteKpis?.topRoutesLast12m) &&
                activeRouteKpis.topRoutesLast12m.length > 0
                  ? activeRouteKpis.topRoutesLast12m
                  : Array.isArray((activeProfile as any)?.topRoutes)
                    ? (activeProfile as any).topRoutes
                    : Array.isArray((activeProfile as any)?.top_routes)
                      ? (activeProfile as any).top_routes
                      : []) as any[]
              }
              benchmarkLanes={benchmarkLanes}
              hsProfile={
                (activeProfile as any)?.hsProfile ??
                (activeProfile as any)?.hs_profile ??
                (activeProfile as any)?.topProducts ??
                (activeProfile as any)?.top_products ??
                null
              }
              carrierMix={
                (activeProfile as any)?.carrierMix ??
                (activeProfile as any)?.carrier_mix ??
                (activeProfile as any)?.topCarriers ??
                (activeProfile as any)?.top_carriers ??
                null
              }
              importerSelfReportedSpend12m={
                Number(
                  (activeRouteKpis as any)?.estSpendUsd12m ??
                    (activeProfile as any)?.estSpendUsd12m ??
                    null,
                ) || null
              }
            />
          )}
          {tab === "activity" && (
            <CDPActivity companyId={companyId} ownerName={ownerName} />
          )}
          {tab === "inbox" && (
            <CompanyInboxTab companyId={companyId} navigate={navigate as any} />
          )}
        </div>
        {panelOpen && (
          <CDPDetailsPanel
            company={
              {
                domain: companyDomain,
                website: companyWebsite,
                address: companyAddress,
                countryCode: companyCountryCode,
                countryName: companyCountryName,
                phone: companyPhone,
              } as any
            }
            kpis={headerKpis as any}
            profile={activeProfile as any}
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

      {/* Toast (verbatim from Company.jsx 1356–1382) */}
      {shareToast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
        >
          <div
            className={[
              "pointer-events-auto rounded-xl border px-4 py-2.5 text-[12.5px] font-semibold shadow-lg",
              shareToast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : shareToast.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : shareToast.tone === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-slate-200 bg-white text-slate-700",
            ].join(" ")}
          >
            {shareToast.message}
          </div>
        </div>
      )}

      <AddToCampaignModal
        open={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        company={{
          company_id: bundle?.identity?.id ?? companyId,
          name: companyName,
        }}
      />

      <AddToListPicker
        open={addToListOpen}
        onClose={() => setAddToListOpen(false)}
        companyId={bundle?.identity?.id ?? null}
        companyName={companyName}
        contextQuery={
          (typeof headerKpis?.topRoute === "string"
            ? headerKpis.topRoute
            : null) || companyName || null
        }
        onSaved={(list: { name: string }) => {
          setShareToast({
            tone: "success",
            message: `Added ${companyName} to "${list.name}"`,
          });
          setTimeout(() => setShareToast(null), 3500);
        }}
      />
    </div>
  );
}

export default function CompanyProfileV2() {
  const params = useParams();
  const rawId = params.id ?? null;
  return (
    <CompanyProfileGuard rawId={rawId}>
      {(resolvedId) => (
        <V2ErrorBoundary rawId={resolvedId}>
          <ProfilePanel rawId={resolvedId} />
        </V2ErrorBoundary>
      )}
    </CompanyProfileGuard>
  );
}
