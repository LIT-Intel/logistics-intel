import React, { useEffect, useMemo, useState } from "react";
import {
  Search as SearchIcon,
  MapPin,
  X,
  BookmarkPlus,
  Bookmark,
  Eye,
  Grid3x3,
  List,
  Loader2,
  Users,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitKpiStrip from "@/components/ui/LitKpiStrip";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import {
  searchShippers,
  normalizeIyCompanyProfile,
  saveCompanyToCommandCenter,
  fetchSearchKpiOverlay,
  type IyCompanyProfile,
} from "@/lib/api";
import {
  parseImportYetiDate,
  getDateBadgeInfo,
  formatSafeShipmentDate,
  capFutureDate,
} from "@/lib/dateUtils";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { canonicalContainerCode } from "@/lib/containerUtils";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import type { LimitExceeded } from "@/lib/usage";
import { LimitExceededError } from "@/lib/saveCompany";

function getCountryFlag(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return "";
  return String.fromCodePoint(
    ...countryCode.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)),
  );
}

type SearchCompany = {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  country_code: string;
  address: string;
  website: string;
  industry: string;
  shipments: number;
  shipments_12m: number;
  teu_estimate?: number;
  mode?: string;
  last_shipment: string | null;
  latest_year?: number | null;
  latest_year_shipments?: number | null;
  latest_year_teu?: number | null;
  top_container_length?: string | null;
  fcl_shipments_perc?: number | null;
  lcl_shipments_perc?: number | null;
  status: 'Active' | 'Inactive';
  frequency: 'High' | 'Medium' | 'Low';
  trend: 'up' | 'flat' | 'down';
  top_origins: string[];
  top_destinations: string[];
  top_suppliers: string[];
  gemini_summary: string;
  risk_flags: string[];
  importyeti_key?: string;
  enrichment_status?: "pending" | "partial" | "complete";
  top_container_length?: string;
  top_container_count?: number;
  fcl_percent?: number;
  lcl_percent?: number;
  latest_year?: number;
  latest_year_shipments?: number;
  latest_year_teu?: number;
};

export default function SearchPage() {
  const { user, authReady } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Phase 5 — initialize `searchQuery` from the `?q=` URL parameter on
  // mount so deep links like /app/search?q=Rivian land with the input
  // pre-populated and the search auto-runs (effect below).
  const initialQ = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchCompany[]>([]);
  const [upgradeModal, setUpgradeModal] = useState<LimitExceeded | null>(null);
  const [saving, setSaving] = useState(false);
  // Per-row spinner state when "View details" is in flight (snapshot
  // fetch → save → navigate). Tracks which row's button to disable.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [savedCompanyIds, setSavedCompanyIds] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Phase D client-side filters. Every chip maps to a field that's already
  // populated on the mapped company rows — nothing fetched, nothing mocked.
  // Defaults are "any" / false so the filter is a pass-through until the
  // user changes it.
  type TeuRange = "any" | "<=1k" | "1k-10k" | "10k-100k" | ">100k";
  type LoadType = "any" | "fcl" | "lcl";
  type TopContainer = "any" | "20FT" | "40FT" | "40HC" | "45FT";
  const [teuRange, setTeuRange] = useState<TeuRange>("any");
  const [loadType, setLoadType] = useState<LoadType>("any");
  const [topContainer, setTopContainer] = useState<TopContainer>("any");
  const [savedOnly, setSavedOnly] = useState(false);
  // Free-text city / state filter — narrows results to rows whose city
  // OR state contains the typed substring (case-insensitive).
  const [locationQuery, setLocationQuery] = useState("");

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const years = useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentYear - i),
    [currentYear],
  );

  // Normalize any company key shape (prefixed "company/foo" or bare
  // "foo") to a single canonical form. The previous version stored
  // bare slugs in `savedCompanyIds` while the View Details click
  // checked with prefixed keys, so `.includes()` returned false for
  // every saved company and the full save flow re-ran on every click.
  // That re-fetched the snapshot (free if cached, but a credit burn
  // when stale) and re-invoked save-company. Centralizing the shape
  // here so the guard actually fires.
  const normalizeKey = (raw: unknown): string => {
    if (raw == null) return "";
    return String(raw).trim().replace(/^company\//, "").toLowerCase();
  };

  useEffect(() => {
    const loadSavedCompanies = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("lit_saved_companies")
          .select("company_id, lit_companies!inner(source_company_key)")
          .eq("user_id", user.id);

        if (error) throw error;

        if (data) {
          // Store every saved row in BOTH prefixed and bare-slug form
          // so existing `.includes(companyKey)` callsites that pass
          // either shape will match. Cheap (the array stays small;
          // typical user has <50 saved companies).
          const keys: string[] = [];
          for (const item of data as any[]) {
            const slug = item?.lit_companies?.source_company_key;
            if (!slug) continue;
            const bare = normalizeKey(slug);
            const prefixed = bare ? `company/${bare}` : "";
            if (bare) keys.push(bare);
            if (prefixed) keys.push(prefixed);
            // Also keep the original raw form just in case the DB
            // ever stores something funky.
            if (typeof slug === "string" && !keys.includes(slug)) {
              keys.push(slug);
            }
          }
          setSavedCompanyIds(Array.from(new Set(keys)));
        }
      } catch (error) {
        console.error("[Search] Failed to load saved companies:", error);
      }
    };

    loadSavedCompanies();

    if (!user) return;

    const channel = supabase
      .channel("public:lit_saved_companies")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lit_saved_companies",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadSavedCompanies();
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  function resolveLastShipmentDate(r: any): string | null {
    return r?.lastShipmentDate ?? r?.mostRecentShipment
      ?? r?.last_shipment_date ?? r?.most_recent_shipment ?? null;
  }

  const handleSearch = async (e: React.FormEvent, overrideQuery?: string) => {
    e.preventDefault();

    // Phase 5 — accept an optional `overrideQuery` so the URL-param
    // auto-run path (?q=…) can fire the search before the controlled
    // input state has flushed through React's render cycle. The form
    // submit path keeps the existing behavior (reads `searchQuery`).
    const query = (overrideQuery ?? searchQuery).trim();

    if (!query || query.length < 2) {
      toast({
        title: "Search query required",
        description: "Please enter at least 2 characters to search",
        variant: "destructive",
      });
      return;
    }

    if (!authReady) {
      toast({
        title: "Authentication required",
        description: "Please wait for authentication to complete",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    setHasSearched(true);

    // Fire-and-forget usage event so the Dashboard "Searches Used" KPI
    // reflects real activity. Never awaited, never surfaced to the user —
    // if the insert fails (RLS, network, schema), the search continues.
    // Phase H P1 fix — payload previously used `event_data` which is not a
    // column on `lit_activity_events` (schema has `metadata jsonb`). The
    // REST call was silently rejected and zero rows landed, so the
    // Searches Used KPI read 0 forever. Renamed to `metadata` to match
    // the real schema.
    if (user?.id) {
      void supabase
        .from("lit_activity_events")
        .insert({
          user_id: user.id,
          event_type: "search",
          metadata: { q: query },
        })
        .then(
          () => undefined,
          () => undefined,
        );
    }

    try {
      const response = await searchShippers({ q: query, page: 1, pageSize: 50 });

      if (response?.ok && Array.isArray(response?.results)) {
        const mappedResults: SearchCompany[] = response.results.map((result: any, idx: number) => {
          const parsedAddress = result.address || "";
          const cityMatch = parsedAddress.match(/^([^,]+)/);

          const parsedDate = parseImportYetiDate(
            result.lastShipmentDate ??
            result.mostRecentShipment ??
            result.last_shipment_date ??
            result.most_recent_shipment
          );

          const totalShipments =
            Number(result.totalShipments ?? result.total_shipments ?? 0) || 0;

          // Extract FCL/LCL counts with camelCase priority
          const fclCount =
            Number(
              result.fclShipments12m ??
              result.fcl_shipments ??
              result.fcl_count ??
              0
            ) || 0;

          const lclCount =
            Number(
              result.lclShipments12m ??
              result.lcl_shipments ??
              result.lcl_count ??
              0
            ) || 0;

          const totalCount = fclCount + lclCount;

          const fclPercent = totalCount > 0 ? (fclCount / totalCount) * 100 : undefined;
          const lclPercent = totalCount > 0 ? (lclCount / totalCount) * 100 : undefined;

          const fclPercentFromResult =
            typeof result.fcl_shipments_perc === "number"
              ? result.fcl_shipments_perc
              : typeof result.fcl_percent === "number"
                ? result.fcl_percent
                : fclPercent;

          const lclPercentFromResult =
            typeof result.lcl_shipments_perc === "number"
              ? result.lcl_shipments_perc
              : typeof result.lcl_percent === "number"
                ? result.lcl_percent
                : lclPercent;

          const mapped = {
            id: result.key || result.company_id || `iy-${Date.now()}-${idx}`,
            name: result.title || result.name || result.company_name || "Unknown Company",
            city: result.city || (cityMatch ? cityMatch[1] : "Unknown"),
            state: result.state || "",
            country: result.country || "United States",
            country_code: result.countryCode || result.country_code || "US",
            address: result.address || result.city || "",
            website: result.website || "",
            industry: "Import / Export",
            shipments: totalShipments,
            shipments_12m:
              Number(
                result.latestYearShipments ??
                result.latest_year_shipments ??
                result.shipmentsLast12m ??
                result.shipments_12m ??
                totalShipments
              ) || 0,
            teu_estimate: (() => {
              // Prefer normalized parsed_summary / companyProfile shapes first,
              // then fall back to flat fields the search action returns, then
              // finally anything on raw_payload-shaped objects.
              const candidates: Array<unknown> = [
                result?.parsed_summary?.total_teu,
                result?.parsed_summary?.route_kpis?.teuLast12m,
                result?.companyProfile?.routeKpis?.teuLast12m,
                result?.routeKpis?.teuLast12m,
                result?.route_kpis?.teuLast12m,
                result?.snapshot?.total_teu,
                result?.total_teu,
                result?.totalTEU,
                result?.latestYearTeu,
                result?.latest_year_teu,
                result?.teusLast12m,
              ];
              for (const value of candidates) {
                if (value == null) continue;
                const num = Number(value);
                if (Number.isFinite(num)) return num;
              }
              return undefined;
            })(),
            mode: undefined,
            last_shipment: parsedDate ?? null,
            status: (result.totalShipments || 0) > 0 ? 'Active' : 'Inactive',
            frequency:
              totalShipments > 10000
                ? "High"
                : totalShipments > 1000
                  ? "Medium"
                  : "Low",
            trend: "flat",
            top_origins: [],
            top_destinations: [],
            top_suppliers: Array.isArray(result.topSuppliers) ? result.topSuppliers : [],
            gemini_summary: `${result.title || result.company_name || "Company"} trade intelligence preview`,
            risk_flags: [],
            importyeti_key: result.key || (result.company_id ? `company/${result.company_id}` : undefined),
            enrichment_status: "pending",
            top_container_length:
              result.topContainerLength ??
              result.top_container_length ??
              undefined,
            top_container_count:
              result.top_container_count != null
                ? Number(result.top_container_count)
                : result.topContainerCount != null
                  ? Number(result.topContainerCount)
                  : undefined,
            fcl_percent: fclPercentFromResult,
            lcl_percent: lclPercentFromResult,
            latest_year:
              result.latest_year != null
                ? Number(result.latest_year)
                : undefined,
            latest_year_shipments:
              result.latestYearShipments != null
                ? Number(result.latestYearShipments)
                : result.latest_year_shipments != null
                  ? Number(result.latest_year_shipments)
                  : undefined,
            latest_year_teu:
              result.latestYearTeu != null
                ? Number(result.latestYearTeu)
                : result.latest_year_teu != null
                  ? Number(result.latest_year_teu)
                  : undefined,
          };

          return mapped;
        });

        // Overlay KPI data from lit_company_search_results
        try {
          const keys = mappedResults
            .map((r: SearchCompany) => r.importyeti_key)
            .filter((k): k is string => Boolean(k));
          const overlay = await fetchSearchKpiOverlay(keys);
          const enriched = mappedResults.map((r: SearchCompany) => {
            const kpiRow = r.importyeti_key ? overlay[r.importyeti_key] : null;
            if (!kpiRow) return r;
            return {
              ...r,
              last_shipment: resolveLastShipmentDate(kpiRow) ?? r.last_shipment,
              latest_year: kpiRow.latest_year ?? null,
              latest_year_shipments: kpiRow.latest_year_shipments ?? null,
              latest_year_teu: kpiRow.latest_year_teu ?? null,
              top_container_length: kpiRow.top_container_length ?? null,
              fcl_shipments_perc: kpiRow.fcl_shipments_perc ?? null,
              lcl_shipments_perc: kpiRow.lcl_shipments_perc ?? null,
            };
          });
          setResults(enriched);
        } catch {
          setResults(mappedResults);
        }
        // Track search usage in search_queries table
        if (user?.id) {
          supabase
            .from("search_queries")
            .insert({
              user_id: user.id,
              query,
              results_count: mappedResults.length,
            })
            .then(() => {});
        }

        if (mappedResults.length === 0) {
          toast({
            title: "No results found",
            description: `No companies found matching "${query}"`,
          });
        }
      } else {
        throw new Error(response?.meta ? "Search returned invalid payload" : "Search failed");
      }
    } catch (error: any) {
      console.error("Search error:", error);
      // LIMIT_EXCEEDED: surface the upgrade modal instead of a "0 results"
      // toast. The error was tagged in api.ts:searchShippers when the
      // edge function returned 403 + LIMIT_EXCEEDED.
      if (error?.code === "LIMIT_EXCEEDED" && error?.limitExceeded) {
        setUpgradeModal(error.limitExceeded as LimitExceeded);
        setResults([]);
      } else {
        toast({
          title: "Search failed",
          description: error.message || "Unable to search companies. Please try again.",
          variant: "destructive",
        });
        setResults([]);
      }
    } finally {
      setSearching(false);
    }
  };

  // Phase 5 — auto-run a search when the URL carries `?q=…` and auth is
  // ready. Single-shot guard via a ref so editing the input or routing
  // back doesn't re-trigger. The Pulse AI tab's "Similar Companies"
  // links route here with q=<encoded company name> to deep-link a fresh
  // search.
  const autoRanRef = React.useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!authReady) return;
    const q = (searchParams.get("q") || "").trim();
    if (q.length < 2) return;
    autoRanRef.current = true;
    setSearchQuery(q);
    const fakeEvent = {
      preventDefault: () => {},
    } as unknown as React.FormEvent;
    void handleSearch(fakeEvent, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, searchParams]);

  const handleClear = () => {
    setSearchQuery("");
    setResults([]);
    setHasSearched(false);
  };

  // Pure save — no closure on snapshot state. Caller passes whatever
  // `profile` it has (null is fine; falls back to search-row values).
  // Throws LimitExceededError; caller decides whether to surface the
  // upgrade modal or just toast.
  const persistCompanySave = async (
    company: SearchCompany,
    profile: IyCompanyProfile | null,
  ) => {
    const companyKey = company.importyeti_key || company.id;
    if (!companyKey) {
      throw new Error("This company is missing a valid company key.");
    }
    const shipper = {
      key: companyKey,
      companyId: companyKey,
      title: company.name,
      name: company.name,
      domain: company.website || undefined,
      website: company.website || undefined,
      phone:
        (profile as any)?.phoneNumber ||
        (profile as any)?.phone ||
        undefined,
      address: company.address || undefined,
      city: company.city || undefined,
      state: company.state || undefined,
      countryCode: company.country_code || undefined,
      totalShipments:
        profile?.routeKpis?.shipmentsLast12m ??
        company.shipments_12m ??
        company.shipments ??
        0,
      teusLast12m:
        profile?.routeKpis?.teuLast12m ??
        company.teu_estimate ??
        null,
      mostRecentShipment:
        profile?.lastShipmentDate ??
        company.last_shipment ??
        null,
      lastShipmentDate:
        profile?.lastShipmentDate ??
        company.last_shipment ??
        null,
      primaryRoute:
        profile?.routeKpis?.topRouteLast12m ??
        null,
      topSuppliers: company.top_suppliers ?? [],
    };

    await saveCompanyToCommandCenter({
      shipper,
      profile,
      stage: "prospect",
      source: "importyeti",
    });

    return companyKey;
  };

  // Bookmark icon click — silent save, stays on the search page.
  const saveToCommandCenter = async (company: SearchCompany) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to save companies",
        variant: "destructive",
      });
      return;
    }
    const companyKey = company.importyeti_key || company.id;
    if (!companyKey) {
      toast({
        title: "Save failed",
        description: "This company is missing a valid company key.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await persistCompanySave(company, null);
      toast({
        title: "Company saved",
        description: `${company.name} has been saved to your Command Center`,
      });
      const bare = normalizeKey(companyKey);
      const prefixed = bare ? `company/${bare}` : "";
      setSavedCompanyIds((prev) => {
        const next = new Set(prev);
        if (companyKey) next.add(companyKey);
        if (bare) next.add(bare);
        if (prefixed) next.add(prefixed);
        return Array.from(next);
      });
    } catch (error: any) {
      console.error("[saveToCommandCenter] Fatal error:", error);
      if (error instanceof LimitExceededError) {
        setUpgradeModal({
          ok: false,
          code: "LIMIT_EXCEEDED",
          feature: error.feature as any,
          used: error.used,
          limit: error.limit,
          plan: error.plan,
          reset_at: null,
          upgrade_url: error.upgrade_url || "/app/billing",
          message: error.message,
        });
      } else {
        toast({
          title: "Save failed",
          description: error?.message || "Could not save company. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  // "View details" — primary CTA. Skips the preview drawer entirely:
  // fetch a fresh snapshot so the saved row carries full intel, save,
  // then navigate into the Command Center company profile. If the row
  // is already saved we skip the save and just navigate. LIMIT_EXCEEDED
  // surfaces the upgrade modal and aborts navigation.
  const viewAndOpenInCommandCenter = async (company: SearchCompany) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to open a company",
        variant: "destructive",
      });
      return;
    }
    const companyKey = company.importyeti_key || company.id;
    if (!companyKey) {
      toast({
        title: "Cannot open company",
        description: "This row is missing a valid company key.",
        variant: "destructive",
      });
      return;
    }
    const slug = String(companyKey).replace(/^company\//, "");

    // Already saved → just navigate, no fetch, no save credit burned.
    if (savedCompanyIds.includes(companyKey)) {
      navigate(`/app/companies/${encodeURIComponent(slug)}`);
      return;
    }

    setViewingId(companyKey);
    try {
      // Phase B — read the cached snapshot directly from Supabase
      // instead of calling importyeti-proxy. The snapshot table is
      // the system of record (TTL 30 days, written on save and on
      // explicit Refresh Intel). A direct table read costs zero
      // ImportYeti credits even on cache miss — we just save with
      // row-level data when the table is empty for this slug. The
      // user can warm the cache later via Refresh Intel.
      let profile: IyCompanyProfile | null = null;
      const slugForSnapshot = company.importyeti_key
        ? String(company.importyeti_key).replace(/^company\//, "")
        : "";
      if (slugForSnapshot) {
        try {
          // Race the cache read against a 3s timeout so a slow /
          // hung Supabase round-trip can never freeze the click.
          // The user-visible "Opening…" spinner stays bounded; if
          // the timeout wins we proceed without a profile and the
          // Profile page's own lit_companies fallback handles it.
          const snapshotPromise = supabase
            .from("lit_importyeti_company_snapshot")
            .select("company_id, parsed_summary, raw_payload, updated_at")
            .eq("company_id", slugForSnapshot)
            .maybeSingle();
          const result = await Promise.race<any>([
            snapshotPromise,
            new Promise((resolve) =>
              setTimeout(
                () => resolve({ data: null, error: { message: "snapshot_read_timeout" } }),
                3000,
              ),
            ),
          ]);
          const snapshotRow = result?.data ?? null;
          const cached =
            snapshotRow?.parsed_summary ?? snapshotRow?.raw_payload ?? null;
          if (cached && typeof cached === "object") {
            profile = normalizeIyCompanyProfile(cached, slugForSnapshot);
          }
        } catch (snapshotErr) {
          console.warn(
            "[viewAndOpen] snapshot table read failed; saving with row data",
            snapshotErr,
          );
        }
      }

      await persistCompanySave(company, profile);

      const bareKey = normalizeKey(companyKey);
      const prefixedKey = bareKey ? `company/${bareKey}` : "";
      setSavedCompanyIds((prev) => {
        const next = new Set(prev);
        if (companyKey) next.add(companyKey);
        if (bareKey) next.add(bareKey);
        if (prefixedKey) next.add(prefixedKey);
        return Array.from(next);
      });
      toast({
        title: "Saved",
        description: `${company.name} added to your Command Center`,
      });

      // Seed lit:selectedCompany with THIS company's data before
      // routing. Company.jsx's shellCompany helper uses this for
      // first-paint header info; if we don't refresh it, a previous
      // company's name/KPIs leak onto the new route until the
      // lit_companies row resolves.
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "lit:selectedCompany",
            JSON.stringify({
              company_id: slug,
              source_company_key: companyKey,
              name: company.name,
              title: company.name,
              domain: company.website || null,
              website: company.website || null,
              country_code: company.country_code || null,
              address: company.address || null,
              kpis: {
                shipments_12m: company.shipments_12m ?? company.shipments ?? null,
                teu_12m: company.teu_estimate ?? null,
                last_activity: company.last_shipment ?? null,
                top_route_12m: null,
                recent_route: null,
                est_spend_12m: null,
              },
            }),
          );
        }
      } catch {
        /* localStorage quota / private mode — non-fatal */
      }

      navigate(`/app/companies/${encodeURIComponent(slug)}`);
    } catch (error: any) {
      console.error("[viewAndOpen] failed:", error);
      if (error instanceof LimitExceededError) {
        setUpgradeModal({
          ok: false,
          code: "LIMIT_EXCEEDED",
          feature: error.feature as any,
          used: error.used,
          limit: error.limit,
          plan: error.plan,
          reset_at: null,
          upgrade_url: error.upgrade_url || "/app/billing",
          message: error.message,
        });
      } else {
        toast({
          title: "Could not open company",
          description: error?.message || "Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setViewingId(null);
    }
  };

  // Phase D client-side filter pipeline. Applies the 4 approved chips
  // (TEU Range, Load Type, Top Container, Saved Only) to `results` in-memory.
  // Zero new network calls. Every field read here is already on the mapped
  // company rows from the existing searchShippers → fetchSearchKpiOverlay
  // path. When every chip is at its default value the filter is a
  // pass-through identity, so unfiltered UX is byte-for-byte unchanged.
  const filteredResults = useMemo(() => {
    const locQ = locationQuery.trim().toLowerCase();
    return results.filter((co) => {
      // TEU range — fall back to overlay-supplied latest_year_teu when
      // teu_estimate is missing. Lenient: rows with no TEU at all are
      // kept (so the filter narrows what it can verify rather than
      // wiping the result set).
      if (teuRange !== "any") {
        const tRaw =
          typeof co.teu_estimate === "number" ? co.teu_estimate : null;
        const tFallback =
          typeof (co as any).latest_year_teu === "number"
            ? Number((co as any).latest_year_teu)
            : null;
        const t = tRaw ?? tFallback;
        if (t != null && Number.isFinite(t)) {
          if (teuRange === "<=1k" && t > 1000) return false;
          if (teuRange === "1k-10k" && (t <= 1000 || t > 10000)) return false;
          if (teuRange === "10k-100k" && (t <= 10000 || t > 100000)) return false;
          if (teuRange === ">100k" && t <= 100000) return false;
        }
      }
      // Load type — only reject if row has a percentage AND it disagrees
      // with the chosen direction. Rows missing the field pass through.
      if (loadType === "fcl") {
        const pct =
          (co as any).fcl_shipments_perc ?? (co as any).fcl_percent;
        if (pct != null && Number(pct) < 50) return false;
      }
      if (loadType === "lcl") {
        const pct =
          (co as any).lcl_shipments_perc ?? (co as any).lcl_percent;
        if (pct != null && Number(pct) < 50) return false;
      }
      // Top container — only reject when we can confidently classify the
      // container length AND it doesn't match. Missing data = pass.
      if (topContainer !== "any") {
        const raw = (co as any).top_container_length;
        if (raw) {
          const code = canonicalContainerCode(raw);
          if (code && code !== topContainer) return false;
        }
      }
      // Location — match substring in city OR state OR country (case
      // insensitive). Missing fields just don't match (so empty input
      // means everyone passes).
      if (locQ) {
        const city = String(co.city || "").toLowerCase();
        const state = String(co.state || "").toLowerCase();
        const country = String(co.country || "").toLowerCase();
        const cc = String(co.country_code || "").toLowerCase();
        if (
          !city.includes(locQ) &&
          !state.includes(locQ) &&
          !country.includes(locQ) &&
          !cc.includes(locQ)
        ) {
          return false;
        }
      }
      if (savedOnly) {
        const key =
          (co as any).importyeti_key ||
          ((co as any).company_id ? `company/${(co as any).company_id}` : null);
        if (!key || !savedCompanyIds.includes(key)) return false;
      }
      return true;
    });
  }, [
    results,
    teuRange,
    loadType,
    topContainer,
    savedOnly,
    savedCompanyIds,
    locationQuery,
  ]);

  const hasActiveFilter =
    teuRange !== "any" ||
    loadType !== "any" ||
    topContainer !== "any" ||
    savedOnly ||
    locationQuery.trim().length > 0;

  const clearFilters = () => {
    setTeuRange("any");
    setLoadType("any");
    setTopContainer("any");
    setSavedOnly(false);
    setLocationQuery("");
  };

  // KPI strip values — Total / Active / Avg TEU / Saved. All read from
  // already-fetched results or existing savedCompanyIds. `—` when empty.
  const kpiTotal = results.length;
  const kpiActive = results.filter((co) => (co.shipments || 0) > 0).length;
  const kpiAvgTeu = (() => {
    const vals = results
      .map((co) => co.teu_estimate)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  })();
  const kpiSaved = savedCompanyIds.length;

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-500" />
          <h2 className="font-display text-base font-bold text-slate-900">
            Initializing…
          </h2>
          <p className="font-body mt-1 text-[12px] text-slate-500">
            Preparing your search experience
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Hero — eyebrow + title + view-mode + year picker */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-end md:justify-between md:px-5 md:py-4">
            <div className="min-w-0">
              <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-blue-500">
                Discover
              </div>
              <h1 className="font-display mt-1 text-[18px] font-bold tracking-tight text-slate-900 md:text-[20px]">
                Discover Companies
              </h1>
              <p className="font-body mt-0.5 text-[11.5px] text-slate-500">
                Global shipment and company intelligence
                {hasSearched && !searching && filteredResults.length > 0 ? (
                  <>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="font-mono font-semibold text-slate-700">
                      {filteredResults.length.toLocaleString()}
                    </span>{" "}
                    {filteredResults.length === 1 ? "company" : "companies"} shown
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 self-start md:self-auto">
              <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-pressed={viewMode === "grid"}
                  title="Grid view"
                  className={[
                    "font-display inline-flex h-7 w-7 items-center justify-center rounded transition",
                    viewMode === "grid"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800",
                  ].join(" ")}
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                  title="List view"
                  className={[
                    "font-display inline-flex h-7 w-7 items-center justify-center rounded transition",
                    viewMode === "list"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800",
                  ].join(" ")}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 md:inline-flex">
                <span className="font-display text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400">
                  Year
                </span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="font-mono bg-transparent text-[12px] font-semibold text-slate-800 outline-none"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* KPI strip — only after a search completes; pre-search the hero stays calm */}
          {hasSearched && (
            <LitKpiStrip
              cells={[
                {
                  label: "Total companies",
                  value: kpiTotal > 0 ? kpiTotal.toLocaleString() : "—",
                },
                {
                  label: "Active shippers",
                  value: kpiActive > 0 ? kpiActive.toLocaleString() : "—",
                },
                {
                  label: "Avg TEU / yr",
                  value:
                    kpiAvgTeu != null && kpiAvgTeu > 0
                      ? kpiAvgTeu.toLocaleString()
                      : "—",
                },
                {
                  label: "In command center",
                  value: kpiSaved > 0 ? kpiSaved.toLocaleString() : "—",
                },
              ]}
            />
          )}
        </div>

        <form
          onSubmit={handleSearch}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-3.5"
        >
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by company name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="font-body h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-10 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!authReady || searchQuery.length < 2 || searching}
              className="font-display inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 px-5 text-[13px] font-semibold text-white shadow-sm transition hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : !authReady ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating…
                </>
              ) : (
                <>
                  <SearchIcon className="h-3.5 w-3.5" />
                  Search
                </>
              )}
            </button>
          </div>
        </form>

        {/* Phase D — Inline filter chips. Only shown after a search, and
            only for filters backed by real fields already on the mapped
            results (teu_estimate, fcl_percent / lcl_percent,
            top_container_length via canonicalContainerCode, savedCompanyIds).
            No Carrier / Trade Lane / HS Code chips because those fields
            aren't on search results today. */}
        {hasSearched && (
          <LitSectionCard
            title="Filters"
            sub="Narrow down results — TEU range, load type, container size"
            action={
              hasActiveFilter ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="font-display inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <X className="h-2.5 w-2.5" />
                  Clear
                </button>
              ) : null
            }
            bodyClassName="px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {[
                {
                  label: "TEU Range",
                  value: teuRange,
                  onChange: (v: string) => setTeuRange(v as TeuRange),
                  options: [
                    { value: "any", label: "Any" },
                    { value: "<=1k", label: "≤1K" },
                    { value: "1k-10k", label: "1K–10K" },
                    { value: "10k-100k", label: "10K–100K" },
                    { value: ">100k", label: ">100K" },
                  ],
                },
                {
                  label: "Load Type",
                  value: loadType,
                  onChange: (v: string) => setLoadType(v as LoadType),
                  options: [
                    { value: "any", label: "Any" },
                    { value: "fcl", label: "FCL-heavy" },
                    { value: "lcl", label: "LCL-heavy" },
                  ],
                },
                {
                  label: "Top Container",
                  value: topContainer,
                  onChange: (v: string) => setTopContainer(v as TopContainer),
                  options: [
                    { value: "any", label: "Any" },
                    { value: "20FT", label: "20FT" },
                    { value: "40FT", label: "40FT" },
                    { value: "40HC", label: "40HC" },
                    { value: "45FT", label: "45FT" },
                  ],
                },
              ].map((group) => (
                <div key={group.label} className="flex items-center gap-2">
                  <span className="font-display text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400">
                    {group.label}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {group.options.map((opt) => {
                      const active = group.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => group.onChange(opt.value)}
                          aria-pressed={active}
                          className={[
                            "font-display inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-100",
                            active
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <span className="font-display text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400">
                  City / State
                </span>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    placeholder="e.g. Chicago, TX, China"
                    className="font-body h-7 w-44 rounded-md border border-slate-200 bg-white pl-7 pr-2 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-display text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400">
                  Saved Only
                </span>
                <button
                  type="button"
                  onClick={() => setSavedOnly((v) => !v)}
                  aria-pressed={savedOnly}
                  className={[
                    "font-display inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-100",
                    savedOnly
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {savedOnly && <Bookmark className="h-2.5 w-2.5" />}
                  {savedOnly ? "On" : "Off"}
                </button>
              </div>
            </div>
          </LitSectionCard>
        )}

        {hasSearched && (
          <LitSectionCard
            title="Results"
            sub={
              searching
                ? "Searching…"
                : hasActiveFilter && filteredResults.length !== results.length
                  ? `Showing ${filteredResults.length.toLocaleString()} of ${results.length.toLocaleString()} companies`
                  : `${filteredResults.length.toLocaleString()} ${filteredResults.length === 1 ? "company" : "companies"} matching your search`
            }
            padded={false}
          >
            {viewMode !== "list" ? (
              <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredResults.map((company, index) => {
                  const isSaved = Boolean(
                    company.importyeti_key &&
                      savedCompanyIds.includes(company.importyeti_key),
                  );
                  const flag = getCountryFlag(company.country_code);
                  const isActive =
                    company.status === "Active" && (company.shipments || 0) > 0;
                  const fclPct = company.fcl_shipments_perc ?? company.fcl_percent;
                  // Fall back to overlay-supplied latest_year_teu when the
                  // initial map missed teu_estimate (the IY hit didn't carry
                  // a TEU but the overlay row from lit_company_search_results
                  // does — earlier we only set latest_year_teu, never the
                  // teu_estimate the card reads).
                  const teuValue =
                    typeof company.teu_estimate === "number" &&
                    Number.isFinite(company.teu_estimate)
                      ? company.teu_estimate
                      : typeof (company as any).latest_year_teu === "number" &&
                          Number.isFinite((company as any).latest_year_teu)
                        ? (company as any).latest_year_teu
                        : null;
                  return (
                    <motion.div
                      key={company.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.02 + index * 0.015 }}
                      className="group flex flex-col gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-slate-300 hover:shadow-md"
                    >
                      {/* Header: avatar + name/location + status pill */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2.5">
                          {/* Pass `domain` so CompanyAvatar walks the full
                              logo cascade (logo.dev → clearbit → unavatar)
                              before falling back to initials. Passing only
                              logoUrl gave us a single-shot try and exhausted
                              when logo.dev returned 401/404. */}
                          <CompanyAvatar
                            name={company.name}
                            domain={company.website || null}
                            size="sm"
                            className="shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="font-display truncate text-[12.5px] font-bold text-slate-900 transition group-hover:text-blue-700">
                                {company.name}
                              </div>
                              {flag && (
                                <span className="text-[12px] leading-none">
                                  {flag}
                                </span>
                              )}
                            </div>
                            <div className="font-body mt-0.5 flex items-center gap-1 text-[10.5px] text-slate-500">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">
                                {company.city}
                                {company.state ? `, ${company.state}` : ""}
                              </span>
                            </div>
                          </div>
                        </div>

                        <span
                          className={[
                            "font-display inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]",
                            isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-50 text-slate-500",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "h-1 w-1 rounded-full",
                              isActive ? "bg-emerald-500" : "bg-slate-400",
                            ].join(" ")}
                          />
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </div>

                      {/* Saved indicator */}
                      {isSaved && (
                        <div className="font-display inline-flex w-fit items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-blue-700">
                          <Bookmark className="h-2.5 w-2.5 fill-current" />
                          Saved
                        </div>
                      )}

                      {/* KPI row */}
                      <div className="grid grid-cols-3 gap-1.5 rounded-md bg-slate-50 p-2">
                        <div>
                          <div className="font-display text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                            Shipments
                          </div>
                          <div className="font-mono mt-0.5 text-[12.5px] font-bold text-blue-700">
                            {company.shipments_12m
                              ? company.shipments_12m.toLocaleString()
                              : company.shipments.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="font-display text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                            TEU
                          </div>
                          <div className="font-mono mt-0.5 text-[12.5px] font-bold text-slate-800">
                            {teuValue != null
                              ? Math.round(teuValue).toLocaleString()
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="font-display text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                            Last
                          </div>
                          <div className="font-body mt-0.5 truncate text-[11px] font-semibold text-slate-700">
                            {formatSafeShipmentDate(company.last_shipment, "—")}
                          </div>
                        </div>
                      </div>

                      {/* Meta row: top supplier + container/FCL chips */}
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                        <span className="font-body inline-flex min-w-0 items-center gap-1 text-[10.5px] text-slate-500">
                          <Users className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">
                            {company.top_suppliers.length > 0
                              ? company.top_suppliers[0]
                              : "—"}
                          </span>
                          {company.top_suppliers.length > 1 && (
                            <span className="font-mono shrink-0 rounded bg-slate-100 px-1 py-px text-[9px] font-bold text-slate-500">
                              +{company.top_suppliers.length - 1}
                            </span>
                          )}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {company.top_container_length && (
                            <span className="font-display rounded border border-blue-200 bg-blue-50 px-1.5 py-px text-[9px] font-bold text-blue-700">
                              {company.top_container_length}
                            </span>
                          )}
                          {fclPct != null && (
                            <span className="font-display rounded border border-slate-200 bg-white px-1.5 py-px text-[9px] font-bold text-slate-600">
                              {Math.round(fclPct)}% FCL
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-auto flex gap-1.5 pt-0.5">
                        {/* View details — auto-saves the company and
                            navigates straight into the Command Center
                            company profile. The right-side preview drawer
                            was removed: the goal is to land users inside,
                            not give them another surface to scan from.
                            Already-saved rows skip the save and just
                            navigate. Styling mirrors the Pulse Coach
                            floating card so the two surfaces feel like
                            siblings. */}
                        <button
                          type="button"
                          onClick={() => viewAndOpenInCommandCenter(company)}
                          disabled={viewingId === (company.importyeti_key || company.id)}
                          className="font-display group/btn relative inline-flex h-8 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-white/10 text-[11px] font-semibold text-white shadow-[0_4px_14px_rgba(15,23,42,0.22)] transition hover:shadow-[0_8px_22px_rgba(15,23,42,0.28)] disabled:cursor-wait disabled:opacity-90"
                          style={{
                            background:
                              "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
                          }}
                        >
                          {/* subtle radial accent — same trick as the
                              Pulse Coach card */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute -top-6 -right-6 h-16 w-16 rounded-full opacity-60"
                            style={{
                              background:
                                "radial-gradient(circle, rgba(0,240,255,0.22), transparent 70%)",
                            }}
                          />
                          {viewingId === (company.importyeti_key || company.id) ? (
                            <>
                              <Loader2
                                className="h-3 w-3 animate-spin"
                                style={{ color: "#00F0FF" }}
                              />
                              <span className="relative">Opening…</span>
                            </>
                          ) : (
                            <>
                              <Eye
                                className="h-3 w-3"
                                style={{ color: "#00F0FF" }}
                              />
                              <span className="relative">View details</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveToCommandCenter(company)}
                          disabled={saving || isSaved}
                          title={isSaved ? "Saved" : "Save to Command Center"}
                          className={[
                            "font-display inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition",
                            isSaved
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                            saving && "opacity-60",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {isSaved ? (
                            <Bookmark className="h-3.5 w-3.5 fill-current" />
                          ) : (
                            <BookmarkPlus className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse">
                  <thead>
                    <tr className="bg-[#FAFBFC]">
                      {[
                        "Company",
                        "Location",
                        "Shipments",
                        "Top container",
                        "FCL / LCL",
                        "Last shipment",
                        "",
                      ].map((h, i) => (
                        <th
                          key={`${h}-${i}`}
                          className={[
                            "font-display whitespace-nowrap border-b border-slate-100 px-3.5 py-2.5 text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400",
                            i === 6 ? "text-right" : "text-left",
                          ].join(" ")}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((company) => {
                      const isSaved = Boolean(
                        company.importyeti_key &&
                          savedCompanyIds.includes(company.importyeti_key),
                      );
                      const cappedForBadge = capFutureDate(company.last_shipment);
                      const badgeInfo = cappedForBadge
                        ? getDateBadgeInfo(cappedForBadge)
                        : null;
                      return (
                        <tr
                          key={company.id}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60"
                        >
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <CompanyAvatar
                                name={company.name}
                                domain={company.website || null}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div className="font-display truncate text-[12.5px] font-bold text-slate-900">
                                  {company.name}
                                </div>
                                {company.website && (
                                  <div className="font-mono truncate text-[10px] text-slate-400">
                                    {company.website}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="font-body text-[12px] text-slate-700">
                              {company.city}
                              {company.state ? `, ${company.state}` : ""}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400">
                              {company.country_code}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <span className="font-mono text-[12.5px] font-bold text-slate-900">
                              {company.shipments.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="font-display text-[11.5px] font-semibold text-slate-800">
                              {company.top_container_length || "—"}
                            </div>
                            <div className="font-body text-[10px] text-slate-400">
                              {company.top_container_count != null
                                ? `${company.top_container_count.toLocaleString()} units`
                                : "—"}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <span className="font-mono text-[11.5px] text-slate-700">
                              {company.fcl_percent != null && company.lcl_percent != null
                                ? `${Math.round(company.fcl_percent)}% / ${Math.round(company.lcl_percent)}%`
                                : "—"}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-body whitespace-nowrap text-[11.5px] text-slate-700">
                                {formatSafeShipmentDate(company.last_shipment, "—")}
                              </span>
                              {badgeInfo && (
                                <span
                                  className={[
                                    "font-display inline-flex items-center rounded border px-1 py-px text-[9px] font-bold uppercase tracking-[0.06em]",
                                    badgeInfo.color === "green"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : badgeInfo.color === "yellow"
                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                        : "border-slate-200 bg-slate-50 text-slate-500",
                                  ].join(" ")}
                                >
                                  {badgeInfo.label}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => viewAndOpenInCommandCenter(company)}
                                disabled={viewingId === (company.importyeti_key || company.id)}
                                title="Open in Command Center"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-white shadow-[0_2px_6px_rgba(15,23,42,0.2)] transition hover:shadow-md disabled:cursor-wait disabled:opacity-90"
                                style={{
                                  background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
                                }}
                              >
                                {viewingId === (company.importyeti_key || company.id) ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    style={{ color: "#00F0FF" }}
                                  />
                                ) : (
                                  <Eye
                                    className="h-3.5 w-3.5"
                                    style={{ color: "#00F0FF" }}
                                  />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => saveToCommandCenter(company)}
                                disabled={saving || isSaved}
                                title={isSaved ? "Saved" : "Save"}
                                className={[
                                  "inline-flex h-7 w-7 items-center justify-center rounded-md border transition",
                                  isSaved
                                    ? "border-blue-200 bg-blue-50 text-blue-700"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                                ].join(" ")}
                              >
                                {isSaved ? (
                                  <Bookmark className="h-3.5 w-3.5 fill-current" />
                                ) : (
                                  <BookmarkPlus className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!searching && filteredResults.length === 0 && (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <SearchIcon className="h-5 w-5 text-slate-400" />
                </div>
                <p className="font-display text-[13px] font-bold text-slate-700">
                  No companies found
                </p>
                <p className="font-body mt-1 text-[11.5px] text-slate-500">
                  Try a different query or clear the active filters.
                </p>
              </div>
            )}
          </LitSectionCard>
        )}

        {!hasSearched && (
          <LitSectionCard padded={false}>
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 ring-1 ring-blue-100">
                <Sparkles className="h-6 w-6 text-blue-500" />
              </div>
              <h3 className="font-display text-[15px] font-bold text-slate-900">
                Start your search
              </h3>
              <p className="font-body mx-auto mt-1 max-w-md text-[12px] text-slate-500">
                Enter a company name to discover trade intelligence and preview
                KPI insights before saving to Command Center.
              </p>
            </div>
          </LitSectionCard>
        )}

      </div>
      <UpgradeModal limit={upgradeModal} onClose={() => setUpgradeModal(null)} />
    </div>
  );
}
