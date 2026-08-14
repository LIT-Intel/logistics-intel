import { BarChart3, CheckSquare2, DollarSign, Users2 } from "lucide-react";

const metrics = [
  { label: "Open pipeline", value: "$225K", icon: DollarSign, tone: "text-blue-600 bg-blue-50" },
  { label: "Active deals", value: "18", icon: Users2, tone: "text-violet-600 bg-violet-50" },
  { label: "Weighted forecast", value: "$148K", icon: BarChart3, tone: "text-cyan-700 bg-cyan-50" },
  { label: "Tasks due", value: "6", icon: CheckSquare2, tone: "text-amber-600 bg-amber-50" },
] as const;

const stages = [
  { name: "New", count: 8, value: "$82K", color: "bg-blue-500" },
  { name: "Qualified", count: 5, value: "$96K", color: "bg-cyan-500" },
  { name: "Quoted", count: 3, value: "$34K", color: "bg-amber-500" },
  { name: "Negotiation", count: 2, value: "$13K", color: "bg-violet-500" },
] as const;

/** A lightweight, code-native product view. It avoids exposing customer data. */
export function CrmPipelinePreview() {
  return (
    <div className="relative mx-auto max-w-container px-5 sm:px-8" aria-label="Logistics Intel CRM pipeline preview">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_50%_20%,rgba(59,130,246,0.18),transparent_66%)] blur-2xl" />
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-slate-950/25">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
          <div>
            <p className="font-display text-[15px] font-semibold text-white">Command Center</p>
            <p className="font-body mt-0.5 text-[11px] text-slate-400">Freight accounts, pipeline, tasks and reporting</p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-300">
            Live workspace
          </span>
        </div>

        <div className="grid gap-3 border-b border-white/10 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
              <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <p className="font-display mt-4 text-[22px] font-semibold tracking-[-0.03em] text-white">{value}</p>
              <p className="font-mono mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Pipeline</p>
              <p className="font-display mt-1 text-[17px] font-semibold text-white">Deals by freight sales stage</p>
            </div>
            <p className="hidden font-body text-[11px] text-slate-400 sm:block">Owners, values, next steps and close dates stay visible.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stages.map((stage, index) => (
              <div key={stage.name} className="min-h-[154px] rounded-xl border border-white/10 bg-white/[0.035] p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${stage.color}`} />
                    <span className="font-display text-[12px] font-semibold text-white">{stage.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">{stage.count}</span>
                </div>
                <p className="font-mono mt-1 text-[10px] text-slate-500">{stage.value}</p>
                <div className="mt-4 rounded-lg border border-white/10 bg-slate-900 p-3">
                  <p className="truncate font-display text-[11px] font-semibold text-slate-100">
                    {index === 0 ? "New shipper opportunity" : index === 1 ? "Transpacific account" : index === 2 ? "Annual freight bid" : "Final rate review"}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${34 + index * 17}%` }} />
                  </div>
                  <p className="font-body mt-2 text-[9.5px] text-slate-500">Next step scheduled</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
