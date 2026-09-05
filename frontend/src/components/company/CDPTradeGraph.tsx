import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, Boxes, ChevronDown, Factory, Handshake, Loader2,
  Network, Route as RouteIcon, Ship, Swords, Users2, Warehouse,
} from "lucide-react";
import { springs } from "@/lib/motion";
import CountryFlag from "@/components/explorer/CountryFlag";
import {
  useCompanyTradeGraph,
  useSupplierCustomers,
  type TradeGraph,
  type TradeGraphSupplier,
} from "@/api/tradeIntel";

/**
 * Trade Graph — the profile's relationship view, in the Search page's visual
 * language (translucent cards, brand blue, iconed colored chips, springs,
 * press feedback). Everything here is OBSERVED from this company's bills of
 * lading — suppliers, commodity mix, lanes, inland facilities — plus two
 * derived edges: shared-supplier competitors and forwarder incumbents.
 */

function fmtMonth(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Section shell — search-panel material: white/translucent, rounded-2xl, ring. */
function GraphCard({
  icon, tone, title, count, children, className = "",
}: {
  icon: React.ReactNode; tone: string; title: string; count?: number;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur ${className}`}>
      <header className="mb-3 flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${tone}`}>{icon}</span>
        <h3 className="font-display text-[13.5px] font-bold tracking-tight text-slate-900">{title}</h3>
        {count != null ? (
          <span className="font-mono ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">
            {count}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** The "also supplies" drill-down — who ELSE this supplier ships to. Lazy:
 *  the RPC only fires once the row is expanded. */
function SupplierCustomers({ supplierName, excludeCompany }: {
  supplierName: string; excludeCompany: string | null;
}) {
  const { data, isLoading } = useSupplierCustomers(supplierName, excludeCompany);
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 py-2 pl-6 text-[11px] text-slate-400">
        <Loader2 size={11} className="animate-spin" /> Checking who else they supply…
      </div>
    );
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <p className="py-2 pl-6 text-[11px] text-slate-400">
        No other tracked companies use this supplier — an exclusive relationship (so far).
      </p>
    );
  }
  return (
    <div className="mt-1 rounded-lg bg-slate-50/80 p-2 pl-3 ring-1 ring-slate-100">
      <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <Users2 size={10} /> Also supplies
      </p>
      <ul className="space-y-1">
        {rows.map((c) => (
          <li key={c.company_id}>
            <Link
              to={`/app/companies/${encodeURIComponent(c.company_id)}`}
              className="group flex items-center gap-2"
            >
              <span className="font-display min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800 group-hover:text-blue-700">
                {c.company_name}
              </span>
              {c.top_chapter_label ? (
                <span className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-violet-700 ring-1 ring-violet-200">
                  {c.top_chapter_label}
                </span>
              ) : null}
              <span className="font-body shrink-0 text-[10px] text-slate-400">
                {c.shipments.toLocaleString()} shpts · last {fmtMonth(c.last_shipment)}
              </span>
              <ArrowUpRight size={11} className="shrink-0 text-slate-300 transition group-hover:text-blue-600" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SupplierRow({ s, max, chapterLabel, excludeCompany }: {
  s: TradeGraphSupplier; max: number; chapterLabel: string | null; excludeCompany: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="See who else this supplier ships to"
        className="w-full text-left"
      >
        <div className="flex items-center gap-2">
          <CountryFlag code={s.origin_country_code || s.origin_country} size={12} />
          <span className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-900">
            {s.shipper_name}
          </span>
          <span className="font-mono shrink-0 text-[11px] font-semibold tabular-nums text-slate-600">
            {s.shipments.toLocaleString()}
          </span>
          <ChevronDown size={12} className={`shrink-0 text-slate-300 transition-transform ${open ? "rotate-180 text-blue-500" : ""}`} />
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(4, (s.shipments / max) * 100)}%` }} />
          </div>
          <span className="font-body shrink-0 text-[10.5px] text-slate-400">last {fmtMonth(s.last_shipment)}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {s.origin_city || s.origin_country ? (
            <span className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
              {[s.origin_city, s.origin_country].filter(Boolean).join(", ")}
            </span>
          ) : null}
          {chapterLabel ? (
            <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">
              {chapterLabel}
            </span>
          ) : null}
        </div>
      </button>
      {open ? <SupplierCustomers supplierName={s.shipper_name} excludeCompany={excludeCompany} /> : null}
    </li>
  );
}

export default function CDPTradeGraph({ companyId, companyName }: {
  companyId: string | null; companyName?: string | null;
}) {
  const { data, isLoading } = useCompanyTradeGraph(companyId);
  const reduce = useReducedMotion();

  const chapterByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data?.chapters ?? []) m.set(c.chapter, c.label);
    return m;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-16 text-center">
        <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
        <p className="font-body text-[12px] text-slate-500">Mapping trade relationships…</p>
      </div>
    );
  }

  const g: TradeGraph | null = data ?? null;
  const empty = !g || (g.suppliers.length === 0 && g.lanes.length === 0 && g.forwarders.length === 0);
  if (empty) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-100">
          <Network size={17} className="text-slate-400" />
        </div>
        <p className="font-display text-[13px] font-semibold text-slate-800">No trade relationships yet</p>
        <p className="font-body max-w-[300px] text-[11.5px] leading-snug text-slate-500">
          We haven&apos;t ingested bills of lading for {companyName || "this company"} yet.
          Open Pulse LIVE or refresh shipment data to populate the graph.
        </p>
      </div>
    );
  }

  const maxSupplier = Math.max(1, ...g.suppliers.map((s) => s.shipments));
  const maxChapter = Math.max(1, ...g.chapters.map((c) => c.shipments));
  const enter = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

  return (
    <motion.div {...enter} transition={springs.default} className="space-y-3.5">
      {/* Stat strip — same chip language as the search result rows */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatChip icon={<Factory size={11} />} tone="text-blue-700 bg-blue-50 ring-blue-200" label={`${g.suppliers.length} supplier${g.suppliers.length === 1 ? "" : "s"}`} />
        <StatChip icon={<Boxes size={11} />} tone="text-violet-700 bg-violet-50 ring-violet-200" label={`${g.chapters.length} commodit${g.chapters.length === 1 ? "y" : "ies"}`} />
        <StatChip icon={<RouteIcon size={11} />} tone="text-cyan-700 bg-cyan-50 ring-cyan-200" label={`${g.lanes.length} lane${g.lanes.length === 1 ? "" : "s"}`} />
        {g.competitors.length > 0 ? (
          <StatChip icon={<Swords size={11} />} tone="text-rose-700 bg-rose-50 ring-rose-200" label={`${g.competitors.length} competitor${g.competitors.length === 1 ? "" : "s"}`} />
        ) : null}
        {g.forwarders.length > 0 ? (
          <StatChip icon={<Handshake size={11} />} tone="text-emerald-700 bg-emerald-50 ring-emerald-200" label={`${g.forwarders.length} forwarder${g.forwarders.length === 1 ? "" : "s"}`} />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {/* Suppliers */}
        <GraphCard icon={<Factory size={14} />} tone="bg-blue-50 text-blue-600" title="Suppliers" count={g.suppliers.length}>
          <p className="font-body -mt-1 mb-1 text-[11px] text-slate-400">
            Click a supplier to see every other company it ships to.
          </p>
          <ul className="divide-y divide-slate-100">
            {g.suppliers.slice(0, 8).map((s) => (
              <SupplierRow key={s.shipper_name} s={s} max={maxSupplier} excludeCompany={companyId}
                chapterLabel={s.top_chapter ? chapterByCode.get(s.top_chapter) ?? null : null} />
            ))}
          </ul>
        </GraphCard>

        <div className="space-y-3.5">
          {/* Competitors via shared suppliers */}
          {g.competitors.length > 0 ? (
            <GraphCard icon={<Swords size={14} />} tone="bg-rose-50 text-rose-600" title="Competitors — shared suppliers" count={g.competitors.length}>
              <ul className="divide-y divide-slate-100">
                {g.competitors.map((k) => (
                  <li key={k.company_id} className="py-2">
                    <Link
                      to={`/app/companies/${encodeURIComponent(k.company_id)}`}
                      className="group flex items-center gap-2"
                    >
                      <span className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-900 group-hover:text-blue-700">
                        {k.company_name}
                      </span>
                      <span className="font-body shrink-0 text-[10.5px] text-slate-400">
                        {k.shared_suppliers} shared
                      </span>
                      <ArrowUpRight size={12} className="shrink-0 text-slate-300 transition group-hover:text-blue-600" />
                    </Link>
                    <p className="font-body mt-0.5 truncate text-[10.5px] text-slate-500">
                      via {k.shared_names.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </GraphCard>
          ) : null}

          {/* Commodity mix */}
          {g.chapters.length > 0 ? (
            <GraphCard icon={<Boxes size={14} />} tone="bg-violet-50 text-violet-600" title="Commodity mix" count={g.chapters.length}>
              <ul className="space-y-1.5">
                {g.chapters.map((c) => (
                  <li key={c.chapter} className="flex items-center gap-2">
                    <span className="font-display min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">
                      {c.label}
                      {c.classified_only ? (
                        <span title="Classified from product descriptions (no HS code on these BOLs)" className="font-body ml-1 text-[9.5px] font-medium uppercase tracking-wide text-slate-400">
                          est.
                        </span>
                      ) : null}
                    </span>
                    <div className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(6, (c.shipments / maxChapter) * 100)}%` }} />
                    </div>
                    <span className="font-mono w-8 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{c.shipments}</span>
                  </li>
                ))}
              </ul>
            </GraphCard>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {/* Top lanes */}
        {g.lanes.length > 0 ? (
          <GraphCard icon={<Ship size={14} />} tone="bg-cyan-50 text-cyan-600" title="Top lanes" count={g.lanes.length}>
            <ul className="divide-y divide-slate-100">
              {g.lanes.slice(0, 6).map((l, i) => (
                <li key={i} className="flex items-center gap-2 py-2">
                  <span className="font-display min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">
                    {l.origin_port}
                    <ArrowRight size={11} className="mx-1 inline text-slate-300" />
                    {l.destination_port}
                  </span>
                  <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{l.shipments}</span>
                </li>
              ))}
            </ul>
          </GraphCard>
        ) : null}

        {/* Inland facilities */}
        {g.facilities.length > 0 ? (
          <GraphCard icon={<Warehouse size={14} />} tone="bg-amber-50 text-amber-600" title="Receiving locations" count={g.facilities.length}>
            <ul className="divide-y divide-slate-100">
              {g.facilities.slice(0, 6).map((f, i) => (
                <li key={i} className="flex items-center gap-2 py-2">
                  <span className="font-display min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">
                    {[f.dest_city, f.dest_state].filter(Boolean).join(", ")}
                    {f.dest_zip ? <span className="font-body ml-1 text-[10.5px] font-normal text-slate-400">{f.dest_zip}</span> : null}
                  </span>
                  <span className="font-body shrink-0 text-[10.5px] text-slate-400">last {fmtMonth(f.last_shipment)}</span>
                  <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{f.shipments}</span>
                </li>
              ))}
            </ul>
          </GraphCard>
        ) : null}
      </div>

      <p className="font-body text-[10.5px] leading-snug text-slate-400">
        Built from {companyName || "this company"}&apos;s import bills of lading. Competitors are other
        tracked companies sharing the same suppliers; commodity chapters marked &ldquo;est.&rdquo; are
        classified from product descriptions.
      </p>
    </motion.div>
  );
}

function StatChip({ icon, tone, label }: { icon: React.ReactNode; tone: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${tone}`}>
      {icon} {label}
    </span>
  );
}
