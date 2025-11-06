import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/ui/use-toast";
import ShipperCard from "@/components/search/ShipperCard";
import CompanyCard from "@/components/search/CompanyCard";
import CompanyModal from "@/components/search/CompanyModal";
import {
  getFilterOptions,
  postImportYetiSearch,
  saveCompanyToCrm,
  searchCompanies,
  getCompanyKey,
} from "@/lib/api";
import type { ImportYetiSearchRow } from "@/types/importyeti";
import type { SearchRow } from "@/lib/types";

const ENABLE_ADV = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ENABLE_ADVANCED_FILTERS === "true")
  || (typeof import.meta !== "undefined" && (import.meta as any)?.env?.NEXT_PUBLIC_ENABLE_ADVANCED_FILTERS === "true");

const SHIPPER_PAGE_SIZE = 12;

type FilterOptions = {
  origin_countries: string[];
  dest_countries: string[];
  modes: string[];
  hs_top?: string[];
};

type ShipperState = {
  rows: ImportYetiSearchRow[];
  total: number;
  loading: boolean;
  error: string | null;
};

type ModalContext =
  | { mode: "shippers"; shipper: ImportYetiSearchRow }
  | { mode: "companies"; company: SearchRow };

export default function SearchPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [initializedFromQuery, setInitializedFromQuery] = useState(false);
  const [searchMode, setSearchMode] = useState<"shippers" | "companies">("shippers");
  const [keyword, setKeyword] = useState<string>("");
  const debouncedKeyword = useDebounce(keyword, 400);

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ origin_countries: [], dest_countries: [], modes: [] });
  const [transportMode, setTransportMode] = useState<"air" | "ocean" | "" | undefined>("");
  const [hs, setHs] = useState<string>("");
  const [origin, setOrigin] = useState<string[]>([]);
  const [dest, setDest] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [companyRows, setCompanyRows] = useState<SearchRow[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const [shipperState, setShipperState] = useState<ShipperState>({ rows: [], total: 0, loading: false, error: null });
  const [shipperPage, setShipperPage] = useState(1);

  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [savedSlugs, setSavedSlugs] = useState<Set<string>>(() => new Set());
  const [savingCompanyKey, setSavingCompanyKey] = useState<string | null>(null);
  const [savedCompanyKeys, setSavedCompanyKeys] = useState<Set<string>>(() => new Set());

  const [shouldAutoSearchCompanies, setShouldAutoSearchCompanies] = useState(false);
  const [modalContext, setModalContext] = useState<ModalContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFilterOptions()
      .then((data) => {
        if (cancelled) return;
        setFilterOptions({
          origin_countries: Array.isArray(data?.origin_countries) ? data.origin_countries : [],
          dest_countries: Array.isArray(data?.dest_countries) ? data.dest_countries : [],
          modes: Array.isArray(data?.modes) ? data.modes : [],
          hs_top: data?.hs_top,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!router.isReady || initializedFromQuery) return;
    const modeParam = router.query.mode === "companies" ? "companies" : "shippers";
    setSearchMode(modeParam);
    const qParam = typeof router.query.q === "string" ? router.query.q : "";
    setKeyword(qParam);
    setShouldAutoSearchCompanies(modeParam === "companies" && qParam.trim().length > 0);
    setInitializedFromQuery(true);
  }, [router.isReady, router.query, initializedFromQuery]);

  useEffect(() => {
    if (!router.isReady || !initializedFromQuery) return;
    const nextQuery: Record<string, string> = {};
    if (keyword.trim()) nextQuery.q = keyword.trim();
    if (searchMode !== "shippers") nextQuery.mode = searchMode;
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [keyword, searchMode, router, initializedFromQuery]);

  useEffect(() => {
    if (!initializedFromQuery || !shouldAutoSearchCompanies) return;
    runCompanySearch();
    setShouldAutoSearchCompanies(false);
  }, [initializedFromQuery, shouldAutoSearchCompanies, runCompanySearch]);

  useEffect(() => {
    if (searchMode === "shippers") {
      setShowFilters(false);
    }
  }, [searchMode]);

  useEffect(() => {
    if (searchMode !== "shippers") {
      setShipperState({ rows: [], total: 0, loading: false, error: null });
      return;
    }
    setShipperPage(1);
  }, [searchMode, debouncedKeyword]);

  useEffect(() => {
    if (searchMode !== "shippers") return;
    const term = debouncedKeyword.trim();
    if (!term) {
      setShipperState({ rows: [], total: 0, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setShipperState((prev) => ({ ...prev, loading: true, error: null }));
    postImportYetiSearch({
      keyword: term,
      limit: SHIPPER_PAGE_SIZE,
      offset: (shipperPage - 1) * SHIPPER_PAGE_SIZE,
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const total = Number.isFinite(Number(data?.meta?.total)) ? Number(data.meta.total) : rows.length;
        setShipperState({ rows, total, loading: false, error: null });
      })
      .catch((err: any) => {
        if (controller.signal.aborted) return;
        setShipperState({ rows: [], total: 0, loading: false, error: err?.message ?? "Search failed" });
      });
    return () => controller.abort();
  }, [searchMode, debouncedKeyword, shipperPage]);

  const computedHs = useMemo(() => {
    if (!hs.trim()) return undefined;
    if (hs.includes(",")) {
      const arr = hs.split(",").map((s) => s.trim()).filter(Boolean);
      return arr.length ? arr : undefined;
    }
    return hs.trim();
  }, [hs]);

  const runCompanySearch = useCallback(async () => {
    setCompanyLoading(true);
    setCompanyError(null);
    try {
      const res = await searchCompanies({
        q: keyword,
        mode: transportMode || undefined,
        hs: computedHs ?? undefined,
        origin: origin.length ? origin : undefined,
        dest: dest.length ? dest : undefined,
        limit: 20,
        offset: 0,
      });
      setCompanyRows(Array.isArray(res?.rows) ? (res.rows as SearchRow[]) : []);
    } catch (e: any) {
      setCompanyRows([]);
      setCompanyError(e?.message ?? "searchCompanies failed");
    } finally {
      setCompanyLoading(false);
    }
  }, [keyword, transportMode, computedHs, origin, dest]);

  const handleModeChange = (value: string) => {
    if (value === "shippers" || value === "companies") {
      setSearchMode(value);
    }
  };

  const handleSaveShipper = async (row: ImportYetiSearchRow) => {
    const slug = row.slug;
    setSavingSlug(slug);
    try {
      await saveCompanyToCrm({ company_name: row.title, slug, source: "importyeti" });
      setSavedSlugs((prev) => new Set(prev).add(slug));
      toast({ title: "Saved to Command Center", description: `${row.title} added from ImportYeti.` });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message ?? "Unable to save company", variant: "destructive" });
    } finally {
      setSavingSlug(null);
    }
  };

  const handleSaveCompany = async (row: SearchRow) => {
    const key = getCompanyKey(row);
    setSavingCompanyKey(key);
    try {
      await saveCompanyToCrm({ company_id: row.company_id ?? undefined, company_name: row.company_name, source: "companies" });
      setSavedCompanyKeys((prev) => new Set(prev).add(key));
      toast({ title: "Saved to Command Center", description: `${row.company_name} added to your workspace.` });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message ?? "Unable to save company", variant: "destructive" });
    } finally {
      setSavingCompanyKey(null);
    }
  };

  const handleViewShipper = (row: ImportYetiSearchRow) => setModalContext({ mode: "shippers", shipper: row });
  const handleViewCompany = (row: SearchRow) => setModalContext({ mode: "companies", company: row });
  const closeModal = () => setModalContext(null);

  const modalProps = useMemo(() => {
    if (!modalContext) return null;
    if (modalContext.mode === "shippers") {
      const slug = modalContext.shipper.slug;
      return {
        mode: "shippers" as const,
        shipper: modalContext.shipper,
        onSave: handleSaveShipper,
        saving: savingSlug === slug,
        saved: savedSlugs.has(slug),
      };
    }
    const key = getCompanyKey(modalContext.company);
    return {
      mode: "companies" as const,
      company: modalContext.company,
      onSave: handleSaveCompany,
      saving: savingCompanyKey === key,
      saved: savedCompanyKeys.has(key),
    };
  }, [modalContext, savingSlug, savedSlugs, savingCompanyKey, savedCompanyKeys]);

  const hasKeyword = keyword.trim().length > 0;
  const totalPages = searchMode === "shippers"
    ? shipperState.total > 0 ? Math.ceil(shipperState.total / SHIPPER_PAGE_SIZE) : 1
    : 1;

  const renderResults = () => {
    if (!hasKeyword && searchMode === "shippers") {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Start typing to search verified shippers.
        </div>
      );
    }

    if (searchMode === "shippers") {
      if (shipperState.loading) {
        return (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
            ))}
          </div>
        );
      }
      if (shipperState.error) {
        return (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
            {shipperState.error}
          </div>
        );
      }
      if (!shipperState.rows.length) {
        return (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            No shippers found. Try refining your keyword.
          </div>
        );
      }
      return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shipperState.rows.map((row) => (
            <ShipperCard
              key={row.slug}
              row={row}
              onView={handleViewShipper}
              onSave={handleSaveShipper}
              saving={savingSlug === row.slug}
              saved={savedSlugs.has(row.slug)}
            />
          ))}
        </div>
      );
    }

    if (companyLoading) {
      return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      );
    }
    if (companyError) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
          {companyError}
        </div>
      );
    }
    if (!companyRows.length) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Run a search to see results.
        </div>
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {companyRows.map((row) => {
          const key = getCompanyKey(row);
          return (
            <CompanyCard
              key={key}
              row={row}
              onOpen={handleViewCompany}
              onSave={handleSaveCompany}
              saving={savingCompanyKey === key}
              saved={savedCompanyKeys.has(key)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold text-slate-900">Search</h1>
        <p className="text-slate-600">
          Query the logistics intelligence index. Toggle between verified shippers (ImportYeti) and enriched companies (Lusha).
        </p>
      </div>

      <div>
        <ToggleGroup type="single" value={searchMode} onValueChange={handleModeChange} className="justify-start">
          <ToggleGroupItem
            value="shippers"
            className="rounded-full px-4 py-2 text-sm data-[state=on]:bg-indigo-600 data-[state=on]:text-white"
          >
            Shippers
          </ToggleGroupItem>
          <ToggleGroupItem
            value="companies"
            className="rounded-full px-4 py-2 text-sm data-[state=on]:bg-indigo-600 data-[state=on]:text-white"
          >
            Companies
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div>
          <label className="text-xs font-semibold block mb-1 text-slate-600">KEYWORD</label>
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            placeholder={searchMode === "shippers" ? "Search shippers by name…" : "Search companies…"}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchMode === "companies") {
                e.preventDefault();
                runCompanySearch();
              }
            }}
          />
        </div>

        {searchMode === "companies" && ENABLE_ADV && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
            </button>
            <span className="text-xs text-slate-500">Advanced filters apply to company searches only.</span>
          </div>
        )}

        {searchMode === "companies" && showFilters && ENABLE_ADV && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold block mb-1">MODE</label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={transportMode ?? ""}
                onChange={(e) => setTransportMode((e.target.value || undefined) as any)}
              >
                <option value="">Any</option>
                {filterOptions.modes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">HS (comma-separated)</label>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={hs}
                onChange={(e) => setHs(e.target.value)}
                placeholder="e.g. 9506, 4202"
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">ORIGIN COUNTRY</label>
              <select
                multiple
                className="w-full rounded-xl border border-slate-300 px-3 py-2 h-32"
                value={origin}
                onChange={(e) => setOrigin(Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {filterOptions.origin_countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">DESTINATION COUNTRY</label>
              <select
                multiple
                className="w-full rounded-xl border border-slate-300 px-3 py-2 h-32"
                value={dest}
                onChange={(e) => setDest(Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {filterOptions.dest_countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (searchMode === "companies") {
                runCompanySearch();
              }
            }}
            className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={searchMode === "companies" && companyLoading}
          >
            {searchMode === "companies" ? (companyLoading ? "Searching…" : "Search now") : "Search now"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Search results</h2>
            <p className="text-sm text-slate-500">
              {searchMode === "shippers"
                ? hasKeyword
                  ? `Found ${shipperState.total.toLocaleString()} shippers • Page ${shipperPage}`
                  : "Enter a keyword to start searching shippers."
                : companyRows.length
                  ? `Showing ${companyRows.length.toLocaleString()} companies`
                  : "Run a company search to see results."}
            </p>
          </div>
          {searchMode === "shippers" && shipperState.total > SHIPPER_PAGE_SIZE && (
            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setShipperPage((prev) => Math.max(1, prev - 1))}
                disabled={shipperPage === 1 || shipperState.loading}
              >
                Prev
              </button>
              <span className="text-sm text-slate-600">Page {shipperPage} of {totalPages}</span>
              <button
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setShipperPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={shipperPage >= totalPages || shipperState.loading}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {renderResults()}
      </div>

      {modalProps && (
        <CompanyModal
          open={Boolean(modalContext)}
          onClose={closeModal}
          {...modalProps}
        />
      )}
    </div>
  );
}
