import React from "react";

export default function CommandCenterEmptyState() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/90 px-8 py-12 text-center shadow-sm">
      <img
        src="/watermark-lit.svg"
        alt="Command Center watermark"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain opacity-25"
        draggable={false}
      />
      <div className="relative z-10 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-indigo-500">
          Command Center
        </p>
        <h3 className="text-2xl font-semibold text-slate-900">
          Save a shipper to get started
        </h3>
        <p className="text-sm text-slate-600">
          Use the bookmark icon on any ImportYeti result. Their KPIs, routes,
          and call prep notes will render here automatically once saved.
        </p>
      </div>
    </section>
  );
}
