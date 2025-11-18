'use client';

import * as React from "react";

export type SearchFiltersValue = {
  mode: "any" | "ocean" | "air";
  region: "global" | "americas" | "emea" | "apac";
  activity: "12m" | "24m" | "all";
};

type SearchFiltersProps = {
  value: SearchFiltersValue;
  onChange: (value: SearchFiltersValue) => void;
  className?: string;
};

export default function SearchFilters({ value, onChange, className }: SearchFiltersProps) {
  const rootClass = [
    "flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handlePatch = (patch: Partial<SearchFiltersValue>) => {
    onChange({ ...value, ...patch });
  };

  const pillBase =
    "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-200";

  const renderGroup = (
    label: string,
    options: Array<{ value: SearchFiltersValue[keyof SearchFiltersValue]; label: string }>,
    current: string,
    onSelect: (val: any) => void,
  ) => (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const isActive = current === option.value;
          return (
            <button
              key={option.value as string}
              type="button"
              onClick={() => onSelect(option.value)}
              className={`${pillBase} ${
                isActive ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              aria-pressed={isActive}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={rootClass}>
      {renderGroup(
        "Mode",
        [
          { value: "any" as const, label: "Any" },
          { value: "ocean" as const, label: "Ocean" },
          { value: "air" as const, label: "Air" },
        ],
        value.mode,
        (mode) => handlePatch({ mode }),
      )}

      {renderGroup(
        "Region",
        [
          { value: "global" as const, label: "Global" },
          { value: "americas" as const, label: "Americas" },
          { value: "emea" as const, label: "EMEA" },
          { value: "apac" as const, label: "APAC" },
        ],
        value.region,
        (region) => handlePatch({ region }),
      )}

      {renderGroup(
        "Activity",
        [
          { value: "12m" as const, label: "12m Active" },
          { value: "24m" as const, label: "24m" },
          { value: "all" as const, label: "All time" },
        ],
        value.activity,
        (activity) => handlePatch({ activity }),
      )}
    </div>
  );
}
