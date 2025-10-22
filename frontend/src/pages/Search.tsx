// src/pages/Search.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutGrid,
  List as ListIcon,
  Sliders,
  Zap,
  MapPin,
  Search as SearchIcon,
  ArrowRight,
  Lock,
  DollarSign,
  Ship,
  Clock,
  Box,
  TrendingUp,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { hasFeature } from "@/lib/access";
import { useSearch } from "@/app/search/useSearch";
import { getFilterOptions, getFilterOptionsOnce, saveCompanyToCrm, getCompanyKey } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import CompanyModal from "@/components/search/CompanyModal";
import { FiltersDrawer } from "@/components/FiltersDrawer";
import SearchEmpty from "@/components/SearchEmpty";

const STYLES = {
  brandPurple: "#7F3DFF",
  neutralGrayLight: "#F9FAFB",
};

function debounce<F extends (...args: any[]) => void>(fn: F, ms: number) {
  let t: number | undefined;
  return (...args: Parameters<F>) => {
    window.clearTimeout(t);
    // @ts-ignore
    t = window.setTimeout(() => fn(...args), ms);
  };
}

function kLastActivity(v: any): string {
  if (!v) return "—";
  if (typeof v === "object" && "value" in v) return String((v as any).value || "—");
  return String(v);
}

function ResultKPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 border border-gray-200 rounded-xl bg-white text-center min-h-[96px] flex flex-col items-center justify-center w-full overflow-hidden">
      <div className="flex items-center justify-center mb-1 shrink-0">{icon}</div>
      <div className="text-xl font-bold text-gray-900 truncate w-full" title={String(value ?? "—")}>
        {value ?? "—"}
      </div>
      <div className="text-[11px] uppercase text-gray-500 font-medium mt-1 truncate w-full" title={label}>
        {label}
      </div>
    </div>
  );
}

function SaveToCommandCenterButton({
  row,
  size = "sm",
  activeFilters,
}: {
  row: any;
  size?: "sm" | "md";
  activeFilters?: any;
}) {
  const { user } = useAuth() as any;
  const [saving, setSaving] = useState(false);

  const onClick = async () => {
    if (saving) return;
    const email = String(user?.email || "").toLowerCase();
    const allowed =
      email === "vraymond@logisticintel.com" ||
      email === "support@logisticintel.com" ||
      hasFeature("crm");
    if (!allowed) return;

    setSaving(true);
    try {
      const cname = String(row?.company_name || "");
      const cid = getCompanyKey({ company_id: row?.company_id, company_name: cname });
      try {
        await saveCompanyToCrm({ company_id: cid, company_name: cname, source: "search" });
      } catch {}
      try {
        localStorage.setItem(
          "lit:selectedCompany",
          JSON.stringify({ company_id: cid, name: cname, domain: (row as any)?.domain ?? null })
        );
      } catch {}
      try {
        window.location.href = "/app/command-center";
      } catch {}
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={cn("px-4 py-2 text-sm text-white rounded-lg transition hover:opacity-90")}
      style={{ backgroundColor: STYLES.brandPurple }}
    >
      {saving ? "Saving…" : "Save"}
    </button>
  );
}

function ResultCard({ r, onOpen }: { r: any; onOpen: (r: any) => void }) {
  const top = r.top_routes?.[0];
  const name = r.company_name;
  const id = r.company_id || "—";
  const shipments12m = r.shipments_12m ?? 0;
  const lastActivity = kLastActivity(r.last_activity);
  const totalTeus = (r as any)?.total_teus ?? "—";
  const growthRate =
    (r as any)?.growth_rate == null ? "—" : `${Math.round(Number((r as any)?.growth_rate) * 100)}%`;
  const initials = (name || "")
    .split(" ")
    .map((p: string) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const topBorder = { borderTop: `4px solid ${STYLES.brandPurple}` } as const;
  const alias = (r as any)?.domain || "";

  return (
    <div
      className="rounded-xl bg-white p-5 min-h-[220px] shadow-md hover:shadow-lg transition border border-gray-200 cursor-default"
      style={topBorder}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] text-slate-500">Company</div>
          <div className="truncate text-xl font-bold text-gray-900" title={name}>
            {name}
          </div>
          <div className="text-sm text-gray-500 truncate">{alias || `ID: ${id}`}</div>
          <div className="mt-2 flex items-center gap-2">
            <SaveToCommandCenterButton row={r} />
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => onOpen(r)}>
              Details
            </Button>
          </div>
        </div>
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center text-sm font-semibold select-none">
          {initials}
        </div>
      </div>
      <div className="mt-4 border-t border-b border-gray-200 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <ResultKPI icon={<Ship className="w-4 h-4" style={{ color: STYLES.brandPurple }} />} label="Shipments (12m)" value={shipments12m} />
        <ResultKPI icon={<Clock className="w-4 h-4 text-gray-500" />} label="Last Activity" value={lastActivity} />
        <ResultKPI icon={<Box className="w-4 h-4 text-gray-500" />} label="Total TEUs" value={totalTeus} />
        <ResultKPI icon={<TrendingUp className="w-4 h-4 text-gray-500" />} label="Growth Rate" value={growthRate} />
      </div>
      <div className="flex justify-between items-center mt-3">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          {top ? (
            <>
              <MapPin className="w-3.5 h-3.5 text-red-500" />
              {top.origin_country} → {top.dest_country}
            </>
          ) : (
            "No route data"
          )}
        </div>
        <button
          onClick={() => onOpen(r)}
          className="text-sm text-gray-700 hover:text-gray-900 font-medium inline-flex items-center"
        >
          Details <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
  );
}

function ResultsCards({ rows, onOpen, filters }: { rows: any[]; onOpen: (r: any) => void; filters: any }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {rows.map((r) => (
        <ResultCard
          key={getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name })}
          r={r}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function ResultsList({
  rows,
  onOpen,
  selectedKey,
  filters,
}: {
  rows: any[];
  onOpen: (r: any) => void;
  selectedKey?: string | null;
  filters: any;
}) {
  return (
    <div className="overflow-x-auto rounded-xl shadow-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            {["Company", "Shipments (12m)", "Last Activity", "Top Route", "Actions"].map((col) => (
              <th
                key={col}
                className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider bg-gray-50"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((r) => {
            const key = getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name });
            const top = r.top_routes?.[0];
            return (
              <tr
                key={key}
                className={cn(
                  "hover:bg-gray-50 transition",
                  selectedKey === key ? "ring-2 ring-indigo-500 ring-offset-1" : ""
                )}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <p className="font-medium text-gray-900 truncate max-w-[360px]" title={r.company_name}>
                    {r.company_name}
                  </p>
                  <p className="text-xs text-gray-500">ID: {r.company_id || "—"}</p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.shipments_12m ?? "—"}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{kLastActivity(r.last_activity)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center">
                  <MapPin className="w-4 h-4 mr-1 text-red-500" />{" "}
                  {top ? `${top.origin_country} → ${top.dest_country}` : "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <SaveToCommandCenterButton row={r} activeFilters={filters} />
                  <Button variant="ghost" size="sm" className="ml-2" onClick={() => onOpen(r)}>
                    Details
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SearchPage() {
  // keep existing wiring
  const { q, setQ, rows, loading, run, next, prev, page, filters, setFilters } = useSearch();

  // live suggestions (soft search)
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSug, setShowSug] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const suggestOnce = useRef(
    debounce(async (query: string) => {
      const q = query.trim();
      if (q.length < 2) {
        setSuggestions([]);
        setShowSug(false);
        return;
      }
      try {
        // try proxy first (keeps your current backend shape)
        const r = await fetch(`/api/lit/public/searchCompanies`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ q, pageSize: 10, page: 1, mode: "suggest" }),
        });
        if (!r.ok) throw new Error(`suggest ${r.status}`);
        const j = await r.json();
        const items = Array.isArray(j?.results) ? j.results : Array.isArray(j) ? j : [];
        setSuggestions(items);
        setShowSug(items.length > 0);
      } catch {
        setSuggestions([]);
        setShowSug(false);
      }
    }, 200)
  ).current;

  // click-away to close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setShowSug(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const [view, setView] = useState<"Cards" | "List" | "Filters" | "Explore">("List");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<any | null>(null);
  const [filterOptions, setFilterOptions] = useState<any>(null);

  useEffect(() => {
    const ac = new AbortController();
    getFilterOptionsOnce((signal?: AbortSignal) => getFilterOptions(signal), ac.signal)
      .then((data) => setFilterOptions(data))
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const hasSearched = (q || "").trim().length > 0;

  const dedupedRows = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const r of rows) {
      const key = getCompanyKey({ company_id: r?.company_id, company_name: r?.company_name });
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }, [rows]);

  const doSearch = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setShowSug(false);
      run(true);
    },
    [run]
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: STYLES.neutralGrayLight }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-[1400px] py-6">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Search</h1>
          <p className="text-base text-gray-600 mb-6">
            Find shippers &amp; receivers. Use filters for origin/dest/HS.
          </p>
        </header>

        {/* Search Bar + Suggestions */}
        <div className="relative mb-6" ref={boxRef}>
          <form onSubmit={doSearch} className="flex gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by company name or alias (e.g., UPS, Maersk)…"
                className="pl-9 h-12 text-base rounded-lg"
                value={q}
                onChange={(e) => {
                  const v = e.target.value;
                  setQ(v);
                  suggestOnce(v);
                }}
                onFocus={() => {
                  if ((q || "").trim().length >= 2 && suggestions.length > 0) setShowSug(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setShowSug(false);
                  if (e.key === "Escape") setShowSug(false);
                }}
                aria-autocomplete="list"
                aria-controls="search-suggestions"
                aria-expanded={showSug ? "true" : "false"}
              />

              {showSug && suggestions.length > 0 && (
                <div
                  id="search-suggestions"
                  role="listbox"
                  className="absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border border-gray-200 bg-white shadow-lg max-h-72 overflow-auto"
                >
                  {suggestions.slice(0, 10).map((s, i) => {
                    const label =
                      s.company_name || s.name || s.domain || s.company_id || s.title || String(s);
                    return (
                      <button
                        key={`${s.company_id || s.domain || label}-${i}`}
                        type="button"
                        role="option"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                        onClick={() => {
                          setQ(label);
                          setShowSug(false);
                          run(true);
                        }}
                        title={label}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{label}</span>
                          {s.domain && (
                            <span className="ml-2 text-xs text-gray-500 truncate">{s.domain}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Button data-test="search-button" type="submit" className="h-12 px-6 rounded-lg">
              <SearchIcon className="w-4 h-4 mr-2" /> Search
            </Button>
          </form>
        </div>

        {/* View Toggle */}
        <div className="flex gap-3 mb-6">
          {["Cards", "List", "Filters", "Explore"].map((opt) => (
            <button
              key={opt}
              onClick={() => setView(opt as any)}
              className={cn(
                "px-4 py-2 text-sm rounded-lg font-semibold transition flex items-center gap-1.5",
                view === opt ? "bg-white text-indigo-700 shadow-md" : "text-gray-600 bg-gray-100 hover:bg-gray-200"
              )}
            >
              {opt === "Cards" && <LayoutGrid className="w-4 h-4" />}
              {opt === "List" && <ListIcon className="w-4 h-4" />}
              {opt === "Filters" && <Sliders className="w-4 h-4" />}
              {opt === "Explore" && <Zap className="w-4 h-4" />}
              {opt}
            </button>
          ))}
          {loading && <span className="text-xs text-gray-500 self-center">Searching…</span>}
        </div>

        {/* Filters Drawer */}
        <FiltersDrawer
          open={Boolean(view === "Filters" || filtersOpen)}
          onOpenChange={(v) => {
            setFiltersOpen(v);
            if (!v && view === "Filters") setView("Cards");
          }}
          filters={filterOptions || {}}
          values={{
            origin: filters.origin ?? undefined,
            destination: filters.destination ?? undefined,
            mode: filters.mode ?? undefined,
            date_start: filters.date_start ?? undefined,
            date_end: filters.date_end ?? undefined,
            year: filters.year ?? undefined,
          }}
          onChange={(patch) => {
            setFilters((prev) => ({
              origin:
                typeof patch.origin === "string"
                  ? patch.origin
                  : patch.origin === undefined
                  ? null
                  : prev.origin,
              destination:
                typeof patch.destination === "string"
                  ? patch.destination
                  : patch.destination === undefined
                  ? null
                  : prev.destination,
              hs: prev.hs,
              mode:
                typeof patch.mode === "string"
                  ? (patch.mode as any)
                  : patch.mode === undefined
                  ? null
                  : prev.mode,
              date_start:
                typeof patch.date_start === "string"
                  ? patch.date_start
                  : patch.date_start === undefined
                  ? null
                  : prev.date_start,
              date_end:
                typeof patch.date_end === "string"
                  ? patch.date_end
                  : patch.date_end === undefined
                  ? null
                  : prev.date_end,
              year:
                typeof patch.year === "string" ? patch.year : patch.year === undefined ? null : prev.year,
            }));
          }}
          onApply={() => {
            run(true);
            setFiltersOpen(false);
            if (view === "Filters") setView("Cards");
          }}
        />

        {/* Results */}
        {!hasSearched && rows.length === 0 && <SearchEmpty state="idle" />}
        {hasSearched && rows.length === 0 && !loading && <SearchEmpty state="no-results" />}

        {rows.length > 0 && (
          <div className="pt-2">
            {view === "Cards" && (
              <ResultsCards rows={dedupedRows} onOpen={(r) => setModal(r)} filters={filters} />
            )}
            {view === "List" && (
              <ResultsList
                rows={dedupedRows}
                onOpen={(r) => setModal(r)}
                selectedKey={
                  modal ? getCompanyKey({ company_id: modal?.company_id, company_name: modal?.company_name }) : null
                }
                filters={filters}
              />
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <CompanyModal company={modal} open={Boolean(modal)} onClose={(open) => { if (!open) setModal(null); }} />
    </div>
  );
}

// map current filters to persistent payload (unchanged)
function normalizeFilters(f: any) {
  const out: any = {
    startDate: f?.date_start ?? null,
    endDate: f?.date_end ?? null,
    origin_country: f?.origin ? [String(f.origin).toUpperCase()] : [],
    dest_country: f?.destination ? [String(f.destination).toUpperCase()] : [],
    origin_city: [],
    origin_state: [],
    origin_postal: [],
    origin_port: [],
    dest_city: [],
    dest_state: [],
    dest_postal: [],
    dest_port: [],
    hs: f?.hs ? String(f.hs).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
  };
  return out;
}
