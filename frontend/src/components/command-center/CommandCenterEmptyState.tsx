import React from "react";

import React from "react";
import { Ship, Package, LineChart } from "lucide-react";

const Tag = ({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-white/80">
    <Icon className="h-3.5 w-3.5 text-indigo-500" />
    {label}
  </span>
);

export default function CommandCenterEmptyState() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-10 shadow-sm">
      <img
        src="/watermark-lit.svg"
        alt="LIT Search watermark"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-20"
        draggable={false}
      />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-indigo-500">
            Command Center
          </p>
          <h3 className="mt-3 text-3xl font-semibold text-slate-900">
            Save from LIT Search to unlock insights
          </h3>
          <p className="mt-3 text-sm text-slate-600">
            Bookmark shippers directly from LIT Search. Their lanes, KPIs, and
            pre-call briefing data will auto-populate here the moment they are
            saved.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Tag icon={Ship} label="Route tracking" />
            <Tag icon={Package} label="Volume & TEU" />
            <Tag icon={LineChart} label="Briefing ready" />
          </div>
        </div>
        <div className="relative">
          <div className="relative mx-auto h-48 w-full max-w-sm rounded-3xl border border-white/60 bg-white/85 p-4 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Shipment mix</span>
              <span>Live view</span>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-600/15 to-transparent px-3 py-2">
                <span className="font-semibold text-slate-700">FCL focus</span>
                <span className="text-slate-900">68%</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-emerald-500/15 to-transparent px-3 py-2">
                <span className="font-semibold text-slate-700">LCL lanes</span>
                <span className="text-slate-900">32%</span>
              </div>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pre-call note
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  LIT Intelligence highlights CN → USWC as the highest leverage
                  lane. Prep risk mitigation talking points before outreach.
                </p>
              </div>
            </div>
            <div className="absolute -bottom-10 right-6 h-20 w-20 rounded-full border border-white/80 bg-white/90 shadow-lg backdrop-blur">
              <div className="grid h-full w-full place-items-center text-indigo-500">
                <Ship className="h-8 w-8" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
