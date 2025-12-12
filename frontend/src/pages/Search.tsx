import React, { useCallback, useEffect, useMemo, useState } from "react";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";
import ShipperCard from "@/components/search/ShipperCard";
import SearchFilters from "@/components/search/SearchFilters";
import {
  ensureCompanyKey,
  getIyCompanyProfile,
  listSavedCompanies,
  saveCompanyToCommandCenter,
  searchShippers,
  type IyCompanyProfile,
  type IyShipperHit,
} from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

type ModeFilter = "any" | "ocean" | "air";
type RegionFilter = "global" | "americas" | "emea" | "apac";
type ActivityFilter = "12m" | "24m" | "all";

const PAGE_SIZE = 25;

export default function SearchPage() {
  const { toast } = useToast();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedName, setDebouncedName] = useState("");

  const [mode, setMode] = useState<ModeFilter>("any");
  const [region, setRegion] = useState<RegionFilter>("global");
  const [activity, setActivity] = useState<ActivityFilter>("12m");

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<IyShipperHit[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedShipper, setSelectedShipper] = useState<IyShipperHit | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [companyProfile, setCompanyProfile] =
    useState<IyCompanyProfile | null>(null);
  const [companyEnrichment, setCompanyEnrichment] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [savedCompanies, setSavedCompanies] = useState<{ company_id: string }[]>(
    [],
  );
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Debounce search input (no third-party deps)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedName(searchInput.trim());
    }, 400);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // ---------------------------------------------------------------------------
  // Command Center saved companies (badge + card state)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    listSavedCompanies()
      .then((rows) => {
        const normalized = Array.isArray(rows)
          ? rows
              .map((record: any) => {
                const rawId = (
                  record?.company?.company_id ??
                  record?.company_id ??
                  record?.company?.id ??
                  record?.id ??
                  ""
                ).trim();
                const companyId = ensureCompanyKey(rawId);
                return companyId ? { company_id: companyId } : null;
              })
              .filter(
                (entry): entry is { company_id: string } => Boolean(entry),
              )
          : [];

        setSavedCompanies(normalized);
      })
      .catch((err) => {
        console.error("listSavedCompanies failed", err);
      });

    return () => controller.abort();
  }, []);

  const savedCompanyIds = useMemo(() => {
    const ids = new Set<string>();
    savedCompanies.forEach((entry) => {
      const normalized = ensureCompanyKey(entry?.company_id ?? "");
      if (normalized) ids.add(normalized);
    });
    return ids;
  }, [savedCompanies]);

  const getCanonicalCompanyId = (shipper: IyShipperHit | null) => {
    if (!shipper) return "";
    return ensureCompanyKey(
      shipper.companyKey ||
        shipper.key ||
        shipper.companyId ||
        shipper.name ||
        shipper.title ||
        "",
    );
  };

  const selectedCompanyId = useMemo(
    () => getCanonicalCompanyId(selectedShipper),
    [selectedShipper],
  );

  const isShipperSaved = useCallback(
    (shipper?: IyShipperHit | null) => {
      if (!shipper) return false;
      const companyId = getCanonicalCompanyId(shipper);
      if (!companyId) return false;
      return savedCompanyIds.has(companyId);
    },
    [savedCompanyIds],
  );

  // ---------------------------------------------------------------------------
  // Search shippers
  // ---------------------------------------------------------------------------

  const fetchShippers = useCallback(async (q: string, pageNum: number) => {
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await searchShippers({
        q,
        page: pageNum,
        pageSize: PAGE_SIZE,
      });

      setResults(payload.results);
      setTotal(payload.total);
    } catch (err: any) {
      console.error("searchShippers error:", err);
      setError(err?.message || "Search failed");
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    void fetchShippers(debouncedName, 1);
    // Filters are part of the UX; triggering a refresh here preserves
    // expected behavior even if the backend ignores these fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedName, mode, region, activity]);

  // ---------------------------------------------------------------------------
  // View details
  // ---------------------------------------------------------------------------

  const handleCardClick = (shipper: IyShipperHit) => {
    setSelectedShipper(shipper);
    setIsModalOpen(true);

    setCompanyProfile(null);
    setCompanyEnrichment(null);
    setProfileError(null);
    setProfileLoading(true);

    const canonicalKey = getCanonicalCompanyId(shipper);
    if (!canonicalKey) {
      setProfileError("Unable to determine company identifier.");
      setProfileLoading(false);
      return;
    }

    getIyCompanyProfile({
      companyKey: canonicalKey,
      query: debouncedName,
      userGoal:
        "Populate LIT Search detail modal with KPIs, spend analysis and pre-call brief",
    })
      .then(({ companyProfile, enrichment }) => {
        setCompanyProfile(companyProfile);
        setCompanyEnrichment(enrichment);
      })
      .catch((err: any) => {
        console.error("getIyCompanyProfile failed", err);
        setProfileError(err?.message || "Failed to load company profile");
      })
      .finally(() => {
        setProfileLoading(false);
      });
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedShipper(null);
    setCompanyProfile(null);
    setCompanyEnrichment(null);
    setProfileError(null);
  };

  // ---------------------------------------------------------------------------
  // Save to Command Center
  // ---------------------------------------------------------------------------

  const handleSaveToCommandCenter = useCallback(
    async (
      shipper?: IyShipperHit | null,
      profileOverride?: IyCompanyProfile | null,
    ) => {
      if (!shipper) return;
      const companyId = getCanonicalCompanyId(shipper);
      if (!companyId) {
        toast({
          variant: "destructive",
          title: "Missing company ID",
          description: "Unable to save this company.",
        });
        return;
      }
      if (savedCompanyIds.has(companyId)) {
        toast({
          title: "Already saved",
          description: "This company is already in Command Center.",
        });
        return;
      }
      if (savingCompanyId === companyId) return;

      setSavingCompanyId(companyId);
      try {
        await saveCompanyToCommandCenter({
          shipper,
          profile:
            profileOverride ||
            (selectedCompanyId === companyId ? companyProfile : null),
          stage: "prospect",
        });

        setSavedCompanies((prev) => {
          if (
            prev.some((entry) => ensureCompanyKey(entry.company_id) === companyId)
          ) {
            return prev;
          }
          return [...prev, { company_id: companyId }];
        });

        toast({
          title: "Saved to Command Center",
          description: `${
            shipper.title || shipper.name || "Company"
          } has been saved.`,
        });
      } catch (saveError) {
        const message =
          saveError instanceof Error
            ? saveError.message
            : "Unable to save this company right now.";
        toast({
          variant: "destructive",
          title: "Save failed",
          description: message,
        });
        console.error("[LIT] Save to Command Center failed", {
          shipper,
          error: saveError,
          companyId,
        });
      } finally {
        setSavingCompanyId(null);
      }
    },
    [
      companyProfile,
      savingCompanyId,
      savedCompanyIds,
      selectedCompanyId,
      toast,
    ],
  );

  const handleModalSave = useCallback(
    (payload: { shipper: IyShipperHit; profile: IyCompanyProfile | null }) => {
      void handleSaveToCommandCenter(payload.shipper, payload.profile);
    },
    [handleSaveToCommandCenter],
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              LIT Search Shipper Search
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Search the LIT Search DMA index for verified shippers, view live
              BOL activity, and save companies to Command Center.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-800">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
                <span className="text-[11px] font-semibold">AI</span>
              </span>
              Gemini runs enrichment automatically after you open details.
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-10 pt-5 md:px-6">
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm md:flex-row md:items-center">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600">
              Company name
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Search shippers (e.g. Nike, Home Depot)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2 md:flex-nowrap">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setPage(1);
                setDebouncedName(searchInput.trim());
              }}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <SearchFilters
            value={{ mode, region, activity }}
            onChange={(next) => {
              setMode(next.mode);
              setRegion(next.region);
              setActivity(next.activity);
            }}
            className="flex-1"
          />
        </div>

        <div className="mt-4 text-xs text-slate-500">
          {error && (
            <span className="text-rose-600">
              Search failed: {error}. Try again.
            </span>
          )}
          {!error && !loading && (
            <span>
              Showing {results.length} of {total} results for{" "}
              <span className="font-semibold">&quot;{debouncedName}&quot;</span>
            </span>
          )}
          {loading && <span>Searching LIT Search…</span>}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((shipper) => {
            const companyId = getCanonicalCompanyId(shipper);
            const saved = companyId ? savedCompanyIds.has(companyId) : false;
            const saving = companyId ? savingCompanyId === companyId : false;
            return (
              <div key={shipper.key || shipper.title} className="text-left">
                <ShipperCard
                  shipper={shipper}
                  onViewDetails={handleCardClick}
                  onToggleSaved={handleSaveToCommandCenter}
                  isSaved={saved}
                  saving={saving}
                />
              </div>
            );
          })}
        </div>

        {total > PAGE_SIZE && (
          <div className="mt-6 flex items-center justify-between text-xs text-slate-600">
            <span>
              Page {page} • {total.toLocaleString()} total companies
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(1, page - 1);
                  setPage(next);
                  void fetchShippers(debouncedName, next);
                }}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => {
                  const maxPage = Math.ceil(total / PAGE_SIZE);
                  const next = Math.min(maxPage, page + 1);
                  setPage(next);
                  void fetchShippers(debouncedName, next);
                }}
                disabled={loading || results.length < PAGE_SIZE}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>

      <ShipperDetailModal
        isOpen={isModalOpen}
        shipper={selectedShipper}
        loadingProfile={profileLoading}
        profile={companyProfile}
        routeKpis={companyProfile?.routeKpis ?? null}
        enrichment={companyEnrichment}
        error={profileError}
        isSaved={isShipperSaved(selectedShipper)}
        onClose={handleModalClose}
        onSaveToCommandCenter={handleModalSave}
        saveLoading={Boolean(
          selectedCompanyId && savingCompanyId === selectedCompanyId,
        )}
      />
    </div>
  );
}
