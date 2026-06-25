/**
 * QuoteCompanySelector — the "Company" section of the Quote Builder.
 *
 * PRIMARY path: the builder is launched from a company profile (`?company_id=`)
 * or hydrated from an existing quote, so a company is already attached. We just
 * display it (logo, name, domain, contact) with a "Change" affordance.
 *
 * FALLBACK path: no company attached → a minimal search box backed by the
 * existing `searchCompanies` proxy (`frontend/src/lib/api.ts`). Picking a result
 * emits `{ company_id, company_name, domain }` up to the builder.
 */
import { useEffect, useRef, useState } from "react";
import { Building2, Globe, MapPin, User, Repeat, Search, Loader2 } from "lucide-react";
import { searchCompanies, type CompanyHit } from "@/lib/api";

export interface AttachedCompany {
  company_id: string;
  company_name: string;
  domain?: string | null;
  /** Real ImportYeti shipment volume — used by the revenue-opportunity panel. */
  shipments_12m?: number | null;
  top_routes?: string[] | null;
  address?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function QuoteCompanySelector({
  company,
  onSelect,
}: {
  company: AttachedCompany | null;
  onSelect: (c: AttachedCompany) => void;
}) {
  const [searching, setSearching] = useState(!company);

  if (company && !searching) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-3 rounded-[11px] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[10px] bg-[#0F172A] text-[16px] font-bold text-[#00F0FF] font-display">
            {initials(company.company_name)}
          </div>
          <div className="min-w-0">
            <b className="font-display text-[15px] font-semibold text-slate-900">
              {company.company_name}
            </b>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-slate-500">
              {company.domain && (
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3 w-3 text-slate-400" />
                  {company.domain}
                </span>
              )}
              {company.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-slate-400" />
                  {company.address}
                </span>
              )}
              {company.contact_name && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3 text-slate-400" />
                  {company.contact_name}
                  {company.contact_title ? ` · ${company.contact_title}` : ""}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="ml-auto inline-flex h-9 min-h-[40px] items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:min-h-0"
          >
            <Repeat className="h-4 w-4" />
            Change
          </button>
        </div>

        {/* Real shipment KPIs — only when we actually have the data. No fakes. */}
        {company.shipments_12m != null && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi label="Shipments 12M" value={company.shipments_12m.toLocaleString()} />
            {company.top_routes?.[0] && (
              <Kpi label="Top Lane" value={company.top_routes[0]} small />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <CompanySearch
      onSelect={(c) => {
        onSelect(c);
        setSearching(false);
      }}
      onCancel={company ? () => setSearching(false) : undefined}
    />
  );
}

function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-[9px] border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="font-display text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400">
        {label}
      </div>
      <div
        className={
          "mt-1 font-mono font-bold text-slate-900 " + (small ? "text-[11px]" : "text-[15px]")
        }
      >
        {value}
      </div>
    </div>
  );
}

function CompanySearch({
  onSelect,
  onCancel,
}: {
  onSelect: (c: AttachedCompany) => void;
  onCancel?: () => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CompanyHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search against the existing companies proxy.
  // TODO: richer company search (filters, contacts) — Phase 1 keeps this minimal.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await searchCompanies({ q: term, limit: 8 }, ctrl.signal);
        setRows(res.rows ?? []);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError("Search failed. Try again.");
          setRows([]);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search companies by name…"
          className="h-10 w-full rounded-[9px] border border-slate-200 bg-slate-50 pl-9 pr-3 text-[13px] text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15"
        />
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 px-1 text-[12px] text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Searching…
        </div>
      )}
      {error && <div className="mt-3 px-1 text-[12px] text-rose-600">{error}</div>}

      {rows.length > 0 && (
        <div className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-[10px] border border-slate-200">
          {rows.map((r) => (
            <button
              key={r.company_id}
              type="button"
              onClick={() =>
                onSelect({
                  company_id: r.company_id,
                  company_name: r.company_name,
                  domain: r.domain,
                  shipments_12m: r.shipments_12m,
                  top_routes: r.top_routes,
                  address: r.address,
                })
              }
              className="flex w-full min-h-[44px] items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50"
            >
              <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600">
                {initials(r.company_name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-slate-900">
                  {r.company_name}
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  {r.domain ?? "—"}
                  {r.shipments_12m != null ? ` · ${r.shipments_12m.toLocaleString()} shp/12M` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && q.trim().length >= 2 && rows.length === 0 && !error && (
        <div className="mt-3 px-1 text-[12px] text-slate-400">
          No companies found for “{q.trim()}”.
        </div>
      )}

      {q.trim().length < 2 && (
        <div className="mt-3 flex items-start gap-2 px-1 text-[12px] text-slate-400">
          <Building2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Type at least 2 characters to search your company index.
        </div>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 text-[12px] font-semibold text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
