import React from "react";

export default function CommandCenterEmptyState() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-white/80 p-10 text-center shadow-sm">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
      >
        <div className="absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100" />
        <div className="absolute -top-6 -left-6 h-32 w-32 rounded-full bg-gradient-to-br from-slate-100 to-slate-200" />
      </div>
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="grid h-24 w-24 place-items-center rounded-full border border-slate-100 bg-slate-50 text-indigo-400 shadow-inner">
          <svg
            viewBox="0 0 64 64"
            className="h-10 w-10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="8" y="24" width="48" height="20" rx="4" />
            <path d="M16 24v-6a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v6" />
            <path d="M16 44v6h32v-6" />
            <circle cx="22" cy="52" r="2" />
            <circle cx="42" cy="52" r="2" />
            <path d="M24 32h16M24 36h10" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Save a company to Command Center
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Use the ImportYeti search to bookmark shippers. Their shipment KPIs,
            routes, and briefing tools will appear here once saved.
          </p>
        </div>
      </div>
    </section>
  );
}
