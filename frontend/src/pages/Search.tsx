import React, { useEffect, useMemo, useState } from "react";

type Mode = "shippers" | "companies";
type Row = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
};
type Resp = { meta: { total: number; page: number; page_size: number }; rows: Row[] };

const PAGE_SIZE = 20;

// Inline debounce to avoid extra imports
function useDebounce<T>(value: T, delay = 350) {
  const [d, setD] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

// Robust Gateway base
function getGatewayBase(): string {
  const envBase =
    (window as any).__ENV?.API_BASE ||
    (import.meta as any)?.env?.VITE_API_BASE ||
    (import.meta as any)?.env?.NEXT_PUBLIC_API_BASE;
  return (envBase && String(envBase)) || "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";
}

const getParam = (k: string) => new URL(window.location.href).searchParams.get(k);
const setParams = (obj: Record<string, string | null | undefined>) => {
  const url = new URL(window.location.href);
  Object.entries(obj).forEach(([k, v]) => {
    if (v == null || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  });
  window.history.replaceState({}, "", url.toString());
};

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>((getParam("mode") as Mode) || "shippers");
  const [q, setQ] = useState<string>(getParam("q") || "");
  const [page, setPage] = useState<number>(Math.max(1, parseInt(getParam("page") || "1", 10) || 1));

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dq = useDebounce(q, 350);

  // reset page when inputs change
  useEffect(() => setPage(1), [dq, mode]);

  // reflect state in URL
  useEffect(() => setParams({ mode, q: dq || null, page: String(page) }), [mode, dq, page]);

  const offset = useMemo(() => (page - 1) * PAGE_SIZE, [page]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);

      // Companies mode is a placeholder for now
      if (mode === "companies") {
        setRows([]);
        setTotal(0);
        return;
      }

      setLoading(true);
      try {
        const base = getGatewayBase();
        const key = (window as any).__ENV?.GCP_API_KEY ?? ""; // optional API key when gateway enforces it
        const r = await fetch(`${base}/public/searchCompanies${key ? `?key=${key}` : ""}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            q: dq || null,
            origin: null,
            dest: null,
            hs: null,
            limit: PAGE_SIZE,
            offset,
          }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status} – ${await r.text()}`);
        const data: Resp = await r.json();
        if (!cancelled) {
          setRows(Array.isArray(data.rows) ? data.rows : []);
          setTotal(Number(data.meta?.total ?? 0));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [mode, dq, offset]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-24">
      <header className="pt-8 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Search</h1>
        <p className="text-sm text-slate-500">Find shippers now; companies (Lusha) next.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <div className="inline-flex rounded-2xl border border-slate-200 p-0.5">
          <button
            onClick={() => setMode("shippers")}
            className={`px-3 py-1.5 text-sm rounded-2xl ${
              mode === "shippers" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
            aria-pressed={mode === "shippers"}
          >
            Shippers
          </button>
          <button
            onClick={() => setMode("companies")}
            className={`px-3 py-1.5 text-sm rounded-2xl ${
              mode === "companies" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
            aria-pressed={mode === "companies"}
          >
            Companies
          </button>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by company name or alias…"
          className="w-full sm:w-80 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="flex items-center justify-between py-2">
        <div className="text-xs text-slate-500">
          {loading ? "Loading…" : total ? `${total} results` : "No results"}
        </div>
        <div className="text-xs text-slate-400">
          Page {page} / {totalPages}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {!error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r) => (
            <article key={r.company_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm uppercase tracking-wide text-slate-400">Company</div>
                  <div className="mt-0.5 text-base font-semibold text-slate-900">{r.company_name}</div>
                  <div className="text-[11px] uppercase text-slate-400 mt-0.5">ID</div>
                  <div className="text-xs text-slate-600">{r.company_id}</div>
                </div>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                  Active
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[10px] uppercase text-slate-400">Shipments (12m)</div>
                  <div className="text-sm font-medium text-slate-900">{r.shipments_12m ?? "—"}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[10px] uppercase text-slate-400">Last Activity</div>
                  <div className="text-sm font-medium text-slate-900">{r.last_activity ?? "—"}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[10px] uppercase text-slate-400">Top Carrier</div>
                  <div className="text-sm font-medium text-slate-400">—</div>
                </div>
              </div>
              <div className="mt-4">
                <button
                  className="rounded-xl bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                  onClick={() => alert("Company drawer coming next")}
                >
                  View Details
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
        >
          Prev
        </button>
        <button
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= totalPages || loading}
        >
          Next
        </button>
      </div>
    </div>
  );
}
