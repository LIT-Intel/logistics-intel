import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Download,
  Globe,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Route,
  Send,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
// Phase B.9 — the hero no longer renders the dark KPI strip, so the
// `formatNumber` / `formatCurrency` / `formatDate` display helpers and
// `HeroKpiTile` are gone. The KPI row lives inside `CompanyDetailPanel`
// (approach 1) and reads `detail.shipments` / `detail.teu` / `detail.spend`
// / `canonicalLanes` / `phantomContacts` / `isContactVerified` directly
// from the panel's own scope. Date helpers stay because `headerKpis`
// still feeds `headerRecord` (panel reads it via `record.company.kpis`).
import AddToCampaignModal from "@/components/command-center/AddToCampaignModal";
import {
  getSavedCompanyDetail,
  getSavedCompanyShellOnly,
  buildYearScopedProfile,
} from "@/lib/api";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import CompanyDetailPanel from "@/components/command-center/CompanyDetailPanel";
import { flagFromCode, resolveEndpoint } from "@/lib/laneGlobe";
import { capFutureDate } from "@/lib/dateUtils";
import { supabase } from "@/lib/supabase";

// Phase B.16 — friendly copy for pulse-brief / export-company-profile
// error codes returned by the Edge Functions. Anything not in this map
// falls back to the raw `error` string so we never silently swallow an
// upstream message. Provider names (Tavily / Gemini / etc.) are NEVER
// surfaced to the user — only neutral phrases like "AI brief search
// source" or "web search".
const PULSE_ERROR_COPY = {
  TAVILY_NOT_CONFIGURED:
    "AI brief search source not configured. Ask your admin to enable it.",
  TAVILY_FAILED:
    "Web search failed. Try again in a moment.",
  INVALID_INPUT: "We couldn't read this company's identity to build a brief.",
  UNAUTHORIZED: "Sign in again to generate an AI brief.",
  SUPABASE_NOT_CONFIGURED:
    "AI brief service is missing core configuration. Contact support.",
};

const EXPORT_ERROR_COPY = {
  STORAGE_NOT_PROVISIONED:
    "Storage bucket not configured. Page link copied instead.",
  PDF_NOT_AVAILABLE: "PDF render not available — open HTML version?",
  COMPANY_NOT_FOUND: "We couldn't find this company in the database.",
  COMPANY_FETCH_FAILED:
    "Couldn't load company details for export. Try again in a moment.",
  UPLOAD_FAILED:
    "Couldn't upload the export. Try again in a moment.",
  SIGN_FAILED:
    "Couldn't generate a share link. Try again in a moment.",
  INVALID_INPUT: "Export request was malformed.",
  UNAUTHORIZED: "Sign in again to export this profile.",
  SUPABASE_NOT_CONFIGURED:
    "Export service is missing core configuration. Contact support.",
};

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

// Phase B.5 — delegate to the shared cap-future-date helper so the
// hero's "Latest Shipment" KPI never out-runs the wall clock. Local
// helper name retained because multiple call sites in this file already
// reference `capDateAtToday`.
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

/**
 * Phase B.9 — the dark navy hero KPI strip is GONE. KPIs now live in a
 * floating bridge row rendered inside `CompanyDetailPanel` (approach 1
 * from the Phase B.9 brief: the panel already owns `detail.shipments`,
 * `detail.teu`, `canonicalLanes`, `phantomContacts`, `isContactVerified`,
 * so we keep the KPI row close to its data source rather than re-lifting
 * everything to Company.jsx). The hero is now light (`bg-white`) with a
 * glossy translucent blue right-zone action panel.
 */

export default function Company() {
  const navigate = useNavigate();
  const { id } = useParams();

  const decodedRouteId = useMemo(() => {
    try {
      return id ? decodeURIComponent(id) : null;
    } catch {
      return id || null;
    }
  }, [id]);

  const storedSelectedCompany = useMemo(() => getStoredSelectedCompany(), []);
  const companyId = decodedRouteId || storedSelectedCompany?.company_id || null;

  const [profile, setProfile] = useState(null);
  const [routeKpis, setRouteKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  // Phase B.15 — cached-first profile load. `refreshing` is true while a
  // background ImportYeti fetch is running on top of cached data, so the
  // page can render the snapshot instantly and surface a subtle pill that
  // says we're sharpening the data. `snapshotUpdatedAt` is the cache row's
  // own timestamp from `lit_importyeti_company_snapshot.updated_at` — used
  // by the staleness check (>7 days triggers a background refresh) and
  // also rendered for honesty if the user wants to know how fresh this is.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  // Phase B.16 — Pulse brief modal state. The pulse-brief Edge Function
  // assembles a deepened pre-call brief from saved snapshot fields and
  // public web context (no provider name surfaced to the user). We cache
  // the response in component state so closing/reopening the modal does
  // not re-fetch; the function itself also caches into
  // lit_saved_companies.gemini_brief.
  const [pulseModalOpen, setPulseModalOpen] = useState(false);
  const [pulseLoading, setPulseLoading] = useState(false);
  const [pulseBrief, setPulseBrief] = useState(null);
  const [pulseError, setPulseError] = useState(null);
  // Share / Export PDF wiring — both call export-company-profile.
  const [shareLoading, setShareLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [shareToast, setShareToast] = useState(null);
  // Phase B.17 — mobile "More" bottom sheet. Toggled by the compact mobile
  // action row's More button. Declared at the top of the component (above
  // the early-return guard below) to satisfy the Rules-of-Hooks fix from
  // Phase B.13 (React error #300 was caused by hooks moving across an
  // early-return boundary).
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const shellCompany = useMemo(
    () => buildShellCompany(companyId, storedSelectedCompany),
    [companyId, storedSelectedCompany],
  );

  // Phase B.15 — cached-first load strategy. The previous Phase B.9-onward
  // implementation called `getSavedCompanyDetail` directly, which fans out
  // to two `importyeti-proxy` invocations and blocks the page render for
  // ~5 seconds while the proxy refreshes ImportYeti. The new strategy:
  //   1. Render the cached snapshot from `lit_importyeti_company_snapshot`
  //      immediately via `getSavedCompanyShellOnly` (Supabase select, no
  //      proxy call).
  //   2. If the cached row is missing OR older than 7 days, kick off the
  //      original `getSavedCompanyDetail` refresh in the background and
  //      surface a small "Refreshing intel…" badge. Errors here are
  //      non-blocking — the cached data stays visible.
  //   3. If neither cache nor live fetch yields data, show the empty-state
  //      error path.
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
      if (years.length) {
        setSelectedYear(years[0]);
      }
    }

    (async () => {
      // Phase 1 (instant): cached-first read — no proxy call.
      let cached = {
        profile: null,
        routeKpis: null,
        snapshotUpdatedAt: null,
        isStale: true,
      };
      try {
        cached = await getSavedCompanyShellOnly(companyId);
      } catch (cacheErr) {
        // Cache miss or unavailable — treat as fully stale and continue
        // to the live refresh below.
        console.warn("Company.jsx: cached snapshot read failed", cacheErr);
      }
      if (cancelled) return;

      const haveCached = Boolean(cached.profile || cached.routeKpis);
      if (haveCached) {
        setProfile(cached.profile || null);
        setRouteKpis(cached.routeKpis || null);
        setSnapshotUpdatedAt(cached.snapshotUpdatedAt || null);
        if (cached.profile) applyYearFromProfile(cached.profile);
        // Page renders now from cached data — drop the full-row loading
        // pill so the user sees content, not a spinner.
        setLoading(false);
      }

      // Phase 2 (background): refresh from ImportYeti only when cached
      // data is missing or older than 7 days. Errors are non-blocking
      // when cached data is already on screen; they replace `error` only
      // if there is no cache and no live data.
      const needsRefresh = cached.isStale || !haveCached;
      if (!needsRefresh) {
        return;
      }

      if (haveCached) {
        setRefreshing(true);
      }
      try {
        const fresh = await getSavedCompanyDetail(companyId, ctrl.signal);
        if (cancelled) return;
        if (fresh) {
          setProfile(fresh.profile || null);
          setRouteKpis(fresh.routeKpis || null);
          setSnapshotUpdatedAt(new Date().toISOString());
          if (fresh.profile) applyYearFromProfile(fresh.profile);
        }
        if (!haveCached) {
          // We rendered nothing in phase 1 — turn off the initial loading
          // state once the live fetch lands (success or empty).
          setLoading(false);
        }
      } catch (refreshErr) {
        if (cancelled) return;
        if (haveCached) {
          // Non-blocking: cached data stays visible; surface a soft warning.
          setRefreshError(
            refreshErr?.message || "Refresh failed; showing cached snapshot.",
          );
        } else {
          // No cache AND live fetch failed — the page has nothing to render.
          setError(refreshErr?.message || "Failed to load company profile");
          setProfile(null);
          setRouteKpis(null);
          setLoading(false);
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [companyId]);

  const yearScopedProfile = useMemo(() => {
    if (!profile) return null;
    return buildYearScopedProfile(profile, selectedYear) || profile;
  }, [profile, selectedYear]);

  const activeProfile = yearScopedProfile || profile;
  const activeRouteKpis = yearScopedProfile?.routeKpis || routeKpis || null;

  const companyName =
    activeProfile?.title ||
    activeProfile?.name ||
    shellCompany?.name ||
    "Company";

  const companyDomain =
    activeProfile?.domain ||
    shellCompany?.domain ||
    null;

  const companyWebsite =
    activeProfile?.website ||
    shellCompany?.website ||
    null;

  const companyAddress =
    activeProfile?.address ||
    shellCompany?.address ||
    null;

  const companyCountryCode =
    activeProfile?.countryCode ||
    shellCompany?.countryCode ||
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

    const spend =
      explicitSpend != null && Number(explicitSpend) > 0
        ? Number(explicitSpend)
        : estimateMarketSpend(teu);

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
      teu,
      spend,
      latestShipment: profileLatest || shellLatest,
      topRoute:
        activeRouteKpis?.topRouteLast12m ||
        shellCompany?.kpis?.topRoute ||
        null,
      recentRoute:
        activeRouteKpis?.mostRecentRoute ||
        shellCompany?.kpis?.recentRoute ||
        null,
    };
  }, [activeProfile, activeRouteKpis, shellCompany]);

  const headerRecord = useMemo(() => {
    if (!companyId) return null;

    return {
      company: {
        company_id: companyId,
        name: companyName,
        address: companyAddress,
        country_code: companyCountryCode,
        domain: companyDomain,
        website: companyWebsite,
        phone: companyPhone,
        kpis: {
          shipments_12m: headerKpis.shipments,
          teu_12m: headerKpis.teu,
          est_spend_12m: headerKpis.spend,
          last_activity: headerKpis.latestShipment,
          top_route_12m: headerKpis.topRoute,
          recent_route: headerKpis.recentRoute,
        },
      },
    };
  }, [
    companyId,
    companyName,
    companyAddress,
    companyCountryCode,
    companyDomain,
    companyWebsite,
    companyPhone,
    headerKpis.shipments,
    headerKpis.teu,
    headerKpis.spend,
    headerKpis.latestShipment,
    headerKpis.topRoute,
    headerKpis.recentRoute,
  ]);

  // Phase B.14 — Pulse handler. Opens the modal, then (only if no brief is
  // already cached in component state) calls the pulse-brief Edge Function
  // with the same snapshot KPIs we already render in the hero. Errors are
  // mapped through PULSE_ERROR_COPY for user-friendly copy; the raw error
  // string is preserved as a fallback.
  async function handlePulseClick() {
    setPulseModalOpen(true);
    if (pulseBrief || pulseLoading) return;
    setPulseLoading(true);
    setPulseError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "pulse-brief",
        {
          body: {
            company_id: companyId,
            source_company_key:
              storedSelectedCompany?.source_company_key || null,
            company_name: companyName,
            domain: companyDomain,
            snapshot_summary: {
              shipments_12m: headerKpis?.shipments ?? null,
              teu_12m: headerKpis?.teu ?? null,
              est_spend_12m: headerKpis?.spend ?? null,
              top_lane: headerKpis?.topRoute ?? null,
              last_shipment_date: headerKpis?.latestShipment ?? null,
            },
          },
        },
      );
      if (invokeError) throw invokeError;
      if (!data?.ok) {
        const code = data?.code || "UNKNOWN";
        const friendly =
          PULSE_ERROR_COPY[code] || data?.error || "Pulse brief failed.";
        setPulseError({ code, message: friendly });
      } else {
        setPulseBrief({
          generatedAt: data.generated_at,
          cached: Boolean(data.cached),
          sections: data.sections || {},
        });
      }
    } catch (err) {
      setPulseError({
        code: "NETWORK",
        message: err?.message || "Pulse network error.",
      });
    } finally {
      setPulseLoading(false);
    }
  }

  // Phase B.15 — manual force-refresh handler. Bypasses the staleness
  // gate in the cached-first useEffect so users can pull fresh
  // ImportYeti data on demand. Cached data stays visible while the
  // fetch is in flight; on failure we surface a toast and keep the
  // existing snapshot rendered.
  async function handleManualRefreshClick() {
    if (!companyId || manualRefreshing) return;
    setManualRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await getSavedCompanyDetail(companyId);
      if (fresh) {
        setProfile(fresh.profile || null);
        setRouteKpis(fresh.routeKpis || null);
        setSnapshotUpdatedAt(new Date().toISOString());
        showShareToast("Snapshot refreshed", "success");
      }
    } catch (err) {
      setRefreshError(err?.message || "Refresh failed");
      showShareToast(err?.message || "Refresh failed", "error");
    } finally {
      setManualRefreshing(false);
    }
  }

  function showShareToast(message, tone = "info") {
    setShareToast({ message, tone });
    setTimeout(() => setShareToast(null), 3500);
  }

  async function copyToClipboardSafe(text) {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // ignore — browser may block clipboard
    }
    return false;
  }

  // Phase B.14 — Share HTML. Calls export-company-profile, copies the
  // signed URL to clipboard. On STORAGE_NOT_PROVISIONED falls back to the
  // canonical page URL so the user still walks away with something
  // shareable.
  async function handleShareHtmlClick() {
    if (!companyId || shareLoading) return;
    setShareLoading(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "export-company-profile",
        {
          body: {
            company_id: companyId,
            format: "html",
            include_pulse_brief: Boolean(pulseBrief),
          },
        },
      );
      if (invokeError) throw invokeError;
      if (data?.ok && data.url) {
        const ok = await copyToClipboardSafe(data.url);
        showShareToast(
          ok ? "Branded share link copied" : "Branded share link generated (copy failed — open console)",
          "success",
        );
        if (!ok) {
          // surface URL via console so the user still has access
          console.info("export-company-profile signed URL:", data.url);
        }
      } else if (data?.code === "STORAGE_NOT_PROVISIONED") {
        const url =
          typeof window !== "undefined" ? window.location.href : "";
        await copyToClipboardSafe(url);
        showShareToast(EXPORT_ERROR_COPY.STORAGE_NOT_PROVISIONED, "warning");
      } else {
        const friendly =
          EXPORT_ERROR_COPY[data?.code] ||
          data?.error ||
          "Share export failed.";
        showShareToast(friendly, "error");
      }
    } catch (err) {
      showShareToast(err?.message || "Share export error.", "error");
    } finally {
      setShareLoading(false);
    }
  }

  // Phase B.14 — Export PDF. Edge Function returns PDF_NOT_AVAILABLE today
  // (Deno can't run Chromium); we offer the HTML fallback URL when the
  // function provides one.
  async function handleExportPdfClick() {
    if (!companyId || exportLoading) return;
    setExportLoading(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "export-company-profile",
        {
          body: {
            company_id: companyId,
            format: "pdf",
            include_pulse_brief: Boolean(pulseBrief),
          },
        },
      );
      if (invokeError) throw invokeError;
      if (data?.ok && data.url) {
        if (typeof window !== "undefined") window.open(data.url, "_blank");
      } else if (data?.code === "PDF_NOT_AVAILABLE" && data?.fallback?.url) {
        const open =
          typeof window !== "undefined" &&
          window.confirm(
            "PDF render not available — open the branded HTML version instead?",
          );
        if (open) window.open(data.fallback.url, "_blank");
        else showShareToast("PDF export not available yet", "warning");
      } else if (data?.code === "STORAGE_NOT_PROVISIONED") {
        const url =
          typeof window !== "undefined" ? window.location.href : "";
        await copyToClipboardSafe(url);
        showShareToast(EXPORT_ERROR_COPY.STORAGE_NOT_PROVISIONED, "warning");
      } else {
        const friendly =
          EXPORT_ERROR_COPY[data?.code] ||
          data?.error ||
          "PDF export failed.";
        showShareToast(friendly, "error");
      }
    } catch (err) {
      showShareToast(err?.message || "PDF export error.", "error");
    } finally {
      setExportLoading(false);
    }
  }

  // Phase B.13.1 — Snapshot strip pills.
  // Hook ordering rule (Rules of Hooks): all useMemo / useState / useEffect
  // calls MUST run BEFORE any early `return`. Phase B.13.1 originally
  // placed these three derivations after the `if (error || !companyId)`
  // early-return guard below, which intermittently skipped the hooks on
  // error / no-company-id render paths and surfaced as React error #300
  // ("Rendered more hooks than during the previous render"). Moving them
  // above the early return restores stable hook count across all renders.
  //
  // Primary lane: parse headerKpis.topRoute via resolveEndpoint so each
  // side reads as `{countryCode} {countryName}` (e.g. "CN China → US USA").
  // If the lane string has only one resolvable side or is missing, the
  // pill hides (no fake fallback).
  const snapshotPillLane = useMemo(() => {
    const raw = headerKpis?.topRoute || headerKpis?.recentRoute || null;
    if (!raw || typeof raw !== "string") return null;
    const parts = raw.split(/→|->|>/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const fromMeta = resolveEndpoint(parts[0]);
    const toMeta = resolveEndpoint(parts[1]);
    if (!fromMeta && !toMeta) return null;
    const fromLabel = fromMeta
      ? `${fromMeta.countryCode} ${fromMeta.countryName}`
      : parts[0];
    const toLabel = toMeta
      ? `${toMeta.countryCode} ${toMeta.countryName}`
      : parts[1];
    return `${fromLabel} → ${toLabel}`;
  }, [headerKpis?.topRoute, headerKpis?.recentRoute]);

  // Volume signal: hide entirely when both shipments and TEU are 0/null.
  const snapshotPillVolume = useMemo(() => {
    const ships = Number(headerKpis?.shipments) || 0;
    const teu = Number(headerKpis?.teu) || 0;
    if (ships <= 0 && teu <= 0) return null;
    const fmt = (n) => Math.round(n).toLocaleString();
    return `${fmt(ships)} shipments / ${fmt(teu)} TEU`;
  }, [headerKpis?.shipments, headerKpis?.teu]);

  // Phase B.17 — `snapshotPillVerified` removed alongside the third Intel
  // status pill. Snapshot freshness/honesty is already conveyed by the
  // "Snapshot {date}" label and the Refreshing intel pill in the metadata
  // row, so the third pill was decorative weight.

  if (error || !companyId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <button
            type="button"
            onClick={() => navigate("/app/command-center")}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Command Center
          </button>

          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {error || "Company unavailable"}
          </div>
        </div>
      </div>
    );
  }

  const countryFlag = companyCountryCode ? flagFromCode(companyCountryCode) : "";
  const countryDisplay =
    activeProfile?.country ||
    activeProfile?.country_name ||
    shellCompany?.country ||
    null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Phase B.9 — premium light hero with a glossy translucent blue
            right-zone action panel. The previous Phase B.3 dark navy
            gradient `linear-gradient(160deg, #132344 0%, #0F1D38 100%)` is
            gone — the user's brief explicitly directs to soften the hero
            so the page stops feeling like stacked dashboard cards and
            starts reading as an executive intelligence workspace. The
            embedded 4-up KPI strip has moved to the floating KPI bridge
            row (rendered inside `CompanyDetailPanel`, approach 1) so the
            hero stays clean: identity left, actions right.

            Phase B.11 — wrap the hero in a `group relative` shell so a
            sibling glow div (positioned BEHIND the hero via `-inset-px`
            and `blur-md`) can bloom in on hover without affecting the
            hero's own layout. The glow is opacity-0 by default and only
            becomes visible on `group-hover`, with a 700ms transition so
            it feels intentional rather than reactive. */}
        {/* Phase B.13 — Hybrid premium vector surface header.
            Single unified dark surface (no per-side seam). Three
            angled SVG curves drift left → right on a slow 30s loop;
            an indigo glow sits behind the right action zone; a
            faint radial dot grid adds intelligence-data texture; the
            right action zone is now an embedded glass panel
            (backdrop-blur-xl, white/5 fill, white/10 border) so it
            no longer reads as a separate floating card. All motion
            is gated behind `prefers-reduced-motion: no-preference`
            so reduced-motion users see a clean static composition. */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 hover:[animation:b13_borderGlow_3s_ease-in-out]">
          <style>{`
            @media (prefers-reduced-motion: no-preference) {
              @keyframes b13_flow {
                0%   { transform: translateX(0px); }
                50%  { transform: translateX(-40px); }
                100% { transform: translateX(0px); }
              }
              @keyframes b13_borderGlow {
                0%   { box-shadow: 0 0 0px rgba(99,102,241,0); }
                50%  { box-shadow: 0 0 20px rgba(99,102,241,0.15); }
                100% { box-shadow: 0 0 0px rgba(99,102,241,0); }
              }
              .b13-flow { animation: b13_flow 30s ease-in-out infinite; will-change: transform; }
            }
          `}</style>

          {/* Layer 2 — Vector flow SVG (3 angled curves, drifting). */}
          <svg
            aria-hidden
            viewBox="0 0 1200 400"
            preserveAspectRatio="none"
            className="b13-flow pointer-events-none absolute inset-0 h-full w-full opacity-20"
          >
            <defs>
              <linearGradient id="b13_grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="b13_grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient id="b13_grad3" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <path
              d="M0,200 C300,100 600,300 1200,150"
              stroke="url(#b13_grad1)"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M0,280 C320,200 620,360 1200,240"
              stroke="url(#b13_grad2)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M0,120 C260,60 540,200 1200,90"
              stroke="url(#b13_grad3)"
              strokeWidth="1"
              fill="none"
            />
          </svg>

          {/* Layer 3 — Soft glow behind the right action zone. */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] bg-indigo-500/10 blur-[120px]"
          />

          {/* Layer 4 — Subtle radial dot grid for intelligence/data feel. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />

          {/* Layer 5 — Content. Identity left, glass action panel right. */}
          <div className="relative z-10 flex flex-col gap-8 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-8">
            {/* LEFT — company identity (white text on dark). */}
            <div className="flex min-w-0 flex-1 flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/app/command-center")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur-md transition hover:bg-white/10"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Command Center
                </button>

                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/40 bg-indigo-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-200">
                  <Sparkles className="h-3 w-3" />
                  Company Intelligence
                </span>
              </div>

              <div className="flex min-w-0 items-start gap-5">
                <CompanyAvatar
                  name={companyName}
                  logoUrl={
                    getCompanyLogoUrl(
                      companyDomain ||
                        companyWebsite ||
                        activeProfile?.domain ||
                        activeProfile?.website ||
                        shellCompany?.domain ||
                        shellCompany?.website ||
                        undefined,
                    ) || undefined
                  }
                  size="lg"
                  className="shrink-0 ring-2 ring-white/20"
                />

                <div className="min-w-0">
                  <h1
                    className="break-words text-3xl font-bold tracking-[-0.025em] text-white md:text-4xl xl:text-5xl"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {companyName}
                  </h1>

                  {/* Metadata row — flag + country + 2-letter code · domain
                      · Saved. Address rendered as muted text below. */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-300">
                    {(countryFlag || countryDisplay || companyCountryCode) ? (
                      <span className="inline-flex items-center gap-1.5">
                        {countryFlag ? (
                          <span aria-hidden className="text-base leading-none">
                            {countryFlag}
                          </span>
                        ) : null}
                        <span className="font-medium text-slate-100">
                          {countryDisplay || companyCountryCode}
                        </span>
                        {companyCountryCode ? (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-300 ring-1 ring-white/10">
                            {companyCountryCode}
                          </span>
                        ) : null}
                      </span>
                    ) : null}

                    {companyDomain ? (
                      <>
                        <span aria-hidden className="text-slate-500">·</span>
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <Globe className="h-3.5 w-3.5 text-slate-400" />
                          {companyDomain}
                        </span>
                      </>
                    ) : null}

                    <span aria-hidden className="text-slate-500">·</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                      Saved
                    </span>

                    {/* Phase B.15 — Refreshing intel badge. Visible only
                        while a background ImportYeti refresh is in
                        flight on top of an already-rendered cached
                        snapshot (so the user knows the page is sharpening,
                        not stuck). Hidden once the refresh resolves. */}
                    {refreshing || manualRefreshing ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Refreshing intel…
                      </span>
                    ) : null}

                    {/* Phase B.15 — Soft refresh-error pill. Cached data
                        stays visible; this is non-blocking telemetry so
                        the user knows the live refresh failed but the
                        snapshot they're reading is still legit. */}
                    {refreshError ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200"
                        title={refreshError}
                      >
                        Refresh failed
                      </span>
                    ) : null}

                    {/* Phase B.15 — Snapshot freshness label. Honest age
                        readout so users can tell at a glance how stale
                        the cached snapshot is. Hidden when no cache
                        timestamp is available. */}
                    {snapshotUpdatedAt ? (
                      <span className="text-[10px] text-slate-400">
                        Snapshot {new Date(snapshotUpdatedAt).toISOString().slice(0, 10)}
                      </span>
                    ) : null}
                  </div>

                  {companyAddress ? (
                    <div className="mt-2 text-sm text-slate-400">
                      {companyAddress}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Phase B.17 — simplified Snapshot strip. The third Intel
                  status pill is gone (it duplicated information already
                  surfaced by the "Snapshot {date}" / "Refreshing intel"
                  labels in the metadata row above). The remaining two
                  pills (primary lane, volume signal) are stripped down:
                  no colored icon-tile container, transparent fill,
                  rounded-full, py-1.5. The icon glyph itself carries the
                  color tint inline; the label is muted/uppercase; the
                  value is white-bold. Each pill still hides when its
                  underlying data is null (no fake fallback). */}
              <div className="flex flex-wrap items-center gap-2">
                {snapshotPillLane ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs">
                    <Route className="h-3.5 w-3.5 text-indigo-300" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Primary lane
                    </span>
                    <span className="font-semibold text-white">
                      {snapshotPillLane}
                    </span>
                  </div>
                ) : null}

                {snapshotPillVolume ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs">
                    <BarChart3 className="h-3.5 w-3.5 text-cyan-300" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Volume signal
                    </span>
                    <span className="font-semibold text-white">
                      {snapshotPillVolume}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Phase B.15 — only show the full-row "Loading…" pill when
                  there is no cached snapshot yet to render. If the cache
                  hit fired and we already have a profile, the smaller
                  cyan "Refreshing intel…" pill above is enough. */}
              {loading && !profile ? (
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading company intelligence…
                </div>
              ) : null}
            </div>

            {/* Phase B.17 — compact mobile action row. Visible only at
                <lg, where the full glass action panel is hidden. Three
                primary actions: Start Outreach (CTA), Pulse (modal), and
                More (bottom sheet with Command Center / Share / Export /
                Refresh / Year). Click handlers reused verbatim from the
                desktop panel. */}
            <div className="flex flex-wrap items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => {
                  if (!companyId) return;
                  setCampaignModalOpen(true);
                }}
                disabled={!companyId}
                className="inline-flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Start Outreach
              </button>
              <button
                type="button"
                onClick={handlePulseClick}
                disabled={!companyId}
                className="inline-flex flex-1 min-w-[100px] items-center justify-center gap-2 rounded-full border border-violet-300/40 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 px-4 py-2 text-sm font-semibold text-violet-100 backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pulseLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Pulse
              </button>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(true)}
                className="inline-flex items-center justify-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
                More
              </button>
            </div>

            {/* RIGHT — Embedded glass action panel. Backdrop-blur on
                white/5 fill so the panel reads as embedded in the
                surface, not a separate floating card. All click
                handlers preserved verbatim. Phase B.17 — `hidden lg:flex`
                so the panel ONLY renders at ≥lg; mobile uses the compact
                action row above + bottom sheet below. */}
            <div className="relative hidden lg:flex flex-col gap-3 self-start rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl lg:w-[380px] lg:flex-shrink-0">
              {years.length > 0 ? (
                <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-slate-300" />
                  <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent text-xs font-semibold text-white outline-none"
                  >
                    {years.map((year) => (
                      <option key={year} value={year} className="bg-slate-900 text-white">
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              ) : loading ? (
                <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  if (!companyId) return;
                  setCampaignModalOpen(true);
                }}
                disabled={!companyId}
                title={
                  companyId
                    ? "Add this company to an outreach campaign"
                    : "Save company first to enable outreach"
                }
                className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Start Outreach
              </button>

              <button
                type="button"
                onClick={() => navigate("/app/command-center")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <LayoutGrid className="h-4 w-4" />
                In Command Center
              </button>

              {/* Phase B.16 — Pulse brief CTA wired to pulse-brief Edge
                  Function. Opens the modal which then triggers the
                  web-grounded brief assembly. */}
              <button
                type="button"
                onClick={handlePulseClick}
                disabled={!companyId}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-violet-300/40 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 px-4 py-2 text-sm font-semibold text-violet-100 backdrop-blur-md transition hover:from-violet-500/30 hover:to-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pulseLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Pulse
              </button>

              {/* Phase B.14 — Share HTML / Export PDF wired to
                  export-company-profile Edge Function. */}
              <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleShareHtmlClick}
                    disabled={!companyId || shareLoading}
                    title="Generates a branded HTML company profile via export-company-profile and copies the signed URL."
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {shareLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Share2 className="h-3.5 w-3.5" />
                    )}
                    Share HTML
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPdfClick}
                    disabled={!companyId || exportLoading}
                    title="Requests a PDF export via export-company-profile (currently returns PDF_NOT_AVAILABLE with HTML fallback)."
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exportLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Export PDF
                  </button>
                </div>
                {shareToast ? (
                  <div
                    className={
                      "rounded-md px-2 py-1 text-center text-[11px] font-semibold " +
                      (shareToast.tone === "success"
                        ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-200"
                        : shareToast.tone === "warning"
                          ? "border border-amber-300/30 bg-amber-500/15 text-amber-200"
                          : shareToast.tone === "error"
                            ? "border border-rose-300/30 bg-rose-500/15 text-rose-200"
                            : "border border-white/15 bg-white/5 text-slate-200")
                    }
                  >
                    {shareToast.message}
                  </div>
                ) : null}
              </div>

              {/* Phase B.15 — Refresh Intel is now functional. It calls
                  `getSavedCompanyDetail` (which fans out to the
                  importyeti-proxy), bypassing the staleness check so the
                  user can pull fresh data on demand. The Watchlist
                  button stays disabled — it's a separate Phase deliverable
                  and there's no honest UI for it yet. */}
              <div className="mt-1 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={handleManualRefreshClick}
                  disabled={!companyId || manualRefreshing || refreshing}
                  title={
                    companyId
                      ? "Force refresh ImportYeti snapshot for this company"
                      : "Save company first to enable refresh"
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {manualRefreshing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  Refresh Intel
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-400"
                >
                  Watchlist
                </button>
              </div>
            </div>
          </div>
        </section>

        <CompanyDetailPanel
          record={headerRecord}
          profile={activeProfile}
          routeKpis={activeRouteKpis}
          loading={loading}
          error={null}
          selectedYear={selectedYear}
          onGenerateBrief={() => {}}
          onExportPDF={() => window.print()}
        />

        {campaignModalOpen && companyId ? (
          <AddToCampaignModal
            open={campaignModalOpen}
            onClose={() => setCampaignModalOpen(false)}
            company={{ company_id: String(companyId), name: companyName }}
          />
        ) : null}

        {/* Phase B.17 — mobile "More" bottom sheet. Visible only when
            mobileMoreOpen is true (toggled by the compact mobile action
            row's More button). Hosts secondary actions that don't fit on
            a 3-button row: In Command Center, Share HTML, Export PDF,
            Refresh Intel, and a Year selector. Each action delegates to
            the same handlers used by the desktop glass panel — no
            duplicated logic, just a different surface. Tapping the
            backdrop or the explicit Close button dismisses. */}
        {mobileMoreOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More actions"
            className="fixed inset-0 z-50 flex items-end lg:hidden"
            onClick={() => setMobileMoreOpen(false)}
          >
            <div
              aria-hidden
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <div
              className="relative z-10 w-full rounded-t-3xl border-t border-white/10 bg-slate-900 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                More actions
              </div>
              <div className="space-y-2">
                {years.length > 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-slate-300" />
                      <span className="text-sm font-semibold text-white">Year</span>
                    </div>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="rounded-md bg-white/10 px-2 py-1 text-sm font-semibold text-white outline-none"
                    >
                      {years.map((year) => (
                        <option key={year} value={year} className="bg-slate-900 text-white">
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    navigate("/app/command-center");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
                >
                  <LayoutGrid className="h-4 w-4" />
                  In Command Center
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    handleShareHtmlClick();
                  }}
                  disabled={!companyId || shareLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shareLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                  Share HTML
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    handleExportPdfClick();
                  }}
                  disabled={!companyId || exportLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    handleManualRefreshClick();
                  }}
                  disabled={!companyId || manualRefreshing || refreshing}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {manualRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh Intel
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {/* Phase B.16 — Pulse brief modal. Renders three states:
            (1) loading skeleton, (2) error card mapped through
            PULSE_ERROR_COPY, (3) deepened brief sections from the
            pulse-brief Edge Function (web search + optional AI synthesis,
            no provider names surfaced to the user). */}
        {pulseModalOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pulse-brief-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPulseModalOpen(false)}
          >
            <div
              className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 p-6 text-white">
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-[10%] top-[20%] h-40 w-40 rounded-full bg-indigo-500/30 blur-3xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute bottom-[10%] right-[35%] h-28 w-28 rounded-full bg-violet-500/25 blur-3xl"
                />
                <button
                  type="button"
                  onClick={() => setPulseModalOpen(false)}
                  className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 backdrop-blur-md transition hover:bg-white/20"
                  aria-label="Close Pulse brief"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="relative inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-violet-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-100">
                  <Sparkles className="h-3 w-3" />
                  Pulse Brief
                  {pulseBrief?.cached ? (
                    <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/80">
                      Cached
                    </span>
                  ) : null}
                </div>
                <h3
                  id="pulse-brief-title"
                  className="relative mt-3 text-2xl font-bold tracking-tight"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {companyName}
                </h3>
                <p className="relative mt-1 text-sm text-slate-300">
                  Pre-call intelligence brief
                  {pulseBrief?.generatedAt
                    ? ` · ${new Date(pulseBrief.generatedAt).toLocaleString()}`
                    : ""}
                </p>
                <p className="relative mt-1 text-[11px] text-slate-400">
                  Based on saved snapshot and public web context
                </p>
              </div>
              <div className="max-h-[60vh] space-y-4 overflow-y-auto p-6">
                {pulseLoading ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                    <p className="text-sm">
                      Searching public web context and assembling brief…
                    </p>
                  </div>
                ) : pulseError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
                    <strong className="font-semibold">
                      AI brief unavailable
                    </strong>
                    <p className="mt-1 text-rose-800">{pulseError.message}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-rose-700">
                      Code: {pulseError.code}
                    </p>
                  </div>
                ) : pulseBrief ? (
                  <PulseBriefBody sections={pulseBrief.sections} />
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Click Pulse again to load the brief.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setPulseModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Phase B.16 — render the deepened Pulse brief sections returned by
// pulse-brief Edge Function. Sections with empty/null text are hidden
// rather than rendering "—" prose; sources collapse when the array is
// empty. No fallback / placeholder copy is rendered. Provider names are
// never surfaced.
function PulseBriefBody({ sections }) {
  if (!sections || typeof sections !== "object") return null;
  const blocks = [
    { key: "executive_summary", label: "Executive Summary" },
    { key: "company_context", label: "Company Context" },
    { key: "shipment_signal", label: "Shipment Signal" },
    { key: "public_web_context", label: "Public Web Context" },
    { key: "recent_signals", label: "Recent Signals" },
    { key: "opportunity_angle", label: "Opportunity Angle" },
    { key: "suggested_outreach_angle", label: "Suggested Outreach Angle" },
    { key: "risks_watchouts", label: "Risks / Watchouts" },
  ];
  const sources = Array.isArray(sections.sources) ? sections.sources : [];
  return (
    <div className="space-y-4">
      {blocks.map(({ key, label }) => {
        const value = sections[key];
        if (typeof value !== "string" || !value.trim()) return null;
        return (
          <section
            key={key}
            className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
          >
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-600">
              {label}
            </h4>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {value}
            </p>
          </section>
        );
      })}
      {sources.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-600">
            Sources
          </h4>
          <ul className="mt-2 space-y-2">
            {sources.slice(0, 5).map((src, idx) => {
              // Phase B.16 — show title + domain hint only. We never
              // render the raw URL string in the visible label so we
              // never accidentally expose internal search-provider
              // URLs to the reader. Click target stays the real URL.
              let domain = "";
              try {
                domain = new URL(src?.url).hostname.replace(/^www\./i, "");
              } catch {
                domain = "";
              }
              return (
                <li
                  key={`${src?.url || idx}-${idx}`}
                  className="text-sm text-slate-700"
                >
                  <a
                    href={src?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-indigo-600 hover:underline"
                  >
                    {src?.title || domain || "Source"}
                  </a>
                  {domain ? (
                    <span className="ml-2 text-xs text-slate-400">
                      · {domain}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}