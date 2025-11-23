import React, { useEffect, useState } from "react";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";
import ShipperCard from "@/components/search/ShipperCard";
import {
  searchShippers,
  type IyShipperHit,
  type IyRouteKpis,
  type IyMonthlySeriesPoint,
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

  const [routeKpis, setRouteKpis] = useState<IyRouteKpis | null>(null);
  const [routeKpisLoading, setRouteKpisLoading] = useState(false);
  const [routeKpisError, setRouteKpisError] = useState<string | null>(null);

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
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedShipper(null);
  };

  useEffect(() => {
    void fetchShippers(query, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        {/* Filter chips – UI only for now */}
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">Mode</span>
            {(["any", "ocean", "air"] as ModeFilter[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1 ${
                  mode === m
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {m === "any" ? "Any" : m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">Region</span>
            {(
              [
                ["global", "Global"],
                ["americas", "Americas"],
                ["emea", "EMEA"],
                ["apac", "APAC"],
              ] as [RegionFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRegion(value)}
                className={`rounded-full px-3 py-1 ${
                  region === value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">Activity</span>
            {(
              [
                ["12m", "12m Active"],
                ["24m", "24m"],
                ["all", "All time"],
              ] as [ActivityFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setActivity(value)}
                className={`rounded-full px-3 py-1 ${
                  activity === value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          {error && (
            <span className="text-rose-600">
              Search failed: {error}. Try again.
            </span>
          )}
          {!error && !loading && (
            <span>
              Showing {results.length} of {total} results for {" "}
              <span className="font-semibold">"{query}"</span>
            </span>
          )}
          {loading && <span>Searching ImportYeti…</span>}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((shipper) => (
            <button
              key={shipper.key || shipper.title}
              type="button"
              onClick={() => handleCardClick(shipper)}
              className="text-left"
            >
              <ShipperCard shipper={shipper} />
            </button>
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
        isLoading={routeKpisLoading}
        error={routeKpisError}
        onClose={handleModalClose}
        onSaveToCommandCenter={() => {
          // TODO: wire to Command Center save endpoint
        }}
        saveLoading={false}
      />
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
