import React from "react";

// Compatibility shim: works whether caller passes {r} or {row}
export default function CompanyCardCompact(props) {
  const r = props.r || props.row || {};
  const onOpen = props.onOpen || (() => {});

  const name = r.company_name || "—";
  const id = r.company_id || "—";
  const shipments12m = r.shipments_12m ?? "—";
  const lastActivity =
    (r.last_activity && (r.last_activity.value || r.last_activity)) || "—";

  return (
    <div
      className="rounded-xl bg-white p-4 border border-gray-200 shadow-sm hover:shadow-md transition"
      role="group"
      aria-label={`Company card for ${name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">Company</div>
          <div className="text-base font-semibold text-gray-900 truncate" title={name}>
            {name}
          </div>
          <div className="text-xs text-gray-500 truncate">ID: {id}</div>
        </div>
        <button
          className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={() => onOpen(r)}
        >
          Details
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
        <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
          <div className="text-[11px] uppercase text-gray-500">Shipments (12m)</div>
          <div className="font-semibold text-gray-900">{shipments12m}</div>
        </div>
        <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
          <div className="text-[11px] uppercase text-gray-500">Last Activity</div>
          <div className="font-semibold text-gray-900">{String(lastActivity)}</div>
        </div>
      </div>
    </div>
  );
}
