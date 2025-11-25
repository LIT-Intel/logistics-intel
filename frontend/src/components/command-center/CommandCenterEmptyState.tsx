import React from "react";
import { Ship, Package, LineChart } from "lucide-react";

const Badge = ({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-white/80">
    <Icon className="h-3.5 w-3.5 text-indigo-500" />
    {label}
  </span>
);

export default function CommandCenterEmptyState() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-10 shadow-sm">
      <img
        src="/watermark-lit.svg"
        alt="LIT watermark"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
      />
      <div className="relative z-10 grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-indigo-500">
            Command Center
          </p>
          <h3 className="mt-3 text-3xl font-semibold text-slate-900">
            Nothing saved yet
          </h3>
          <p className="mt-3 text-sm text-slate-600">
            Save a shipper from ImportYeti search to unlock shipment KPIs,
            recent routes, and pre-call briefings inside Command Center.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge icon={Ship} label="Routes & carriers" />
            <Badge icon={Package} label="TEU + spend" />
            <Badge icon={LineChart} label="AI prep briefs" />
          </div>
        </div>
        <div className="relative flex items-center justify-center">
          <div className="relative h-48 w-full max-w-sm rounded-3xl border border-white/60 bg-white/80 p-4 shadow-xl backdrop-blur">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>Shipment mix</span>
              <span>Last 12m</span>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-600/20 to-transparent px-3 py-2">
                <span className="font-semibold text-slate-700">FCL lanes</span>
                <span className="text-slate-900">68%</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-emerald-500/20 to-transparent px-3 py-2">
                <span className="font-semibold text-slate-700">LCL lanes</span>
                <span className="text-slate-900">32%</span>
              </div>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-3 py-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pre-call note
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  CN → USWC drives 61% of TEU. Prep pricing POV on Ningbo
                  congestion + Tacoma dwell.
                </p>
              </div>
            </div>
            <div className="absolute -bottom-10 right-6 h-20 w-20 rounded-full border border-white/80 bg-white/80 shadow-lg backdrop-blur">
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
