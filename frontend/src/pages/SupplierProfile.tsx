import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Compass, Package, Sparkles } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitFlag from "@/components/ui/LitFlag";
import LitPill from "@/components/ui/LitPill";
import {
  getBolDate,
  getBolDestination,
  getBolHs,
  getBolOrigin,
  getBolSupplier,
} from "@/lib/bols/helpers";
import type { SupplierRow } from "@/lib/suppliers/aggregate";

/**
 * Supplier Profile — `/app/suppliers/:slug`
 *
 * Mirrors CompanyProfileV2's editorial layout but inverts the relationship:
 * receivers/companies → suppliers. Surfaces the supplier name, country,
 * total shipments, top destination countries, top HS codes, and the list
 * of receivers this supplier ships to.
 *
 * Data flow (Wk1 v1):
 *   - Drawer "View full supplier profile" link navigates here with
 *     `location.state = { supplier, supplierBols, originReceiver }`.
 *   - Page reads from location.state so the render is instant + real.
 *   - If state is absent (refresh, bookmark, direct link), we show an
 *     empty state explaining how to load this page with data.
 *
 * Follow-up (post-Wk1): wire a `get-supplier-profile` edge function so
 * bookmark/refresh loads cross-receiver data from the backend rather
 * than relying on handoff state. Plan doc T1c marks this explicitly.
 */

type LocationState = {
  // Full rich supplier row from the receiver's Suppliers tab. Carries the real
  // cross-importer network (other_buyers), HS chapters, address, TEU, etc.
  supplier?: SupplierRow;
  supplierBols?: any[];
  originReceiver?: {
    id?: string;
    name?: string;
  };
};

export default function SupplierProfile() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;

  const supplier = state.supplier;
  const bols = Array.isArray(state.supplierBols) ? state.supplierBols : [];
  const originReceiver = state.originReceiver;

  // Bookmark / refresh / direct-link case — no state, no data.
  if (!supplier) {
    return <NoStateEmpty slug={slug} />;
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-5">
      {/* Back link — only when we came from a receiver. */}
      {originReceiver?.id && originReceiver.name && (
        <Link
          to={`/app/companies/${encodeURIComponent(originReceiver.id)}`}
          className="font-display mb-3 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to {originReceiver.name}
        </Link>
      )}

      <SupplierHeader supplier={supplier} bols={bols} />

      <div className="mt-4 grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ReceiversTable
          supplier={supplier}
          bols={bols}
          highlightReceiverId={originReceiver?.id}
        />
        <div className="flex flex-col gap-3.5">
          <TopDestinations bols={bols} />
          <TopHsCodes supplier={supplier} bols={bols} />
        </div>
      </div>

      {/* The v1 handoff note only applies when we DON'T have the real
          cross-importer network. When other_buyers is present it IS the
          full-database network, so the caveat is no longer true. */}
      {!(Array.isArray(supplier.other_buyers) && supplier.other_buyers.length > 0) && (
        <FollowupNotice />
      )}
    </div>
  );
}

/* ── Header ──────────────────────────────────────────────────────────── */

function SupplierHeader({
  supplier,
  bols,
}: {
  supplier: NonNullable<LocationState["supplier"]>;
  bols: any[];
}) {
  const totalShipments =
    supplier.total_shipments || bols.length || supplier.shipments || 0;

  const uniqueReceivers = useMemo(() => {
    const set = new Set<string>();
    for (const bol of bols) {
      const name =
        bol?.consigneeName ||
        bol?.consignee_name ||
        bol?.receiverName ||
        bol?.receiver_name ||
        null;
      if (name) set.add(String(name).trim());
    }
    return set.size;
  }, [bols]);

  const dateRange = useMemo(() => {
    const dates = bols
      .map(getBolDate)
      .filter(Boolean)
      .map((d: any) => new Date(d).getTime())
      .filter((t) => Number.isFinite(t)) as number[];
    if (!dates.length) return null;
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    return {
      from: min.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      to: max.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    };
  }, [bols]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
      <div className="flex items-start gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          {supplier.country ? (
            <LitFlag code={supplier.country} size={28} label={supplier.country} />
          ) : (
            <Building2 className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Supplier
            {supplier.country && <LitPill tone="slate">{supplier.country}</LitPill>}
          </div>
          <h1 className="font-display mt-0.5 truncate text-[22px] font-bold leading-tight text-slate-900 sm:text-[24px]">
            {supplier.name}
          </h1>
          {dateRange && (
            <p className="font-mono mt-1 text-[11px] text-slate-500">
              Activity {dateRange.from} – {dateRange.to}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {supplier.address && (
              <span className="font-body truncate text-[11px] text-slate-500">
                {supplier.address}
              </span>
            )}
            {supplier.iy_key && (
              <a
                href={`https://www.importyeti.com${supplier.iy_key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display shrink-0 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
              >
                View on ImportYeti ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-3 md:grid-cols-4">
        <KpiCell
          label="Total shipments"
          value={totalShipments.toLocaleString()}
          mono
        />
        <KpiCell
          label="Receivers served"
          value={uniqueReceivers.toLocaleString()}
          mono
        />
        <KpiCell label="HS codes" value={countDistinctHsCodes(bols).toLocaleString()} mono />
        <KpiCell
          label="Last shipment"
          value={
            dateRange?.to ||
            (typeof getBolDate(bols[0]) === "string" ? "—" : "—")
          }
        />
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </div>
      <div
        className={[
          "mt-0.5 text-[16px] font-semibold text-slate-900",
          mono ? "font-mono" : "font-display",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

/* ── Receivers table ────────────────────────────────────────────────── */

function ReceiversTable({
  supplier,
  bols,
  highlightReceiverId,
}: {
  supplier: NonNullable<LocationState["supplier"]>;
  bols: any[];
  highlightReceiverId?: string;
}) {
  // Real cross-importer network: other_buyers = ImportYeti top_companies for
  // this supplier. No company id/country on these (they're names + counts).
  const networkRows = useMemo(
    () =>
      (Array.isArray(supplier.other_buyers) ? supplier.other_buyers : [])
        .filter((b) => b && b.name)
        .map((b) => ({
          name: String(b.name).trim(),
          id: null as string | null,
          country: "" as string,
          shipments: Number(b.shipments) || 0,
        }))
        .sort((a, b) => b.shipments - a.shipments),
    [supplier],
  );

  // Fallback: consignees seen in the loaded BOL set (origin receiver only).
  const bolRows = useMemo(() => {
    const map = new Map<
      string,
      { name: string; id: string | null; country: string; shipments: number }
    >();
    for (const bol of bols) {
      const name =
        bol?.consigneeName ||
        bol?.consignee_name ||
        bol?.receiverName ||
        bol?.receiver_name ||
        null;
      if (!name) continue;
      const key = String(name).trim().toLowerCase();
      const cur =
        map.get(key) ||
        {
          name: String(name).trim(),
          id: bol?.consigneeId || bol?.consignee_id || bol?.company_id || null,
          country: bol?.consigneeCountry || bol?.dest_country || "US",
          shipments: 0,
        };
      cur.shipments += 1;
      if (!cur.id && (bol?.consigneeId || bol?.consignee_id || bol?.company_id)) {
        cur.id = bol?.consigneeId || bol?.consignee_id || bol?.company_id || null;
      }
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.shipments - a.shipments);
  }, [bols]);

  const usingNetwork = networkRows.length > 0;
  const rows = usingNetwork ? networkRows : bolRows;

  return (
    <LitSectionCard
      title="Other importers"
      sub={
        rows.length === 0
          ? "No importer data available"
          : usingNetwork
            ? `${rows.length} importers this supplier ships to · ImportYeti`
            : `${rows.length} receivers from the loaded shipment set`
      }
      padded={false}
    >
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="font-body text-[12px] text-slate-500">
            No receiver data on the supplied shipments.
          </p>
        </div>
      ) : (
        <div className="max-h-[480px] overflow-y-auto">
          {rows.map((r, i) => {
            const isHighlighted =
              highlightReceiverId && r.id === highlightReceiverId;
            const rowInner = (
              <div className="grid w-full items-center gap-2.5 px-3 py-2.5 text-left sm:px-4"
                style={{ gridTemplateColumns: "20px minmax(0,1fr) 18px 72px" }}
              >
                <span className="font-mono shrink-0 text-[10px] text-slate-400">
                  #{i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-display truncate text-[12px] font-semibold text-slate-900">
                    {r.name}
                  </div>
                  <div className="font-mono mt-0.5 text-[10px] text-slate-500">
                    {r.shipments.toLocaleString()} shipment{r.shipments === 1 ? "" : "s"}
                  </div>
                </div>
                <LitFlag code={r.country} size={14} label={r.country} />
                <div className="text-right">
                  <span className="font-mono text-[11px] font-bold text-slate-900">
                    {r.shipments.toLocaleString()}
                  </span>
                </div>
              </div>
            );
            const containerCls = [
              "block w-full border-b border-slate-100 last:border-b-0 transition-colors",
              isHighlighted
                ? "border-l-2 border-l-blue-500 bg-blue-50/60"
                : "border-l-2 border-l-transparent",
              r.id ? "hover:bg-slate-50/60" : "",
            ].join(" ");
            return r.id ? (
              <Link
                key={r.name + i}
                to={`/app/companies/${encodeURIComponent(r.id)}`}
                className={containerCls}
              >
                {rowInner}
              </Link>
            ) : (
              <div key={r.name + i} className={containerCls}>
                {rowInner}
              </div>
            );
          })}
        </div>
      )}
    </LitSectionCard>
  );
}

/* ── Top destinations ────────────────────────────────────────────────── */

function TopDestinations({ bols }: { bols: any[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, number>();
    for (const bol of bols) {
      const dest = getBolDestination(bol);
      if (!dest || dest === "—") continue;
      const country = parseCountryFromDest(dest);
      const key = country || dest;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [bols]);

  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <LitSectionCard
      title="Top destinations"
      sub="Where this supplier ships"
      action={<Compass className="h-3 w-3 text-slate-400" />}
    >
      <div className="space-y-1.5">
        {rows.map((r) => {
          const pct = Math.round((r.count / total) * 100);
          return (
            <div key={r.label} className="flex items-center gap-2.5">
              <span className="font-display flex-1 truncate text-[11.5px] font-semibold text-slate-900">
                {r.label}
              </span>
              <div className="h-1 w-[80px] overflow-hidden rounded bg-slate-100">
                <div
                  className="h-full rounded bg-blue-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-mono w-[36px] text-right text-[10.5px] font-semibold text-slate-700">
                {r.count.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </LitSectionCard>
  );
}

/* ── Top HS codes ────────────────────────────────────────────────────── */

function TopHsCodes({
  supplier,
  bols,
}: {
  supplier: NonNullable<LocationState["supplier"]>;
  bols: any[];
}) {
  const rows = useMemo(() => {
    // Prefer the real per-supplier HS chapters from ImportYeti when present.
    if (Array.isArray(supplier.hs_chapters) && supplier.hs_chapters.length > 0) {
      return supplier.hs_chapters
        .filter((c) => c && c.chapter)
        .map((c) => ({
          chapter: String(c.chapter),
          count: Number(c.shipments) || 0,
        }))
        .slice(0, 5);
    }
    const map = new Map<string, number>();
    for (const bol of bols) {
      const hs = getBolHs(bol);
      if (!hs || hs === "—") continue;
      const chapter = String(hs).slice(0, 2);
      if (!chapter) continue;
      map.set(chapter, (map.get(chapter) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([chapter, count]) => ({ chapter, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [supplier, bols]);

  if (rows.length === 0) return null;

  return (
    <LitSectionCard
      title="Top HS chapters"
      sub="Commodity categories shipped"
      action={<Package className="h-3 w-3 text-slate-400" />}
    >
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <LitPill key={r.chapter} tone="blue">
            HS {r.chapter} · {r.count}
          </LitPill>
        ))}
      </div>
    </LitSectionCard>
  );
}

/* ── Follow-up notice ────────────────────────────────────────────────── */

function FollowupNotice() {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
        <div className="min-w-0">
          <p className="font-display text-[12px] font-semibold text-slate-900">
            v1: cross-receiver intel from the receiver you came from
          </p>
          <p className="font-body mt-1 text-[11px] text-slate-600">
            Wk1 ships this page reading from the shipment set passed by the
            origin company profile. A backend aggregator (planned for v2)
            will surface every receiver this supplier ships to across the
            full LIT database, including ones you haven't visited.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Empty state (no location.state) ─────────────────────────────────── */

function NoStateEmpty({ slug }: { slug?: string }) {
  const decoded = slug ? slug.replace(/-/g, " ") : null;
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Building2 className="h-6 w-6 text-slate-400" />
      </div>
      <h1 className="font-display mt-4 text-[20px] font-bold text-slate-900">
        {decoded
          ? `Supplier "${decoded}" — open from a Company Profile`
          : "Open this supplier from a Company Profile"}
      </h1>
      <p className="font-body mt-2 max-w-md text-[13px] text-slate-600">
        Bookmark loading is on the Wk1 follow-up list. For now, navigate
        to a receiver (Company Profile → Supply Chain → Suppliers), then
        click into a supplier row to open the full profile here.
      </p>
      <Link
        to="/app/search"
        className="font-display mt-5 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        Search a receiver to start
      </Link>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function countDistinctHsCodes(bols: any[]): number {
  const set = new Set<string>();
  for (const bol of bols) {
    const hs = getBolHs(bol);
    if (hs && hs !== "—") set.add(String(hs).slice(0, 2));
  }
  return set.size;
}

function parseCountryFromDest(dest: string): string | null {
  // Helper for dest strings like "Savannah, US" or "Long Beach, CA" — pull
  // the trailing token if it's a 2-letter code; otherwise return null and
  // let the dest label stand on its own.
  const trail = dest.split(",").pop()?.trim();
  if (trail && /^[A-Z]{2}$/.test(trail)) return trail;
  return null;
}
