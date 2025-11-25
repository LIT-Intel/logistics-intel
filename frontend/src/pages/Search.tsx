import React, { useEffect, useMemo, useState } from "react";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";
import ShipperCard from "@/components/search/ShipperCard";
import SearchFilters from "@/components/search/SearchFilters";
import {
  searchShippers,
  getIyCompanyProfile,
  getSavedCompanies,
  saveCompanyToCrm,
  type IyShipperHit,
  type IyRouteKpis,
  type IyMonthlySeriesPoint,
  type IyCompanyProfile,
} from "@/lib/api";

type ModeFilter = "any" | "ocean" | "air";
type RegionFilter = "global" | "americas" | "emea" | "apac";
type ActivityFilter = "12m" | "24m" | "all";

const PAGE_SIZE = 25;

export default function SearchPage() {
  const [query, setQuery] = useState("walmart");
  const [mode, setMode] = useState<ModeFilter>("any");
  const [region, setRegion] = useState<RegionFilter>("global");
  const [activity, setActivity] = useState<ActivityFilter>("12m");

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<IyShipperHit[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedShipper, setSelectedShipper] =
    useState<IyShipperHit | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [originCity, setOriginCity] = useState("");
  const [originState, setOriginState] = useState("");
  const [originCountry, setOriginCountry] = useState("");
  const [originPostal, setOriginPostal] = useState("");
  const [destCity, setDestCity] = useState("");
  const [destState, setDestState] = useState("");
  const [destCountry, setDestCountry] = useState("");
  const [destPostal, setDestPostal] = useState("");

  const [routeKpis, setRouteKpis] = useState<IyRouteKpis | null>(null);
  const [routeKpisLoading, setRouteKpisLoading] = useState(false);
  const [routeKpisError, setRouteKpisError] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] =
    useState<IyCompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function fetchShippers(q: string, pageNum: number) {
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const json: any = await searchShippers({
        q,
        page: pageNum,
        pageSize: PAGE_SIZE,
      });

      const rows: IyShipperHit[] = Array.isArray(json.results)
        ? json.results
        : Array.isArray(json.rows)
          ? json.rows
          : Array.isArray(json.data?.rows)
            ? json.data.rows
            : Array.isArray(json.data)
              ? json.data
              : [];

      const totalFromApi: number =
        typeof json.total === "number"
          ? json.total
          : typeof json.data?.total === "number"
            ? json.data.total
            : rows.length;

      setResults(rows);
      setTotal(totalFromApi);
    } catch (err: any) {
      console.error("iySearchShippers error:", err);
      setError(err?.message || "Search failed");
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    setPage(1);
    void fetchShippers(query, 1);
  };

  const handleCardClick = (shipper: IyShipperHit) => {
    setSelectedShipper(shipper);
    setIsModalOpen(true);

    setRouteKpisLoading(true);
    setRouteKpisError(null);
    try {
      const kpis = buildMockRouteKpisFromShipper(shipper);
      setRouteKpis(kpis);
    } catch (err) {
      console.error("Failed to build mock route KPIs", err);
      setRouteKpis(null);
      setRouteKpisError("Unable to derive route KPI sample for this shipper.");
    } finally {
      setRouteKpisLoading(false);
    }

    setCompanyProfile(null);
    setProfileError(null);
    setProfileLoading(true);
    const keyOrSlug = shipper.key || shipper.title || "";
    getIyCompanyProfile(keyOrSlug)
      .then((profile) => {
        setCompanyProfile(profile);
      })
      .catch((err: any) => {
        console.error("getIyCompanyProfile failed", err);
        setProfileError(
          err?.message || "Failed to load company profile",
        );
      })
      .finally(() => {
        setProfileLoading(false);
      });
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedShipper(null);
  };

  useEffect(() => {
    const controller = new AbortController();
    getSavedCompanies(controller.signal)
      .then((response) => {
        const rows = Array.isArray(response?.rows) ? response.rows : [];
        const next = new Set<string>();
        rows.forEach((record: any) => {
          const companyId =
            (record?.company?.company_id ??
              record?.company_id ??
              record?.company?.id ??
              "") || "";
          if (companyId) {
            next.add(String(companyId));
          }
        });
        setSavedKeys(next);
      })
      .catch((err) => {
        console.error("getSavedCompanies failed", err);
      });
    return () => controller.abort();
  }, []);

  const handleSaveToCommandCenter = async (shipper?: IyShipperHit | null) => {
    if (!shipper?.key || savingKey || savedKeys.has(shipper.key)) return;
    setSavingKey(shipper.key);
    try {
      await saveCompanyToCrm({
        company_id: shipper.key,
        company_name:
          shipper.title || shipper.name || shipper.normalizedName || "Company",
        source: "importyeti-search",
      });
      setSavedKeys((prev) => {
        const next = new Set(prev);
        next.add(shipper.key);
        return next;
      });
    } catch (error) {
      console.error("saveCompanyToCrm failed", error);
    } finally {
      setSavingKey(null);
    }
  };

  useEffect(() => {
    void fetchShippers(query, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAdvancedFilters =
    originCity ||
    originState ||
    originCountry ||
    originPostal ||
    destCity ||
    destState ||
    destCountry ||
    destPostal;

  const filteredResults = useMemo(() => {
    if (!hasAdvancedFilters) return results;
    return results.filter((shipper) => {
      const matchesOrigin =
        (!originCity ||
          shipper.city?.toLowerCase().includes(originCity.toLowerCase())) &&
        (!originState ||
          shipper.state?.toLowerCase().includes(originState.toLowerCase())) &&
        (!originCountry ||
          shipper.country
            ?.toLowerCase()
            .includes(originCountry.toLowerCase())) &&
        (!originPostal ||
          shipper.postalCode
            ?.toLowerCase()
            .includes(originPostal.toLowerCase()));

      const matchesDest =
        (!destCity ||
          (shipper.city ?? "")
            .toLowerCase()
            .includes(destCity.toLowerCase())) &&
        (!destState ||
          (shipper.state ?? "")
            .toLowerCase()
            .includes(destState.toLowerCase())) &&
        (!destCountry ||
          (shipper.country ?? "")
            .toLowerCase()
            .includes(destCountry.toLowerCase())) &&
        (!destPostal ||
          (shipper.postalCode ?? "")
            .toLowerCase()
            .includes(destPostal.toLowerCase()));

      return matchesOrigin && matchesDest;
    });
  }, [
    results,
    hasAdvancedFilters,
    originCity,
    originState,
    originCountry,
    originPostal,
    destCity,
    destState,
    destCountry,
    destPostal,
  ]);

  const handleResetAdvancedFilters = () => {
    setOriginCity("");
    setOriginState("");
    setOriginCountry("");
    setOriginPostal("");
    setDestCity("");
    setDestState("");
    setDestCountry("");
    setDestPostal("");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              ImportYeti Shipper Search
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Search the ImportYeti DMA index for verified shippers, view
              live BOL activity, and save companies to Command Center.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-10 pt-5 md:px-6">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm md:flex-row md:items-center"
        >
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600">
              Company name
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Search shippers (e.g. Walmart, Nike, Home Depot)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2 md:flex-nowrap">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </form>

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
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Filters
            {hasAdvancedFilters && (
              <span className="ml-2 inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-slate-900 px-2 text-[10px] font-semibold text-white">
                +
              </span>
            )}
          </button>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          {error && (
            <span className="text-rose-600">
              Search failed: {error}. Try again.
            </span>
          )}
          {!error && !loading && (
            <span>
              Showing {filteredResults.length} of {total} results for{" "}
              <span className="font-semibold">"{query}"</span>
            </span>
          )}
          {loading && <span>Searching ImportYeti…</span>}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredResults.map((shipper) => (
            <div key={shipper.key || shipper.title} className="text-left">
              <ShipperCard
                shipper={shipper}
                onViewDetails={handleCardClick}
                onToggleSaved={handleSaveToCommandCenter}
                isSaved={Boolean(shipper.key && savedKeys.has(shipper.key))}
              />
            </div>
          ))}
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
                  void fetchShippers(query, next);
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
                  void fetchShippers(query, next);
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
        routeKpis={routeKpis}
        loading={routeKpisLoading}
        error={routeKpisError}
        companyProfile={companyProfile}
        profileLoading={profileLoading}
        profileError={profileError}
        isSaved={
          !!(selectedShipper?.key && savedKeys.has(selectedShipper.key))
        }
        onClose={handleModalClose}
        onSaveToCommandCenter={handleSaveToCommandCenter}
        onToggleSaved={handleSaveToCommandCenter}
        saveLoading={
          !!(selectedShipper?.key && savingKey === selectedShipper.key)
        }
      />

      {filtersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Filters
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  Origin & destination
                </h2>
                <p className="text-sm text-slate-500">
                  Filter results by city, state, country, or postal code. Filters
                  are applied locally to the current results.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Origin
                </p>
                <div className="mt-2 space-y-2">
                  <input
                    value={originCity}
                    onChange={(e) => setOriginCity(e.target.value)}
                    placeholder="City"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    value={originState}
                    onChange={(e) => setOriginState(e.target.value)}
                    placeholder="State / Province"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    value={originCountry}
                    onChange={(e) => setOriginCountry(e.target.value)}
                    placeholder="Country"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    value={originPostal}
                    onChange={(e) => setOriginPostal(e.target.value)}
                    placeholder="Postal code"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Destination
                </p>
                <div className="mt-2 space-y-2">
                  <input
                    value={destCity}
                    onChange={(e) => setDestCity(e.target.value)}
                    placeholder="City"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    value={destState}
                    onChange={(e) => setDestState(e.target.value)}
                    placeholder="State / Province"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    value={destCountry}
                    onChange={(e) => setDestCountry(e.target.value)}
                    placeholder="Country"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    value={destPostal}
                    onChange={(e) => setDestPostal(e.target.value)}
                    placeholder="Postal code"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                Client-side filters are applied on top of search results.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAdvancedFilters}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildMockRouteKpisFromShipper(shipper: IyShipperHit): IyRouteKpis {
  const total =
    typeof shipper.totalShipments === "number" ? shipper.totalShipments : 0;
  const base = total || 1200;

  const teuFactor = 0.4;
  const spendPerShipment = 1500;

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const monthlySeries: IyMonthlySeriesPoint[] = months.map((label, index) => {
    const seasonalFactor = 0.7 + (index % 4) * 0.15;
    const shipmentsTotal = Math.round((base / 12) * seasonalFactor);

    const fclShare = 0.7;
    const shipmentsFcl = Math.round(shipmentsTotal * fclShare);
    const shipmentsLcl = Math.max(0, shipmentsTotal - shipmentsFcl);

    const teuFcl = Math.round(shipmentsFcl * teuFactor);
    const teuLcl = Math.round(shipmentsLcl * teuFactor * 0.6);

    const estSpendUsdFcl = shipmentsFcl * spendPerShipment * 1.1;
    const estSpendUsdLcl = shipmentsLcl * spendPerShipment * 0.7;

    return {
      monthLabel: label,
      shipmentsFcl,
      shipmentsLcl,
      teuFcl,
      teuLcl,
      estSpendUsdFcl,
      estSpendUsdLcl,
    };
  });

  const shipmentsLast12m = monthlySeries.reduce(
    (sum, m) => sum + m.shipmentsFcl + m.shipmentsLcl,
    0,
  );

  const teuLast12m = monthlySeries.reduce(
    (sum, m) => sum + (m.teuFcl ?? 0) + (m.teuLcl ?? 0),
    0,
  );

  const estSpendUsd = monthlySeries.reduce(
    (sum, m) => sum + (m.estSpendUsdFcl ?? 0) + (m.estSpendUsdLcl ?? 0),
    0,
  );

  return {
    shipmentsLast12m,
    teuLast12m,
    estSpendUsd,
    topRouteLast12m: "Ocean FCL + LCL mix",
    mostRecentRoute: "China → US main gateways",
    sampleSize: shipmentsLast12m,
    topRoutesLast12m: [
      {
        route: "FCL dominant lanes",
        shipments: Math.round(shipmentsLast12m * 0.65),
        teu: Math.round(teuLast12m * 0.7),
        estSpendUsd: estSpendUsd * 0.7,
      },
      {
        route: "LCL + mixed lanes",
        shipments: Math.round(shipmentsLast12m * 0.35),
        teu: Math.round(teuLast12m * 0.3),
        estSpendUsd: estSpendUsd * 0.3,
      },
    ],
    monthlySeries,
  };
}
