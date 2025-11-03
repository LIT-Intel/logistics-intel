import React, { useEffect, useMemo, useState } from "react";
import { searchCompanies, getFilterOptions } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";

type FiltersState = {
  mode?: string[];
  origin?: string[];
  dest?: string[];
};

type Suggestion = {
  company_name?: string;
  name?: string;
};

type SearchRow = {
  company_id?: string;
  company_name?: string;
  name?: string;
  shipments_12m?: number | null;
  last_activity?: string | null;
  top_routes?: Array<{ origin_country?: string; dest_country?: string }>; 
};

const toDisplayName = (row: Suggestion) => row.company_name ?? row.name ?? "Unnamed";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const dq = useDebounce(q.trim(), 300);

  const [filters, setFilters] = useState<FiltersState>({});
  const [mode, setMode] = useState<"air" | "ocean" | undefined>(undefined);
  const [origin, setOrigin] = useState<string[]>([]);
  const [dest, setDest] = useState<string[]>([]);
  const [hsText, setHsText] = useState("");

  const [rows, setRows] = useState<SearchRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const hs = useMemo(
    () => hsText.split(",").map((s) => s.trim()).filter(Boolean),
    [hsText]
  );

  const buildPayload = (nextOffset = offset, nextLimit = limit) => ({
    q: q.trim() || "",
    mode,
    hs: hs.length ? hs : undefined,
    origin: origin.length ? origin : undefined,
    dest: dest.length ? dest : undefined,
    limit: nextLimit,
    offset: nextOffset,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError(null);
        const resp = await getFilterOptions();
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`GET /public/getFilterOptions \u2014 ${resp.status} ${text}`);
        }
        const data = await resp.json();
        if (!alive) return;
        const asArray = (value: unknown) =>
          Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
        setFilters({
          mode: asArray(data?.modes ?? data?.mode ?? data?.modes_available),
          origin: asArray(data?.origins ?? data?.origin ?? data?.originCountries ?? data?.origin_options),
          dest: asArray(data?.dests ?? data?.dest ?? data?.destCountries ?? data?.dest_options),
        });
      } catch (e: any) {
        if (alive) setError(e.message || "Failed to load filters.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const runSearch = async (nextOffset = offset) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await searchCompanies(buildPayload(nextOffset));
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`POST /public/searchCompanies \u2014 ${resp.status} ${text}`);
      }
      const data = await resp.json();
      const nextRows = Array.isArray(data?.rows)
        ? data.rows
        : (Array.isArray(data?.results) ? data.results : []);
      setRows(nextRows);
      const mappedTotal =
        typeof data?.total === "number"
          ? data.total
          : typeof data?.count === "number"
          ? data.count
          : typeof data?.meta?.total === "number"
          ? data.meta.total
          : nextRows.length;
      setTotal(mappedTotal);
      setOffset(nextOffset);
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setError(e.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (dq.length < 2) {
        setSuggestions([]);
        setAutoLoading(false);
        return;
      }
      try {
        setAutoLoading(true);
        const resp = await searchCompanies({ q: dq, limit: 5, offset: 0 });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`POST /public/searchCompanies (autocomplete) \u2014 ${resp.status} ${text}`);
        }
        const data = await resp.json();
        if (alive) {
          const list = Array.isArray(data?.rows)
            ? data.rows
            : (Array.isArray(data?.results) ? data.results : []);
          const seen = new Set<string>();
          setSuggestions(
            list.filter((item: Suggestion) => {
              const key = toDisplayName(item).toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
          );
        }
      } catch {
        if (alive) setSuggestions([]);
      } finally {
        if (alive) setAutoLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [dq]);

  const handleSearch = () => {
    setLimit((prev) => Math.min(Math.max(prev, 1), 50));
    runSearch(0);
  };

  const handlePrev = () => {
    const nextOffset = Math.max(0, offset - limit);
    if (nextOffset !== offset) runSearch(nextOffset);
  };

  const handleNext = () => {
    const nextOffset = offset + limit;
    runSearch(nextOffset);
  };

  const canGoNext = offset + limit < total;

  const renderRange = () => {
    if (!rows.length) return `Total: ${total}`;
    const start = offset + 1;
    const end = Math.min(total, offset + rows.length);
    return `Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${total.toLocaleString()}`;
  };

  return (
    <div className="space-y-4 p-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-start">
        <div className="flex-1 min-w-[240px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="Search companies?"
            disabled={loading}
          />
          {autoLoading && <div className="mt-1 text-xs text-gray-500">Loading suggestions?</div>}
          {!autoLoading && suggestions.length > 0 && (
            <div className="mt-1 max-h-64 overflow-auto rounded border bg-white shadow">
              {suggestions.map((s, idx) => (
                <button
                  key={`${toDisplayName(s)}-${idx}`}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => setQ(toDisplayName(s))}
                  disabled={loading}
                >
                  {toDisplayName(s)}
                </button>
              ))}
            </div>
          )}
        </div>

        <select
          value={mode ?? ""}
          onChange={(e) => setMode((e.target.value || undefined) as any)}
          disabled={loading}
          className="rounded border px-2 py-2"
        >
          <option value="">All modes</option>
          <option value="air">Air</option>
          <option value="ocean">Ocean</option>
        </select>

        <select
          multiple
          value={origin}
          onChange={(e) => setOrigin(Array.from(e.target.selectedOptions).map((opt) => opt.value))}
          disabled={loading}
          className="min-h-[80px] rounded border px-2 py-2"
        >
          {(filters.origin ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        <select
          multiple
          value={dest}
          onChange={(e) => setDest(Array.from(e.target.selectedOptions).map((opt) => opt.value))}
          disabled={loading}
          className="min-h-[80px] rounded border px-2 py-2"
        >
          {(filters.dest ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <input
          value={hsText}
          onChange={(e) => setHsText(e.target.value)}
          placeholder="HS codes (comma-separated)"
          disabled={loading}
          className="rounded border px-3 py-2"
        />

        <button
          onClick={handleSearch}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Searching?" : "Search"}
        </button>
      </div>

      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm text-gray-600">{renderRange()}</div>
        {rows.length === 0 ? (
          <div className="text-sm text-gray-500">No results yet. Adjust your filters and try again.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Shipments (12m)</th>
                <th className="px-3 py-2">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row, idx) => (
                <tr key={`${row.company_id ?? toDisplayName(row)}-${idx}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{row.company_name ?? row.name ?? '?'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.shipments_12m != null ? row.shipments_12m.toLocaleString() : '?'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.last_activity ?? '?'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-4 flex gap-2">
          <button
            disabled={loading || offset === 0}
            onClick={handlePrev}
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          >
            Prev
          </button>
          <button
            disabled={loading || !canGoNext}
            onClick={handleNext}
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
