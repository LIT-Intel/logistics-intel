import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, CalendarClock, CircleDollarSign, FileSpreadsheet, Layers3, Plus, Search, Send, Ship, Sparkles, Target } from "lucide-react";
import { rfp, type RfpListItem, type RfpStatus } from "@/api/rfp";
import { RfpStatusPill } from "./components/RfpStatusPill";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const FILTERS: Array<{ key: "all" | RfpStatus; label: string }> = [
  { key: "all", label: "All bids" }, { key: "draft", label: "Draft" }, { key: "intake", label: "Intake" },
  { key: "pricing", label: "Pricing" }, { key: "review", label: "Review" }, { key: "submitted", label: "Submitted" },
  { key: "won", label: "Won" }, { key: "lost", label: "Lost" },
];
const PIPELINE: Array<{ key: RfpStatus; label: string }> = [
  { key: "draft", label: "Draft" }, { key: "intake", label: "Intake" }, { key: "pricing", label: "Pricing" },
  { key: "review", label: "Review" }, { key: "submitted", label: "Submitted" }, { key: "won", label: "Won" },
];
const EMPTY_ITEMS: RfpListItem[] = [];

export default function RfpDashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | RfpStatus>("all");
  const [query, setQuery] = useState("");
  const listQuery = useQuery({ queryKey: ["rfp", "list"], queryFn: () => rfp.list() });
  const allItems = listQuery.data?.items ?? EMPTY_ITEMS;
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allItems.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!needle) return true;
      return [item.title, item.rfp_number, item.company?.name, item.primary_mode].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [allItems, filter, query]);
  const metrics = listQuery.data?.metrics ?? {};
  const openRfps = (metrics.count ?? 0) - (metrics.won ?? 0) - (metrics.lost ?? 0) - (metrics.archived ?? 0);
  const dueSoonItems = allItems.filter((item) => {
    if (!item.due_date || ["won", "lost", "archived"].includes(item.status)) return false;
    const diff = new Date(item.due_date).getTime() - Date.now();
    return diff >= 0 && diff <= 7 * 86400000;
  });
  const quoted = allItems.filter((item) => item.quotes.count > 0).length;
  const quotedPct = allItems.length ? Math.round((quoted / allItems.length) * 100) : 0;

  return <div className="min-h-full bg-[#eef3f8] pb-16">
    <section className="relative overflow-hidden bg-[#07111f] px-4 pb-8 pt-6 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(circle at 82% 0%, rgba(34,211,238,.23), transparent 31%), radial-gradient(circle at 7% 100%, rgba(37,99,235,.18), transparent 34%)" }} />
      <div className="relative mx-auto max-w-[1440px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300"><span className="h-1.5 w-1.5 rounded-full bg-lime-400 shadow-[0_0_12px_rgba(163,230,53,.85)]" />LIT Commercial Command Center</div>
            <h1 className="font-display text-[27px] font-bold tracking-[-0.8px] sm:text-[34px]">RFP &amp; Quotes</h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-300">Control every freight bid from customer intake and lane intelligence through pricing, proposal, and award.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => navigate("/app/quoting")} className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-white/15 bg-white/5 px-4 text-[12.5px] font-semibold text-slate-200 backdrop-blur hover:bg-white/10"><FileSpreadsheet className="h-4 w-4 text-cyan-300" /> Quote Library</button>
            <button type="button" onClick={() => navigate("/app/rfp/new")} className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-cyan-400 px-4 text-[12.5px] font-bold text-[#06111f] shadow-[0_10px_30px_rgba(34,211,238,.24)] hover:bg-cyan-300"><Plus className="h-4 w-4" /> New RFP</button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
          <CommandKpi icon={Layers3} label="Open RFPs" value={String(openRfps)} tone="cyan" loading={listQuery.isLoading} />
          <CommandKpi icon={CalendarClock} label="Due in 7 days" value={String(dueSoonItems.length)} tone="amber" loading={listQuery.isLoading} />
          <CommandKpi icon={CircleDollarSign} label="Annual pipeline" value={money.format(metrics.value ?? 0)} tone="lime" loading={listQuery.isLoading} />
          <CommandKpi icon={Send} label="Submitted" value={String(metrics.submitted ?? 0)} tone="blue" loading={listQuery.isLoading} />
          <CommandKpi icon={Target} label="Quote coverage" value={`${quotedPct}%`} tone="violet" loading={listQuery.isLoading} />
        </div>
        <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.045] p-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between px-1"><span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">Live bid pipeline</span><span className="text-[10px] text-slate-500">Select a stage to filter</span></div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{PIPELINE.map((stage) => {
            const count = Number(metrics[stage.key] ?? 0); const selected = filter === stage.key;
            return <button key={stage.key} type="button" onClick={() => setFilter(selected ? "all" : stage.key)} className={`rounded-[10px] border px-3 py-2.5 text-left transition ${selected ? "border-cyan-300 bg-cyan-300 text-[#07111f]" : "border-white/10 bg-[#0c1a2b] hover:border-cyan-400/40 hover:bg-[#102238]"}`}><div className={`font-mono text-[18px] font-bold ${selected ? "text-[#07111f]" : stage.key === "won" ? "text-lime-300" : "text-white"}`}>{count}</div><div className={`text-[9.5px] font-bold uppercase tracking-[0.08em] ${selected ? "text-slate-800" : "text-slate-400"}`}>{stage.label}</div></button>;
          })}</div>
        </div>
      </div>
    </section>

    <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,.07)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-[15px] font-bold text-slate-950">Active bid workspace</h2><p className="mt-0.5 text-[11px] text-slate-500">{listQuery.isLoading ? "Loading live pipeline…" : `${items.length} opportunities in this view`}</p></div><label className="relative block w-full sm:w-[280px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search RFP, customer or mode" className="h-10 w-full rounded-[10px] border border-slate-200 bg-slate-50 pl-9 pr-3 text-[12px] text-slate-900 outline-none focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10" /></label></div>
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-3 py-2">{FILTERS.map((tab) => <button key={tab.key} type="button" onClick={() => setFilter(tab.key)} className={`h-8 flex-shrink-0 rounded-[8px] px-3 text-[10.5px] font-bold transition ${filter === tab.key ? "bg-[#0a1728] text-cyan-300 shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"}`}>{tab.label}</button>)}</div>
        {listQuery.isLoading ? <RfpSkeleton /> : listQuery.isError ? <div className="px-6 py-14 text-center text-[13px] text-rose-600">RFPs could not be loaded. Try again.</div> : items.length === 0 ? <EmptyState onNew={() => navigate("/app/rfp/new")} /> : <div className="overflow-x-auto"><table className="w-full min-w-[940px] border-collapse"><thead><tr className="bg-[#f8fafc]"><Th>Opportunity</Th><Th>Status</Th><Th>Lane scope</Th><Th align="right">Annual value</Th><Th>Due date</Th><Th>Bid health</Th><Th align="right">Action</Th></tr></thead><tbody>{items.map((item) => <RfpRow key={item.id} item={item} onOpen={() => navigate(`/app/rfp/${item.id}`)} />)}</tbody></table></div>}
      </section>
      <aside className="space-y-4">
        <CommandPanel icon={Sparkles} eyebrow="LIT bid intelligence" title="Opportunity signals"><SignalRow label="Pricing now" value={String(metrics.pricing ?? 0)} color="cyan" /><SignalRow label="Internal review" value={String(metrics.review ?? 0)} color="violet" /><SignalRow label="Submitted" value={String(metrics.submitted ?? 0)} color="blue" /><SignalRow label="Won" value={String(metrics.won ?? 0)} color="lime" /></CommandPanel>
        <CommandPanel icon={Activity} eyebrow="Recent activity" title="Latest RFP movement">{allItems.length ? <div className="space-y-3">{allItems.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => navigate(`/app/rfp/${item.id}`)} className="group flex w-full items-start gap-2.5 text-left"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,.65)]" /><span className="min-w-0"><span className="block truncate text-[11.5px] font-semibold text-slate-800 group-hover:text-cyan-700">{item.title}</span><span className="mt-0.5 block text-[9.5px] text-slate-400">{item.company?.name ?? "Company"} · {formatRelative(item.updated_at)}</span></span></button>)}</div> : <p className="text-[11px] leading-relaxed text-slate-500">Activity will appear as your team creates and prices bids.</p>}</CommandPanel>
        <section className="rounded-[16px] border border-[#163251] bg-[#091827] p-4 text-white shadow-[0_14px_30px_rgba(15,23,42,.12)]"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300"><Ship className="h-3.5 w-3.5" /> Carrier scorecards</div><p className="mt-2 text-[12px] font-semibold">Coverage comes next</p><p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">Carrier bid comparison will populate after carrier responses are attached to a quote revision. No sample carrier data is presented as live data.</p></section>
      </aside>
    </div>
  </div>;
}

function CommandKpi({ icon: Icon, label, value, tone, loading }: { icon: typeof Layers3; label: string; value: string; tone: "cyan" | "amber" | "lime" | "blue" | "violet"; loading: boolean }) { const tones = { cyan: "text-cyan-300 bg-cyan-400/10", amber: "text-amber-300 bg-amber-400/10", lime: "text-lime-300 bg-lime-400/10", blue: "text-blue-300 bg-blue-400/10", violet: "text-violet-300 bg-violet-400/10" }; return <div className="rounded-[13px] border border-white/10 bg-white/[0.055] p-3.5 backdrop-blur"><div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</span><span className={`grid h-7 w-7 place-items-center rounded-lg ${tones[tone]}`}><Icon className="h-3.5 w-3.5" /></span></div><div className="mt-2 font-mono text-[21px] font-bold tracking-[-0.6px] text-white">{loading ? "—" : value}</div></div>; }
function RfpRow({ item, onOpen }: { item: RfpListItem; onOpen: () => void }) { const readiness = Math.round(([Boolean(item.due_date), item.lane_count > 0, item.estimated_annual_value > 0, item.quotes.count > 0].filter(Boolean).length / 4) * 100); return <tr className="group cursor-pointer border-b border-slate-100 transition hover:bg-cyan-50/40" onClick={onOpen}><Td><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#0a1728] text-[10px] font-bold text-cyan-300">{item.company?.name?.slice(0, 2).toUpperCase() ?? "RF"}</span><div className="min-w-0"><div className="max-w-[240px] truncate font-display text-[12.5px] font-bold text-slate-950">{item.title}</div><div className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-slate-400"><span className="font-mono text-cyan-700">{item.rfp_number ?? "DRAFT"}</span><span>·</span><span className="max-w-[150px] truncate">{item.company?.name ?? "Unknown company"}</span></div></div></div></Td><Td><RfpStatusPill status={item.status} /></Td><Td><div className="text-[11.5px] font-semibold capitalize text-slate-700">{item.primary_mode ?? "Unassigned"}</div><div className="mt-0.5 text-[9.5px] text-slate-400">{item.lane_count} lane{item.lane_count === 1 ? "" : "s"}</div></Td><Td align="right"><span className="font-mono text-[12px] font-bold text-slate-950">{money.format(item.estimated_annual_value)}</span></Td><Td><span className={`text-[11px] font-semibold ${isDueSoon(item.due_date) ? "text-amber-600" : "text-slate-600"}`}>{formatDate(item.due_date)}</span></Td><Td><div className="flex min-w-[120px] items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${readiness >= 75 ? "bg-lime-400" : "bg-cyan-400"}`} style={{ width: `${readiness}%` }} /></div><span className="font-mono text-[9.5px] font-bold text-slate-500">{readiness}%</span></div></Td><Td align="right"><button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-cyan-700 hover:bg-cyan-100">Open <ArrowRight className="h-3.5 w-3.5" /></button></Td></tr>; }
function CommandPanel({ icon: Icon, eyebrow, title, children }: { icon: typeof Sparkles; eyebrow: string; title: string; children: React.ReactNode }) { return <section className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.05)]"><div className="flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-cyan-700"><Icon className="h-3.5 w-3.5" /> {eyebrow}</div><h3 className="mt-1 font-display text-[13px] font-bold text-slate-950">{title}</h3><div className="mt-3">{children}</div></section>; }
function SignalRow({ label, value, color }: { label: string; value: string; color: "cyan" | "violet" | "blue" | "lime" }) { const colors = { cyan: "bg-cyan-400", violet: "bg-violet-400", blue: "bg-blue-500", lime: "bg-lime-400" }; return <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0"><span className="flex items-center gap-2 text-[11px] text-slate-600"><span className={`h-1.5 w-1.5 rounded-full ${colors[color]}`} />{label}</span><span className="font-mono text-[11.5px] font-bold text-slate-900">{value}</span></div>; }
function EmptyState({ onNew }: { onNew: () => void }) { return <div className="px-6 py-16 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#0a1728] text-cyan-300"><Ship className="h-5 w-5" /></span><h3 className="mt-3 font-display text-[14px] font-bold text-slate-950">No RFPs in this view</h3><p className="mt-1 text-[12px] text-slate-500">Create a multi-lane opportunity from a saved company.</p><button type="button" onClick={onNew} className="mt-4 inline-flex h-9 items-center gap-2 rounded-[9px] bg-cyan-400 px-3.5 text-[12px] font-bold text-[#07111f]"><Plus className="h-4 w-4" /> New RFP</button></div>; }
function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) { return <th className={`whitespace-nowrap border-b border-slate-100 px-3.5 py-3 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>; }
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) { return <td className={`whitespace-nowrap px-3.5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>; }
function formatDate(value?: string | null) { if (!value) return "No deadline"; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function formatRelative(value: string) { const diff = Date.now() - new Date(value).getTime(); const days = Math.max(0, Math.floor(diff / 86400000)); return days === 0 ? "Updated today" : days === 1 ? "Updated yesterday" : `Updated ${days} days ago`; }
function isDueSoon(value?: string | null) { if (!value) return false; const diff = new Date(value).getTime() - Date.now(); return diff >= 0 && diff <= 7 * 86400000; }
function RfpSkeleton() { return <div className="animate-pulse space-y-3 p-4">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 rounded-xl bg-slate-100" />)}</div>; }
