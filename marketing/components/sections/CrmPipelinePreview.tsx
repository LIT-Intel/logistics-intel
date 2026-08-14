import Link from "next/link";
import { BarChart3, BriefcaseBusiness, CheckSquare2, DollarSign, LockKeyhole, Trophy, Users2 } from "lucide-react";

const metrics = [
  { label: "Open pipeline", value: "$0", icon: DollarSign, tone: "text-blue-600 bg-blue-50" },
  { label: "Active deals", value: "0", icon: BriefcaseBusiness, tone: "text-violet-600 bg-violet-50" },
  { label: "Weighted forecast", value: "$0", icon: BarChart3, tone: "text-violet-600 bg-violet-50" },
  { label: "Tasks due", value: "0", icon: CheckSquare2, tone: "text-amber-600 bg-amber-50" },
  { label: "Won MTD", value: "$0", icon: Trophy, tone: "text-emerald-600 bg-emerald-50" },
] as const;

const stages = [
  { name: "New", value: "$690,000", color: "bg-slate-400", deals: [
    { company: "Walmart", mark: "W", detail: "Ocean FCL · Asia to US West", value: "$480,000" },
    { company: "Costco", mark: "C", detail: "LCL consolidation program", value: "$210,000" },
  ] },
  { name: "Qualified", value: "$490,000", color: "bg-blue-500", deals: [
    { company: "Home Depot", mark: "HD", detail: "Drayage + warehousing RFP", value: "$325,000" },
    { company: "Adidas", mark: "A", detail: "Air freight · peak season", value: "$165,000" },
  ] },
  { name: "Quoted", value: "$898,000", color: "bg-violet-500", deals: [
    { company: "Tesla", mark: "T", detail: "Battery components · expedited", value: "$610,000" },
    { company: "Samsung", mark: "S", detail: "Reefer lanes · EU import", value: "$288,000" },
  ] },
  { name: "Negotiation", value: "$1,260,000", color: "bg-amber-500", deals: [
    { company: "Nike", mark: "N", detail: "Multi-modal 3PL contract", value: "$720,000" },
    { company: "Ford", mark: "F", detail: "Inbound parts · Mexico cross-border", value: "$540,000" },
  ] },
  { name: "Won", value: "$1,380,000", color: "bg-emerald-500", deals: [
    { company: "Amazon", mark: "A", detail: "Middle-mile linehaul", value: "$950,000" },
    { company: "Toyota", mark: "T", detail: "JIT ocean program", value: "$430,000" },
  ] },
] as const;

/** Product-faithful marketing preview using example data only. */
export function CrmPipelinePreview() {
  return (
    <div className="relative mx-auto max-w-container px-5 sm:px-8" aria-label="Logistics Intel CRM pipeline preview">
      <div className="absolute -inset-5 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_50%_35%,rgba(59,130,246,0.12),transparent_70%)] blur-2xl" />
      <div className="overflow-hidden rounded-3xl border border-ink-100 bg-[#f8faff] shadow-xl shadow-slate-900/10">
        <div className="flex items-center gap-6 border-b border-ink-100 bg-white px-5 sm:px-7">
          {["Accounts", "Pipeline", "Tasks", "Reports"].map((tab) => (
            <div key={tab} className={`flex h-14 items-center gap-2 border-b-2 font-display text-[12px] font-semibold ${tab === "Pipeline" ? "border-blue-600 text-blue-700" : "border-transparent text-ink-500"}`}>
              {tab === "Accounts" && <Users2 className="h-3.5 w-3.5" aria-hidden />}
              {tab === "Pipeline" && <BriefcaseBusiness className="h-3.5 w-3.5" aria-hidden />}
              {tab === "Tasks" && <CheckSquare2 className="h-3.5 w-3.5" aria-hidden />}
              {tab === "Reports" && <BarChart3 className="h-3.5 w-3.5" aria-hidden />}
              {tab}
            </div>
          ))}
        </div>

        <div className="grid gap-3 border-b border-ink-100 bg-white p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3.5 shadow-xs">
              <div className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" aria-hidden /></div>
              <div><p className="font-display text-[17px] font-semibold tracking-[-0.03em] text-ink-900">{value}</p><p className="font-mono mt-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-200">{label}</p></div>
            </div>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-5 py-5 text-white shadow-lg shadow-indigo-500/20 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-indigo-100">LIT CRM</p><h3 className="font-display mt-2 text-[19px] font-semibold tracking-[-0.02em]">Turn saved companies into a sales pipeline your team can work.</h3><p className="font-body mt-1.5 text-[12px] text-indigo-100">Drag-and-drop deals, assign tasks, forecast pipeline, and review owner-level reports.</p></div>
            <Link href="/pricing" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 font-display text-[12px] font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50"><LockKeyhole className="h-3.5 w-3.5" aria-hidden />Explore CRM plans</Link>
          </div>

          <div className="mt-4 overflow-x-auto pb-1">
            <div className="grid min-w-[1040px] grid-cols-5 gap-3">
              {stages.map((stage) => (
                <div key={stage.name} className="overflow-hidden rounded-xl border border-ink-100 bg-slate-100/80">
                  <div className="border-b border-ink-100 bg-white p-3.5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${stage.color}`} /><span className="font-display text-[11px] font-semibold text-ink-900">{stage.name}</span></div><span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[9px] text-ink-500">2</span></div><p className="font-mono mt-1 text-[9px] text-ink-500">{stage.value}</p></div>
                  <div className="space-y-2 p-2.5">
                    {stage.deals.map((deal) => (
                      <article key={deal.company} className="rounded-lg border border-ink-100 bg-white p-3 shadow-xs">
                        <div className="flex items-start gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 font-display text-[8px] font-bold text-white">{deal.mark}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h4 className="truncate font-display text-[10.5px] font-semibold text-ink-900">{deal.company}</h4><span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 font-mono text-[7px] font-semibold uppercase tracking-[0.08em] text-indigo-600">Example</span></div><p className="mt-1 truncate font-body text-[8.5px] text-ink-200">{deal.detail}</p></div></div>
                        <p className="font-mono mt-3 text-[11px] font-semibold text-blue-700">{deal.value}</p>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="font-body mt-3 text-center text-[10.5px] text-ink-500">New workspaces include ten example companies so teams can explore the pipeline before adding their own accounts.</p>
        </div>
      </div>
    </div>
  );
}
