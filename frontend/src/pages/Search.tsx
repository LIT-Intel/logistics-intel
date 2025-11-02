import { useEffect, useMemo, useState } from "react";
import { getFilterOptions, searchCompanies } from "@/lib/api";

const ENABLE_ADV = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ENABLE_ADVANCED_FILTERS === "true")
  || (typeof import.meta !== "undefined" && (import.meta as any)?.env?.NEXT_PUBLIC_ENABLE_ADVANCED_FILTERS === "true");

type FilterOptions = {
  origin_countries: string[];
  dest_countries: string[];
  modes: string[];
  hs_top?: string[];
};

type SearchRow = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
  top_routes?: Array<{ route?: string; origin_country?: string; dest_country?: string }>;
  top_carriers?: Array<{ carrier?: string }>;
};

export default function SearchPage() {
  const [q, setQ] = useState<string>("");
  const [mode, setMode] = useState<"air" | "ocean" | "" | undefined>("");
  const [hs, setHs] = useState<string>("");
  const [origin, setOrigin] = useState<string[]>([]);
  const [dest, setDest] = useState<string[]>([]);
  const [options, setOptions] = useState<FilterOptions>({ origin_countries: [], dest_countries: [], modes: [] });
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFilterOptions()
      .then((data) => {
        if (cancelled) return;
        setOptions({
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

  const computedHs = useMemo(() => {
    if (!hs.trim()) return undefined;
    if (hs.includes(",")) {
      const arr = hs.split(",").map((s) => s.trim()).filter(Boolean);
      return arr.length ? arr : undefined;
    }
    return hs.trim();
  }, [hs]);

  async function runSearch() {
    setLoading(true);
    setErr(null);
    try {
      const res = await searchCompanies({
        q,
        mode: mode || undefined,
        hs: computedHs ?? undefined,
        origin: origin.length ? origin : undefined,
        dest: dest.length ? dest : undefined,
        limit: 20,
        offset: 0,
      });
      setRows(Array.isArray(res?.rows) ? res.rows : []);
    } catch (e: any) {
      setRows([]);
      setErr(e?.message ?? "searchCompanies failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <h1 className="text-4xl font-bold">Search</h1>
          <p className="text-slate-600 mt-1">Query the logistics intelligence index with filters for origin, destination, mode, and HS codes.</p>
        </div>
        <a
          className="ml-auto inline-flex items-center px-3 py-2 rounded-xl border text-slate-700 hover:bg-slate-50"
          href="/app/search/trends"
        >
          View Trends
        </a>
        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className="inline-flex items-center px-3 py-2 rounded-xl border text-slate-700 hover:bg-slate-50"
        >
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>
      </div>

      <div className="rounded-2xl border p-4 bg-white space-y-3">
        <div>
          <label className="text-xs font-semibold block mb-1">KEYWORD</label>
          <input
            className="w-full rounded-xl border p-3"
            placeholder="Search companies…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {showFilters && (
          <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold block mb-1">MODE</label>
            <select
              className="w-full rounded-xl border p-3"
              value={mode ?? ""}
              onChange={(e) => setMode((e.target.value || undefined) as any)}
            >
              <option value="">Any</option>
              {options.modes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">HS (comma-separated)</label>
            <input
              className="w-full rounded-xl border p-3"
              value={hs}
              onChange={(e) => setHs(e.target.value)}
              placeholder="e.g. 9506, 4202"
            />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">ORIGIN COUNTRY</label>
            <select
              multiple
              className="w-full rounded-xl border p-3 h-32"
              value={origin}
              onChange={(e) => setOrigin(Array.from(e.target.selectedOptions).map((o) => o.value))}
            >
              {options.origin_countries.map((c) => (
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
              className="w-full rounded-xl border p-3 h-32"
              value={dest}
              onChange={(e) => setDest(Array.from(e.target.selectedOptions).map((o) => o.value))}
            >
              {options.dest_countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          </div>
        )}

        {showFilters && ENABLE_ADV && (
          <div className="opacity-60 pointer-events-none">
            <div className="text-xs font-semibold">Advanced (coming soon)</div>
            <div className="grid md:grid-cols-3 gap-3 mt-2">
              <input className="rounded-xl border p-3" placeholder="Origin city" />
              <input className="rounded-xl border p-3" placeholder="Origin state" />
              <input className="rounded-xl border p-3" placeholder="Origin port" />
              <input className="rounded-xl border p-3" placeholder="Dest city" />
              <input className="rounded-xl border p-3" placeholder="Dest state" />
              <input className="rounded-xl border p-3" placeholder="Dest ZIP" />
              <input className="rounded-xl border p-3" placeholder="Commodity type" />
            </div>
          </div>
        )}

        <button
          onClick={runSearch}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-600 text-white disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {err && (
        <div className="mt-4 rounded-xl bg-red-50 text-red-700 border border-red-200 p-3 text-sm break-all">
          {err}
        </div>
      )}

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        {rows.map((r) => (
          <div key={r.company_id} className="rounded-2xl border p-4 bg-white">
            <div className="font-semibold text-lg">{r.company_name}</div>
            <div className="text-sm text-slate-600">Shipments (12m): {r.shipments_12m ?? "—"}</div>
            <div className="text-sm text-slate-600">Last activity: {r.last_activity ?? "—"}</div>
            <div className="text-sm mt-2">
              <div className="font-medium">Top routes</div>
              <div className="text-slate-600">
                {Array.isArray(r.top_routes) && r.top_routes.length
                  ? r.top_routes
                      .map((t) => t.route || [t.origin_country, t.dest_country].filter(Boolean).join(" → "))
                      .filter(Boolean)
                      .join(" • ")
                  : "—"}
              </div>
            </div>
            <div className="text-sm mt-1">
              <div className="font-medium">Top carriers</div>
              <div className="text-slate-600">
                {Array.isArray(r.top_carriers) && r.top_carriers.length
                  ? r.top_carriers.map((t) => t.carrier ?? "").filter(Boolean).join(" • ") || "—"
                  : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && !err && rows.length === 0 && (
        <div className="mt-6 text-sm text-slate-500">No results yet. Run a search to see companies.</div>
      )}
    </div>
  );
}
