'use client';

import * as React from "react";
import type { FilterOptions } from "@/lib/api";

type FacetKey = "origin" | "dest" | "mode" | "hs";

type SearchFiltersProps = {
  filterOptions: FilterOptions | null;
  origin: string[];
  dest: string[];
  mode: string[];
  hs: string[];
  onChange: (next: { origin: string[]; dest: string[]; mode: string[]; hs: string[] }) => void;
  className?: string;
};

type MultiChipRowProps = {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
  transform?: (value: string) => string;
};

function MultiChipRow({ label, values, selected, onToggle, transform }: MultiChipRowProps) {
  if (!values.length) return null;
  const display = transform ?? ((value: string) => value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {values.map((value) => {
        const normalized = value.trim();
        const isActive = selected.includes(normalized);
        return (
          <button
            key={normalized}
            type="button"
            onClick={() => onToggle(normalized)}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
              isActive ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            aria-pressed={isActive}
          >
            {display(normalized)}
          </button>
        );
      })}
    </div>
  );
}

export default function SearchFilters({
  filterOptions,
  origin,
  dest,
  mode,
  hs,
  onChange,
  className,
}: SearchFiltersProps) {
  const opts = React.useMemo(
    () => ({
      origins: filterOptions?.origins ?? [],
      destinations: filterOptions?.destinations ?? [],
      modes: filterOptions?.modes ?? [],
      hs: filterOptions?.hs ?? [],
    }),
    [filterOptions],
  );

  const selections = React.useMemo(
    () => ({ origin, dest, mode, hs }),
    [origin, dest, mode, hs],
  );

  const hasSelections = origin.length + dest.length + mode.length + hs.length > 0;

  const handleToggle = React.useCallback(
    (facet: FacetKey, value: string) => {
      const current = new Set(selections[facet]);
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      const next = {
        origin: facet === "origin" ? Array.from(current) : selections.origin,
        dest: facet === "dest" ? Array.from(current) : selections.dest,
        mode: facet === "mode" ? Array.from(current) : selections.mode,
        hs: facet === "hs" ? Array.from(current) : selections.hs,
      };
      onChange(next);
    },
    [onChange, selections],
  );

  const rootClass = ["flex flex-col gap-3", className].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <MultiChipRow
        label="Origins"
        values={opts.origins}
        selected={origin}
        onToggle={(value) => handleToggle("origin", value)}
      />
      <MultiChipRow
        label="Destinations"
        values={opts.destinations}
        selected={dest}
        onToggle={(value) => handleToggle("dest", value)}
      />
      <MultiChipRow
        label="Modes"
        values={opts.modes}
        selected={mode}
        onToggle={(value) => handleToggle("mode", value.toLowerCase())}
        transform={(value) => value.toUpperCase()}
      />
      <MultiChipRow
        label="HS Codes"
        values={opts.hs}
        selected={hs}
        onToggle={(value) => handleToggle("hs", value)}
      />
      {hasSelections && (
        <button
          type="button"
          onClick={() => onChange({ origin: [], dest: [], mode: [], hs: [] })}
          className="self-start text-[11px] font-semibold text-indigo-600 underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
