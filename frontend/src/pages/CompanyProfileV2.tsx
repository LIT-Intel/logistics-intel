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
  Factory,
  Activity,
  Inbox,
  Wrench,
  Bookmark,
  Anchor,
  TrendingUp,
  Radio,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react";
import AddToCampaignModal from "@/components/command-center/AddToCampaignModal";
import AddToListPicker from "@/features/pulse/AddToListPicker";
import { PulseLIVETab } from "@/features/pulse/PulseLIVETab";
import {
  getSavedCompanyDetail,
  getSavedCompanyShellOnly,
  getIyCompanyProfile,
  buildYearScopedProfile,
  saveCompanyToCommandCenter,
} from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { useUpgradeModal } from "@/components/billing/UpgradeModal";
import { checkExportQuota } from "@/api/entitlements";
import { capFutureDate } from "@/lib/dateUtils";
import { supabase } from "@/lib/supabase";

import CDPHeader from "@/components/company/CDPHeader";
import CompanySignalsStrip from "@/components/company/CompanySignalsStrip";
import CDPDetailsPanel from "@/components/company/CDPDetailsPanel";
import PulseCoachQuotaCard from "@/components/company/PulseCoachQuotaCard";
import CDPSupplyChain, {
  SuppliersView,
  deriveRecentBols,
} from "@/components/company/CDPSupplyChain";
import CDPContacts from "@/components/company/CDPContacts";
import EditCompanyModal from "@/components/company/EditCompanyModal";
import CDPResearch from "@/components/company/CDPResearch";
import { exportPulseBriefPdf } from "@/lib/pulse/exportPulseBriefPdf";
import { exportPulseExecutivePdf } from "@/lib/pulse/exportPulseExecutivePdf";
import CDPActivity from "@/components/company/CDPActivity";
import CDPRateBenchmark from "@/components/company/CDPRateBenchmark";
import CDPRevenueOpportunity from "@/components/company/CDPRevenueOpportunity";
import CompanyInboxTab from "@/components/company/CompanyInboxTab";
import CompanyQuotesTab from "@/features/company/CompanyQuotesTab";
import CompanyProfileGuard from "@/components/company/CompanyProfileGuard";
// Premium Intel tab was retired 2026-06-16 — its cards were folded into the
// Supply Chain tab (see frontend/src/components/intel/cards/*). The
// PremiumIntelPanel + LaneIntelTable files were deleted at the same time.
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { loadSyntheticProfile } from "@/lib/companyProfileFallback";
import {
  loadLatestBenchmarks,
  matchAllRoutesForCompany,
  type FreightLane,
} from "@/lib/freightRateBenchmark";
import { buildRevenueOpportunity } from "@/lib/revenueOpportunity";

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
  // PDF_NOT_AVAILABLE kept for backwards-compat: edge fn v34+ no longer
  // returns it (PDF and HTML both emit the same printable HTML URL), but
  // a stale-cache response from v33 could still surface this code.
  PDF_NOT_AVAILABLE: "PDF render not available — open HTML version?",
  LIMIT_EXCEEDED:
    "You've hit this month's export limit. Upgrade your plan or wait until your quota resets.",
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

// F5 trim (Wk1): 5 visible + 3 in the "More" overflow dropdown.
// Mobile-first reasoning from /plan-design-review: the tab row stayed
// within mobile viewport without horizontal scroll only after the trim.
// Pulse AI / Rate Benchmark / Revenue Opportunity live in More because
// they're high-signal but low-frequency on a typical demo path.
const VISIBLE_TABS = [
  { id: "supply", label: "Supply Chain", Icon: Workflow },
  // T4: dedicated top-level Suppliers tab. Suppliers are trade intelligence
  // (evidence behind freight opportunities), so they sit beside Supply Chain
  // — not buried under Contacts (sales execution) or a Supply-Chain sub-tab.
  { id: "suppliers", label: "Suppliers", Icon: Factory },
  { id: "live", label: "Pulse LIVE", Icon: Radio },
  { id: "contacts", label: "Contacts", Icon: Users },
  { id: "activity", label: "Activity", Icon: Activity },
  { id: "inbox", label: "Inbox", Icon: Inbox },
] as const;
const MORE_TABS = [
  // "premium" tab removed 2026-06-16 — Premium Intel cards folded into Supply Chain.
  { id: "research", label: "Pulse AI", Icon: Sparkles },
  { id: "rates", label: "Rate Benchmark", Icon: Anchor },
  { id: "revenue", label: "Revenue Opportunity", Icon: TrendingUp },
  { id: "quotes", label: "Quotes", Icon: FileText },
] as const;
const TABS = [...VISIBLE_TABS, ...MORE_TABS] as const;
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

/**
 * Tab bar with 5 visible + More dropdown (F5).
 *
 * Pulled out of the main render so the dropdown state (open/close, outside
 * click, ESC) stays local. The active-in-overflow case highlights the More
 * button itself so the user always knows where they are.
 */
function CompanyTabsRow({
  tab,
  onSelect,
}: {
  tab: TabId;
  onSelect: (id: TabId) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  // Premium Intel was retired 2026-06-16 — no more per-tab entitlement
  // filtering needed; every MORE_TABS entry shows for every user.
  const moreTabs = MORE_TABS;
  const activeInOverflow = moreTabs.some((t) => t.id === tab);

  // Outside-click dismissal.
  useEffect(() => {
    if (!moreOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const el = moreRef.current;
      if (el && !el.contains(e.target as Node)) setMoreOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [moreOpen]);

  return (
    <div
      role="tablist"
      aria-label="Company sections"
      className="relative flex shrink-0 items-center gap-0 border-b border-slate-200 bg-white px-3 sm:px-6"
    >
      {VISIBLE_TABS.map((t) => {
        const Icon = t.Icon;
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(t.id)}
            className={[
              "font-display -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[12.5px] font-semibold transition-colors sm:px-3.5",
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
      <div ref={moreRef} className="relative ml-auto sm:ml-1">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
          className={[
            "font-display -mb-px inline-flex items-center gap-1 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[12.5px] font-semibold transition-colors sm:px-3.5",
            activeInOverflow
              ? "border-blue-500 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-700",
          ].join(" ")}
        >
          More
          <ChevronDown
            className={[
              "h-3 w-3 transition-transform",
              moreOpen ? "rotate-180" : "",
            ].join(" ")}
            aria-hidden
          />
        </button>
        {moreOpen && (
          <div
            role="menu"
            aria-label="More company sections"
            className="absolute right-0 top-[calc(100%+4px)] z-[400] w-[240px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            {moreTabs.map((t) => {
              const Icon = t.Icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelect(t.id);
                    setMoreOpen(false);
                  }}
                  className={[
                    "font-display flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-[12.5px] font-semibold transition-colors last:border-b-0",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-3 w-3" />
                    {t.label}
                  </span>
                  <ChevronRight className="h-3 w-3 text-slate-400" aria-hidden />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
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
  // Premium Intel tab was retired 2026-06-16 — its cards were folded into
  // the Supply Chain tab. Entitlement gating was removed at the same time.

  // Aggregator-side identity (drives directory-only branch + canonical UUID
  // when the URL param is a slug). The legacy page derives companyId from
  // the URL param + localStorage; V2 keeps that path AND additionally uses
  // the resolver to surface a clean directory-only state when the company
  // isn't in lit_companies.
  const { data: bundle, refetch: refetchBundle } = useCompanyProfile(rawId, {
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

  // Synchronous fallback to the raw route id so loaders never see null while
  // the async slug→UUID resolver is in flight. For UUID inputs the resolver
  // sets resolvedCompanyId on the first useEffect pass; for slug inputs the
  // raw slug flows through to loaders which already normalize (e.g.
  // usePulseLiveData strips the "company/" prefix). Once the resolver
  // returns a UUID the loaders re-fire with the canonical id.
  const companyId = resolvedCompanyId || routeOrStoredId;

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
    return (["supply", "suppliers", "live", "rates", "contacts", "research", "activity", "inbox", "quotes"] as const).includes(
      t as TabId,
    )
      ? (t as TabId)
      : "supply";
  })();
  const [tab, setTab] = useState<TabId>(initialTab);
  useEffect(() => {
    const t = String(searchParams?.get("tab") || "").toLowerCase();
    if (
      (["supply", "suppliers", "live", "rates", "contacts", "research", "activity", "inbox", "quotes"] as const).includes(
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
  // Enrichment Phase 2 — Edit Company modal (header pencil affordance).
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);

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

  // Server-side PDF export gate. The PDF generators below run client-side
  // (jsPDF), so a client-only entitlement hint is bypassable. checkExportQuota
  // hits export-company-profile intent='check' which enforces export_pdf via
  // check_usage_limit (the real boundary) and consumes one unit on ok.
  const upgradeModal = useUpgradeModal();

  // ── Cached-first load (verbatim from Company.jsx 354–418) ──────────────
  useEffect(() => {
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

      // Cache miss self-heal. Opening a company straight from a search result
      // used to show an EMPTY profile until a hard refresh: the snapshot is
      // written by a background pre-warm (getIyCompanyProfile, ~10-15s) that
      // hasn't landed when this cache-only read runs. Instead of giving up,
      // fetch the profile ourselves (cache-driven / forceRefresh:false = FREE,
      // no extra credit), then re-read the snapshot. Only for slug keys —
      // a bare-UUID deep-link with no snapshot is handled by the synthetic
      // fallback below, not a live fetch.
      if (!cached.profile && !cached.routeKpis) {
        const bareKey = String(routeOrStoredId || "").replace(/^company\//i, "");
        if (bareKey && !UUID_RE.test(bareKey)) {
          try {
            await getIyCompanyProfile({ companyKey: bareKey });
            if (cancelled) return;
            cached = await getSavedCompanyShellOnly(companyId);
          } catch (liveErr) {
            if (cancelled) return;
            console.warn(
              "[CompanyProfileV2] cache-miss live profile fetch failed",
              liveErr,
            );
          }
          if (cancelled) return;
        }
      }

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
      // 12-month rolling only — `lit_company_index.shipments_12m` is a
      // 12mo column, so we must not pollute it with `profile.totalShipments`
      // (which can resolve to the lifetime BOL count when no 12m field is
      // present on the snapshot — see Task 14 root cause).
      shipments_12m: profile.routeKpis?.shipmentsLast12m ?? null,
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

  // Real trade KPIs + top routes for the Executive Brief PDF. Mirrors the
  // exact derivation passed to <CDPResearch tradeKpis={...} topRoutes={...}/>
  // (see the render below ~2292) so the exported PDF shows the SAME real
  // importyeti numbers the modal renders — not the LLM's fabricated ones.
  const pdfTradeKpis = useMemo(() => {
    const top =
      (activeProfile as any)?.topRoutes?.[0] ||
      (activeProfile as any)?.top_routes?.[0] ||
      null;
    const total = Number(
      activeRouteKpis?.shipmentsLast12m ?? shellCompany?.kpis?.shipments,
    );
    const topShip = Number(top?.shipments);
    const topLaneShare =
      total && topShip && total > 0 ? topShip / total : null;
    return {
      shipments12m:
        activeRouteKpis?.shipmentsLast12m ??
        shellCompany?.kpis?.shipments ??
        null,
      teu12m:
        activeRouteKpis?.teuLast12m ??
        (activeProfile as any)?.totalTeuAllTime ??
        null,
      activeLanes: Array.isArray((activeProfile as any)?.topRoutes)
        ? (activeProfile as any).topRoutes.length
        : Array.isArray((activeProfile as any)?.top_routes)
          ? (activeProfile as any).top_routes.length
          : null,
      topLaneLabel:
        activeRouteKpis?.topRouteLast12m ||
        (activeProfile as any)?.topRoutes?.[0]?.route ||
        (activeProfile as any)?.top_routes?.[0]?.route ||
        null,
      topLaneShare,
      yoyPct: null,
    };
  }, [activeProfile, activeRouteKpis, shellCompany]);

  const pdfTopRoutes = useMemo<any[]>(() => {
    const fromKpis = activeRouteKpis?.topRoutesLast12m;
    if (Array.isArray(fromKpis) && fromKpis.length > 0) return fromKpis as any[];
    if (Array.isArray((activeProfile as any)?.topRoutes))
      return (activeProfile as any).topRoutes;
    if (Array.isArray((activeProfile as any)?.top_routes))
      return (activeProfile as any).top_routes;
    return [];
  }, [activeProfile, activeRouteKpis]);

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

  // Year-aware EST. SPEND — founder directive:
  //   - selectedYear === currentYear → trailing 12M (`marketSpendBreakdown`)
  //   - selectedYear  <  currentYear → calendar-year sum of
  //     timeSeries TEU × current FBX avg $/TEU + LCL bench (Tier-2 only;
  //     per-lane TEU isn't year-scoped in the snapshot, so we use the same
  //     teu-only fallback the 12M calc falls back to). Past-year rates are
  //     CURRENT FBX rates (clearly labeled "current rates") since the
  //     historical rate table only goes back ~12 months.
  //
  // Anti-zero: when the selected past year has no timeSeries rows, returns
  // null so the tile renders "—" instead of fabricating a value.
  const currentYearForSpend = new Date().getFullYear();

  // EST. SPEND (ALL-TIME) — sum every month in the snapshot's timeSeries
  // (normalized from `parsed_summary.monthly_volumes`) at current FBX
  // $/TEU. Companion to `marketSpendBreakdown` (trailing-12M) and
  // `pastYearSpend` (calendar-year). Founder spec: header tile 1 shows
  // total importer freight spend across all available history; tile 2
  // shows year-aware annual/12M spend.
  //
  // Outlier guard: a small number of ImportYeti snapshots have bogus
  // monthly TEU values (e.g. Indorama 2024-04 reports 553,647 TEU on 1
  // shipment — physically impossible). We drop any month whose
  // TEU/shipments ratio exceeds 200 (the largest container ship holds
  // ~24K TEU and no single importer-shipment moves that much). Without
  // this guard the all-time tile would render >$1B for Indorama and
  // similar offenders, which would be worse than the legacy bug.
  //
  // Rate methodology mirrors `pastYearSpend`: global FBX avg $/TEU
  // applied to FCL TEU, $850/TEU for LCL (Tier-2 fallback). Honest
  // limitation: current FBX rates are applied to historical TEU; we
  // disclose this on the tile when older years dominate the mix.
  const spendAllTime = useMemo(() => {
    if (!benchmarkLanes.length) return null;
    const series = Array.isArray((profile as any)?.timeSeries)
      ? (profile as any).timeSeries
      : [];
    if (!series.length) return null;
    let teuSum = 0;
    let lclSum = 0;
    for (const point of series) {
      const teu = Number(point?.teu) || 0;
      const ships = Number(point?.shipments) || 0;
      if (teu <= 0) continue;
      // Drop outlier months (data-quality guard — see comment above).
      if (ships > 0 && teu / ships > 200) continue;
      teuSum += teu;
      lclSum += Number(point?.lclShipments) || 0;
    }
    if (!Number.isFinite(teuSum) || teuSum <= 0) return null;
    const avgPerTeu =
      benchmarkLanes.reduce(
        (s, l) => s + (Number(l.rate_usd_per_teu) || 0),
        0,
      ) / benchmarkLanes.length;
    if (!Number.isFinite(avgPerTeu) || avgPerTeu <= 0) return null;
    const lclTeu = Math.min(Math.max(0, Math.round(lclSum)), teuSum * 0.15);
    const fclTeu = Math.max(0, teuSum - lclTeu);
    const total = Math.round(fclTeu * avgPerTeu + lclTeu * 850);
    return total > 0 ? total : null;
  }, [profile, benchmarkLanes]);

  const pastYearSpend = useMemo(() => {
    if (selectedYear === currentYearForSpend) return null;
    if (!benchmarkLanes.length) return null;
    const series = Array.isArray((profile as any)?.timeSeries)
      ? (profile as any).timeSeries
      : [];
    if (!series.length) return null;
    const yearPoints = series.filter(
      (point: any) => Number(point?.year) === Number(selectedYear),
    );
    if (!yearPoints.length) return null;
    const teu = yearPoints.reduce(
      (s: number, p: any) => s + (Number(p?.teu) || 0),
      0,
    );
    if (!Number.isFinite(teu) || teu <= 0) return null;
    const lcl = yearPoints.reduce(
      (s: number, p: any) => s + (Number(p?.lclShipments) || 0),
      0,
    );
    const avgPerTeu =
      benchmarkLanes.reduce(
        (s, l) => s + (Number(l.rate_usd_per_teu) || 0),
        0,
      ) / benchmarkLanes.length;
    if (!Number.isFinite(avgPerTeu) || avgPerTeu <= 0) return null;
    const lclTeu = Math.min(Math.max(0, Math.round(lcl)), teu * 0.15);
    const fclTeu = Math.max(0, teu - lclTeu);
    const total = Math.round(fclTeu * avgPerTeu + lclTeu * 850);
    return total > 0 ? total : null;
  }, [selectedYear, currentYearForSpend, profile, benchmarkLanes]);

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
    //
    // Year-aware: when a past year is selected, the spend value is
    // sourced from `pastYearSpend` (calendar-year TEU × current FBX
    // rates); when current year is selected, the trailing-12M
    // `marketSpendBreakdown` is used. CDPHeader renders the appropriate
    // label based on `spendYearLabel`.
    const spendIsPastYear = selectedYear !== currentYearForSpend;
    const spend = spendIsPastYear
      ? pastYearSpend != null && pastYearSpend > 0
        ? pastYearSpend
        : null
      : marketSpendBreakdown != null && marketSpendBreakdown > 0
        ? marketSpendBreakdown
        : null;

    const profileLatest = getLatestShipmentFromProfile(activeProfile);
    const shellLatest = capDateAtToday(
      normalizeDateValue(shellCompany?.kpis?.latestShipment),
    );

    return {
      // 12-month rolling BOL count. Sources, in priority order:
      //   1. activeRouteKpis.shipmentsLast12m — explicit 12mo from
      //      _shared/importyeti_fetch.ts route_kpis
      //   2. shellCompany.kpis.shipments — lit_company_index.total_shipments
      //      which is itself the 12-month rolling number (the search-result
      //      cards already use this and label it "(12m)")
      // We deliberately do NOT fall back to activeProfile.totalShipments —
      // that field is derived from `shipments_last_12m ?? total_shipments`
      // in api.ts, so it silently leaks the *lifetime* value when the
      // snapshot doesn't carry a 12m number (Task 14 root cause: EAE
      // showing 506 lifetime on the profile page while the search-card
      // showed 243 12mo for the same company).
      //
      // FOLLOW-UP FIX: read from UNSCOPED `routeKpis` (not
      // `activeRouteKpis`). `buildYearScopedProfile` overwrites
      // `shipmentsLast12m` with a year-scoped sum — for 2026 that's
      // just Jan-May = ~126, displayed under a "(12M)" label that
      // should mean trailing 12 months (true value ~259 for EAE).
      // The trailing-12M tile should be independent of the year
      // selector; year-specific values render in their own tiles.
      shipments:
        routeKpis?.shipmentsLast12m ??
        (profile as any)?.routeKpis?.shipmentsLast12m ??
        shellCompany?.kpis?.shipments ??
        null,
      shipmentsAllTime: activeProfile?.totalShipmentsAllTime ?? null,
      teu,
      spend,
      // Founder directive (header v8): tile 1 = EST. SPEND (ALL-TIME) lead,
      // tile 2 = EST. SPEND (ANNUAL/12M). We deliberately ignore the
      // ImportYeti-derived `estSpendAllTime` / `estSpendUsd` fields here
      // because they're customs-disclosed values (the same source that
      // showed $82K for Old Navy on 27.9K shipments). The lane-rate
      // proxy in `spendAllTime` is honest at the right order of magnitude.
      spendAllTime,
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
      // Est. Annual Revenue Opportunity — same inputs as the Revenue tab so
      // the lead KPI tile and the Revenue tab agree to the dollar. Returns
      // 0 when no service line could be sized (insufficient inputs); the
      // header renders "—" in that case rather than a fabricated zero.
      estRevOpp: (() => {
        // 12-month rolling only — read UNSCOPED routeKpis (same reason
        // as headerKpis.shipments above: year selector shouldn't clobber
        // the trailing-12M denominator of the revenue-opportunity calc).
        const shipments12m =
          routeKpis?.shipmentsLast12m ??
          (profile as any)?.routeKpis?.shipmentsLast12m ??
          shellCompany?.kpis?.shipments ??
          null;
        const t =
          activeRouteKpis?.teuLast12m ??
          activeProfile?.teuLast12m ??
          shellCompany?.kpis?.teu ??
          null;
        const fcl12 =
          (activeProfile as any)?.containers?.fclShipments12m ??
          (activeProfile as any)?.fcl_count ??
          null;
        const lcl12 =
          (activeProfile as any)?.containers?.lclShipments12m ??
          (activeProfile as any)?.lcl_count ??
          null;
        const topRoutes =
          (Array.isArray(activeRouteKpis?.topRoutesLast12m) &&
          activeRouteKpis!.topRoutesLast12m!.length > 0
            ? activeRouteKpis!.topRoutesLast12m
            : Array.isArray((activeProfile as any)?.topRoutes)
              ? (activeProfile as any).topRoutes
              : Array.isArray((activeProfile as any)?.top_routes)
                ? (activeProfile as any).top_routes
                : []) as any[];
        const hsProfile =
          (activeProfile as any)?.hsProfile ??
          (activeProfile as any)?.hs_profile ??
          (activeProfile as any)?.topProducts ??
          (activeProfile as any)?.top_products ??
          null;
        const carrierMix =
          (activeProfile as any)?.carrierMix ??
          (activeProfile as any)?.carrier_mix ??
          (activeProfile as any)?.topCarriers ??
          (activeProfile as any)?.top_carriers ??
          null;
        const importerSpend =
          Number(
            (activeRouteKpis as any)?.estSpendUsd12m ??
              (activeProfile as any)?.estSpendUsd12m ??
              null,
          ) || null;
        try {
          const report = buildRevenueOpportunity({
            companyName: null,
            shipments12m,
            teu12m: t,
            fclShipments12m: fcl12,
            lclShipments12m: lcl12,
            topRoutes,
            benchmarkLanes,
            hsProfile,
            carrierMix,
            importerSelfReportedSpend12m: importerSpend,
          });
          return report.totalAddressableSpend > 0
            ? report.totalAddressableSpend
            : null;
        } catch {
          return null;
        }
      })(),
      // Year-aware label for the ANNUAL spend tile (tile 2). CDPHeader
      // uses this verbatim so the tile label always agrees with the
      // value's temporal scope.
      //   - current year selected → "EST. SPEND (12M)" (trailing window)
      //   - past year selected    → "EST. SPEND (2025)" (calendar year)
      // The trailing-12M is more honest than "YTD" for the current-year
      // case because `marketSpendBreakdown` is a trailing-12M figure,
      // not a strict YTD sum. Past years use current FBX $/TEU applied
      // to historical TEU — same limitation as `spendAllTime`.
      spendLabel: spendIsPastYear
        ? `EST. SPEND (${selectedYear})`
        : "EST. SPEND (12M)",
    };
  }, [
    activeProfile,
    activeRouteKpis,
    shellCompany,
    bundle,
    marketSpendBreakdown,
    benchmarkLanes,
    pastYearSpend,
    spendAllTime,
    selectedYear,
    currentYearForSpend,
  ]);

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
              // Forward the user's current CRM stage so the writeback
              // (which upserts into lit_saved_companies) never resets
              // a stage the user explicitly chose. Default to "lead"
              // for first-time saves; legacy values are mapped server-
              // side by the save-company edge function.
              stage:
                bundle?.identity?.sources?.saved?.stage ?? "lead",
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
            // intent='share' tells the edge fn to bypass the export_pdf
            // quota gate — Share Link is acquisition (recipients see LIT
            // branding), so we don't bill the user for it. Without this
            // flag, free-trial users would hit a silent 403 and the
            // button would appear to do nothing.
            intent: "share",
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
      // Direct client-side jsPDF export — same approach Pulse LIVE uses
      // for exportPulseLiveReportPdf(). Earlier attempts went through
      // Supabase Storage (text/plain content-type bug) and then through
      // a blob-URL + window.print() flow (browser-print clipping cut
      // the brief off after ~2 paragraphs). jsPDF draws the document
      // section-by-section so the output is byte-for-byte deterministic
      // regardless of browser, zoom, popup blocker, or print dialog.
      if (!pulseBrief) {
        showShareToast("Generate the Pulse brief first.", "warning");
        return;
      }
      // Server-side export_pdf gate BEFORE any client-side generation. On a
      // free-trial account (export_pdf=0) the server returns 403/LIMIT_EXCEEDED
      // and we surface the UpgradeModal + abort instead of silently generating.
      const quota = await checkExportQuota();
      if (!quota.ok) {
        upgradeModal.show(quota.limit);
        return;
      }
      const companyDisplayName =
        bundle?.identity?.display?.name ||
        activeProfile?.company_name ||
        activeProfile?.name ||
        "Company";
      // 2026-06-17: switched to the executive PDF generator. Single
      // PDF surface across the app — exec-grade brand, infographic
      // KPIs, talking points, objections, sources. The old
      // exportPulseBriefPdf (sales-rep grade) is still on disk but no
      // longer wired up here.
      exportPulseExecutivePdf({
        companyName: companyDisplayName,
        domain: bundle?.identity?.display?.domain ?? activeProfile?.domain ?? null,
        industry: bundle?.identity?.display?.industry ?? activeProfile?.industry ?? null,
        hq: bundle?.identity?.display?.hq_city ?? activeProfile?.city ?? null,
        brief: pulseBrief as any,
        // Real importyeti snapshot KPIs — same numbers the modal renders.
        tradeKpis: pdfTradeKpis as any,
        topRoutes: pdfTopRoutes as any,
        generatedAt: pulseBrief?.generatedAt
          ? new Date(pulseBrief.generatedAt)
          : new Date(),
      });
      showShareToast("Executive brief downloaded.", "success");
    } catch (err: any) {
      showShareToast(err?.message || "PDF export error.", "error");
    } finally {
      setExportLoading(false);
    }
  }

  /**
   * Executive Pre-Call Brief — premium PDF for sharing with execs ahead
   * of a discovery call. Uses the same pulseBrief snapshot but renders a
   * navy-branded multi-page brief: cover w/ opportunity grade, at-a-
   * glance KPI tiles, why-now, pre-call talking points, likely objections
   * + responses, best-contact card, lane intel, source list. If the
   * cached brief doesn't carry an executive_overview yet, falls back
   * gracefully with placeholder pages so the user knows to refresh.
   */
  async function handleExportExecutivePdfClick() {
    setExportLoading(true);
    try {
      if (!pulseBrief) {
        showShareToast("Generate the Pulse brief first.", "warning");
        return;
      }
      // Server-side export_pdf gate before client-side generation (see above).
      const quota = await checkExportQuota();
      if (!quota.ok) {
        upgradeModal.show(quota.limit);
        return;
      }
      const companyDisplayName =
        bundle?.identity?.display?.name ||
        activeProfile?.company_name ||
        activeProfile?.name ||
        "Company";
      exportPulseExecutivePdf({
        companyName: companyDisplayName,
        domain: bundle?.identity?.display?.domain ?? activeProfile?.domain ?? null,
        industry: bundle?.identity?.display?.industry ?? activeProfile?.industry ?? null,
        hq: bundle?.identity?.display?.hq_city ?? activeProfile?.city ?? null,
        brief: pulseBrief as any,
        // Real importyeti snapshot KPIs — same numbers the modal renders.
        tradeKpis: pdfTradeKpis as any,
        topRoutes: pdfTopRoutes as any,
        generatedAt: pulseBrief?.generatedAt
          ? new Date(pulseBrief.generatedAt)
          : new Date(),
      });
      showShareToast("Executive brief downloaded.", "success");
    } catch (err: any) {
      showShareToast(err?.message || "Executive brief export error.", "error");
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
        isSaved={
          bundle?.identity?.sources?.saved?.present === true || starred
        }
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
        availableYears={(() => {
          // 3-year window: current + 2 prior. Union with any years the
          // snapshot's timeSeries actually has (so older history surfaces
          // when available, but the selector is never hidden just because
          // the snapshot lacks a 2025 row).
          const cy = currentYearForSpend;
          const base = [cy, cy - 1, cy - 2];
          const merged = Array.from(new Set([...base, ...years])).sort(
            (a, b) => b - a,
          );
          return merged.slice(0, 3);
        })()}
        selectedYear={selectedYear}
        onSelectYear={setSelectedYear}
        onEditCompany={
          companyId ? () => setEditCompanyOpen(true) : undefined
        }
      />

      <CompanySignalsStrip
        companyId={companyId}
        sourceCompanyKey={
          (bundle?.identity as any)?.source_company_key ??
          (bundle?.identity as any)?.sourceCompanyKey ??
          undefined
        }
      />

      {/* Tab bar — F5 trim: 5 visible + More overflow. The More dropdown
          surfaces Pulse AI / Rate Benchmark / Revenue Opportunity without
          horizontal scroll on mobile. */}
      <CompanyTabsRow tab={tab} onSelect={setTab} />


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
                onOpenPulseLive={() => setTab("live")}
                companyName={companyName}
              />
            )
          )}
          {tab === "suppliers" && (
            <SuppliersView
              profile={activeProfile as any}
              recentBols={deriveRecentBols(activeProfile)}
              companyName={companyName}
            />
          )}
          {tab === "live" && (
            <PulseLIVETab
              // Broadened key derivation (regression fix): the old single
              // `bundle.identity.key` went null whenever the bundle hadn't
              // resolved, leaving Pulse LIVE empty even though BOLs exist.
              // Mirror the Rate-Benchmark fallback chain so any available key
              // (source_company_key / slug / route id) resolves the shipments.
              sourceCompanyKey={
                (bundle?.identity as any)?.source_company_key ??
                (bundle?.identity as any)?.sourceCompanyKey ??
                bundle?.identity?.key ??
                (activeProfile as any)?.identity?.key ??
                (activeProfile as any)?.source_company_key ??
                (activeProfile as any)?.sourceCompanyKey ??
                (activeProfile as any)?.key ??
                companyId ??
                null
              }
              companyName={companyName}
            />
          )}
          {/* Premium Intel tab was retired 2026-06-16. If a user deep-links
              with ?tab=premium we transparently redirect by leaving no
              renderer; the body stays empty and the More menu no longer
              offers the tab. The premium-folded cards now live in the
              Supply Chain tab. */}
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
                // 12-month rolling only — never fall back to
                // activeProfile.totalShipments (can be lifetime). See
                // headerKpis.shipments comment for full rationale.
                activeRouteKpis?.shipmentsLast12m ??
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
              onCompanyMetaSaved={(next) => {
                // R3: the user saved name/domain edits from the search
                // panel. Update the canonical domain state immediately
                // (so the header pill repaints) and refetch the bundle
                // so KPI/profile sources stay in sync.
                if (next.domain) setCanonicalDomain(next.domain);
                refetchBundle?.();
              }}
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
                // 12-month rolling only (Task 14). activeProfile.totalShipments
                // excluded — see headerKpis.shipments rationale above.
                shipments12m:
                  activeRouteKpis?.shipmentsLast12m ??
                  shellCompany?.kpis?.shipments ??
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
                    // 12-month rolling only — never lifetime (Task 14)
                    activeRouteKpis?.shipmentsLast12m ??
                      shellCompany?.kpis?.shipments,
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
              onExportExecutivePdf={handleExportExecutivePdfClick}
              shareLoading={shareLoading}
              exportLoading={exportLoading}
              navigate={navigate}
            />
          )}
          {tab === "revenue" && (
            <CDPRevenueOpportunity
              companyName={companyName}
              shipments12m={
                // 12-month rolling only (Task 14). See headerKpis.shipments
                // for why activeProfile.totalShipments is excluded.
                activeRouteKpis?.shipmentsLast12m ??
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
              sourceCompanyKey={
                (bundle?.identity as any)?.source_company_key ??
                (bundle?.identity as any)?.sourceCompanyKey ??
                (bundle?.identity as any)?.key ??
                (activeProfile as any)?.identity?.key ??
                (activeProfile as any)?.source_company_key ??
                null
              }
            />
          )}
          {tab === "activity" && (
            <CDPActivity companyId={companyId} ownerName={ownerName} />
          )}
          {tab === "inbox" && (
            <CompanyInboxTab companyId={companyId} navigate={navigate as any} />
          )}
          {tab === "quotes" && companyId && (
            <CompanyQuotesTab companyId={companyId} />
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
            onOpenSuppliersTab={() => setTab("suppliers")}
            crmStage={
              bundle?.identity?.sources?.saved?.present === true
                ? (bundle?.identity?.sources?.saved?.stage ?? null)
                : null
            }
            companyId={(() => {
              // Wire the CRM stage selector to the canonical UUID from
              // `lit_saved_companies.company_id` first — that's the value
              // the `update_saved_company_stage` RPC expects. Fall back to
              // `bundle.identity.id` only when it's a valid UUID. Never
              // pass a slug; the RPC rejects non-UUID input and the
              // selector's UUID regex would flip the button to read-only
              // anyway. Returning null here puts the selector into its
              // static-pill mode rather than rendering a broken chevron.
              const UUID_RE =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              const savedCompanyId =
                bundle?.identity?.sources?.saved?.company_id ?? null;
              if (savedCompanyId && UUID_RE.test(savedCompanyId)) {
                return savedCompanyId;
              }
              const identityId = bundle?.identity?.id ?? null;
              if (identityId && UUID_RE.test(identityId)) {
                return identityId;
              }
              return null;
            })()}
            savedPresent={
              bundle?.identity?.sources?.saved?.present === true
            }
            onStageChange={() => {
              // Refetch the company bundle so any other consumers of
              // `bundle.identity.sources.saved.stage` see the new value
              // (e.g. the writeback path in handleManualRefreshClick
              // and the bottom Pulse rail that mirrors the same stage).
              try {
                refetchBundle?.();
              } catch {
                /* non-fatal */
              }
            }}
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

      {editCompanyOpen && companyId && (
        <EditCompanyModal
          companyId={companyId}
          initial={{
            name: companyName,
            domain: companyDomain,
            website: companyWebsite,
            industry:
              companyEnrichment?.industry ||
              companyEnrichment?.enrichment_params?.firmographics?.industry ||
              null,
            headcount: companyEnrichment?.headcount ?? null,
          }}
          onClose={() => setEditCompanyOpen(false)}
          onSaved={(updated) => {
            if (updated.domain) setCanonicalDomain(updated.domain);
            // Merge new industry/headcount into local enrichment state
            // so the right rail / KPI tiles reflect the save before the
            // bundle refetch completes.
            if (updated.industry || updated.headcount != null) {
              setCompanyEnrichment((prev: any) => ({
                ...(prev ?? {}),
                industry: updated.industry ?? prev?.industry ?? null,
                headcount: updated.headcount ?? prev?.headcount ?? null,
              }));
            }
            refetchBundle?.();
            setShareToast({
              tone: "success",
              message: "Company profile saved.",
            });
            setTimeout(() => setShareToast(null), 3500);
          }}
        />
      )}
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
