import React from "react";
import { Ship, MapPin, CalendarClock, ArrowRight } from "lucide-react";

type Company = {
  company_id?: string;
  id?: string;
  name?: string;
  alias?: string | null;
  website?: string | null;
  shipments_12m?: number | string;
  last_activity?: string | null;
  top_route?: string | null;
  saved?: boolean;
  canSave?: boolean;
};

type Props = {
  company: Company;
  onView?: (c: Company) => void;
  onSave?: (c: Company) => void;
};

export default function CompanyCardCompact({ company, onView, onSave }: Props) {
  const {
    company_id,
    name,
    alias,
    website,
    shipments_12m,
    last_activity,
    top_route,
    saved,
  } = company || {};

  const pretty = (v: any, fallback = "—") =>
    v === null || v === undefined || v === "" ? fallback : v;

  const clickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onView?.(company);
  };

  const clickSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSave?.(company);
  };

  return (
    // Root: non-navigating surface — single onClick that only stops bubbling
    <div
      className="w-full bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-lg transition-shadow relative"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Top brand border */}
      <div className="absolute inset-x-0 top-0 h-1 bg-[#7F3DFF] rounded-t-xl" />

      {/* Title */}
      <h3 className="text-xl font-bold text-gray-900 truncate">{pretty(name)}</h3>
      <div
        className="mt-0.5 text-sm text-gray-500 truncate"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {alias ? <span className="mr-2">{alias}</span> : null}
        {website ? (
          <span className="truncate">{website}</span>
        ) : !alias && !website ? (
          <span>ID: {pretty(company_id)}</span>
        ) : null}
      </div>

      {/* KPI band (bordered top/bottom) */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-b border-gray-200 py-3">
        <div className="flex items-center gap-2">
          <Ship className="h-4 w-4" color="#7F3DFF" />
          <span className="text-gray-700">
            <span className="font-medium">{pretty(shipments_12m)}</span> Shipments (12m)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-gray-500" />
          <span className="text-gray-700">
            Activity: <span className="font-medium">{pretty(last_activity)}</span>
          </span>
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-500" />
          <span className="text-gray-700">
            Top Route: <span className="font-medium">{pretty(top_route)}</span>
          </span>
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={clickSave}
          className={`rounded-full px-3 py-1.5 text-sm font-medium text-white ${
            saved ? "bg-emerald-500" : "bg-[#7F3DFF] hover:opacity-95"
          }`}
        >
          {saved ? "Saved" : "Save"}
        </button>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs text-indigo-700">
            Ready
          </span>
          <button
            type="button"
            onClick={clickView}
            className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
          >
            Details <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
