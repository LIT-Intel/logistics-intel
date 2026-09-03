import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  FileSpreadsheet,
  Layers3,
  Plus,
  Search,
  Send,
  Ship,
} from "lucide-react";
import { rfp, type RfpListItem, type RfpStatus } from "@/api/rfp";
import EnhancedKpiCard from "@/components/dashboard/EnhancedKpiCard";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { RfpStatusPill } from "./components/RfpStatusPill";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const FILTERS: Array<{ key: "all" | RfpStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "intake", label: "Intake" },
  { key: "pricing", label: "Pricing" },
  { key: "review", label: "Review" },
  { key: "submitted", label: "Submitted" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

export default function RfpDashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | RfpStatus>("all");
  const [query, setQuery] = useState("");
  const listQuery = useQuery({
    queryKey: ["rfp", "list"],
    queryFn: () => rfp.list(),
  });
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = (listQuery.data?.items ?? []).filter(
      (item) => filter === "all" || item.status === filter,
    );
    if (!needle) return filtered;
    return filtered.filter((item) =>
      [item.title, item.rfp_number, item.company?.name, item.primary_mode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [filter, listQuery.data?.items, query]);
  const metrics = listQuery.data?.metrics ?? {};
  const dueSoon = (listQuery.data?.items ?? []).filter((item) => {
    if (!item.due_date || ["won", "lost", "archived"].includes(item.status)) return false;
    const diff = new Date(item.due_date).getTime() - Date.now();
    return diff >= 0 && diff <= 7 * 86400000;
  }).length;

  const kpis = [
    { icon: Layers3, label: "Open RFPs", value: String((metrics.count ?? 0) - (metrics.won ?? 0) - (metrics.lost ?? 0) - (metrics.archived ?? 0)), iconColor: "#475569" },
    { icon: CalendarClock, label: "Due in 7 Days", value: String(dueSoon), iconColor: "#d97706" },
    { icon: FileSpreadsheet, label: "In Pricing", value: String(metrics.pricing ?? 0), iconColor: "#7c3aed" },
    { icon: Send, label: "Submitted", value: String(metrics.submitted ?? 0), iconColor: "#2563eb" },
    { icon: CircleDollarSign, label: "Annual Pipeline", value: money.format(metrics.value ?? 0), iconColor: "#059669" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex rounded-[10px] border border-slate-200 bg-white p-1 shadow-sm">
            <button type="button" className="h-8 rounded-[7px] bg-slate-900 px-3 text-[12px] font-semibold text-white">RFPs</button>
            <button type="button" onClick={() => navigate("/app/quoting")} className="h-8 rounded-[7px] px-3 text-[12px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900">Quotes</button>
          </div>
          <h1 className="font-display text-[20px] font-bold tracking-[-0.4px] text-slate-900 sm:text-[23px]">
            RFP &amp; Quote Workspace
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Turn customer lanes and LIT intelligence into a priced, trackable proposal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/rfp/new")}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] px-4 font-display text-[13.5px] font-semibold text-white transition hover:brightness-105 sm:w-auto"
          style={{ background: "linear-gradient(180deg,#2563eb,#1d4ed8)", boxShadow: "0 6px 16px rgba(37,99,235,.28), inset 0 1px 0 rgba(255,255,255,.18)" }}
        >
          <Plus className="h-4 w-4" /> New RFP
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map((kpi, index) => (
          <EnhancedKpiCard key={kpi.label} {...kpi} href="/app/rfp" delay={index * 0.04} value={listQuery.isLoading ? "—" : kpi.value} />
        ))}
      </div>

      <LitSectionCard title="Active RFPs" sub={listQuery.isLoading ? "Loading…" : `${items.length} ${items.length === 1 ? "opportunity" : "opportunities"}`} padded={false}>
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex gap-1.5 overflow-x-auto">
            {FILTERS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`h-9 flex-shrink-0 rounded-lg border px-3 text-[11.5px] font-semibold transition ${filter === tab.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:w-[250px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search RFPs or companies" className="h-9 w-full rounded-[9px] border border-slate-200 bg-slate-50 pl-9 pr-3 text-[12px] text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10" />
          </label>
        </div>

        {listQuery.isLoading ? <RfpSkeleton /> : listQuery.isError ? (
          <div className="px-6 py-14 text-center text-[13px] text-rose-600">RFPs could not be loaded. Try again.</div>
        ) : items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Ship className="h-5 w-5" /></span>
            <h3 className="mt-3 font-display text-[14px] font-bold text-slate-900">No RFPs in this view</h3>
            <p className="mt-1 text-[12.5px] text-slate-500">Create your first multi-lane opportunity from a saved company.</p>
            <button type="button" onClick={() => navigate("/app/rfp/new")} className="mt-4 inline-flex h-9 items-center gap-2 rounded-[9px] bg-blue-600 px-3.5 text-[12px] font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> New RFP</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="bg-[#FAFBFC]"><Th>RFP</Th><Th>Company</Th><Th>Status</Th><Th>Mode</Th><Th align="right">Lanes</Th><Th align="right">Annual Value</Th><Th>Due</Th><Th>Quote</Th><Th align="right">Action</Th></tr></thead>
              <tbody>{items.map((item) => <RfpRow key={item.id} item={item} onOpen={() => navigate(`/app/rfp/${item.id}`)} />)}</tbody>
            </table>
          </div>
        )}
      </LitSectionCard>
    </div>
  );
}

function RfpRow({ item, onOpen }: { item: RfpListItem; onOpen: () => void }) {
  return (
    <tr className="group cursor-pointer border-b border-slate-100 transition hover:bg-blue-50/30" onClick={onOpen}>
      <Td><div className="font-display text-[12.5px] font-bold text-slate-900">{item.title}</div><div className="mt-0.5 font-mono text-[10.5px] text-blue-700">{item.rfp_number ?? "Draft"}</div></Td>
      <Td><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-[9px] font-bold text-slate-600">{item.company?.name?.slice(0, 2).toUpperCase() ?? "?"}</span><span className="max-w-[190px] truncate text-[12px] font-semibold text-slate-800">{item.company?.name ?? "Unknown company"}</span></div></Td>
      <Td><RfpStatusPill status={item.status} /></Td>
      <Td><span className="capitalize text-[12px] text-slate-600">{item.primary_mode ?? "—"}</span></Td>
      <Td align="right"><span className="font-mono text-[12px] font-semibold text-slate-700">{item.lane_count}</span></Td>
      <Td align="right"><span className="font-mono text-[12px] font-bold text-slate-900">{money.format(item.estimated_annual_value)}</span></Td>
      <Td><span className="text-[12px] text-slate-600">{formatDate(item.due_date)}</span></Td>
      <Td>{item.quotes.count ? <span className="text-[11.5px] font-semibold text-emerald-700">Rev {item.quotes.latest_revision}</span> : <span className="text-[11.5px] text-slate-400">Not created</span>}</Td>
      <Td align="right"><button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-blue-700 hover:bg-blue-50">Open <ArrowRight className="h-3.5 w-3.5" /></button></Td>
    </tr>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className={`whitespace-nowrap border-b border-slate-100 px-3.5 py-3 text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className={`whitespace-nowrap px-3.5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}
function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function RfpSkeleton() {
  return <div className="animate-pulse space-y-3 p-4">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-12 rounded-xl bg-slate-100" />)}</div>;
}
