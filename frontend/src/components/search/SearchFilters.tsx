'use client';

import * as React from "react";
import type { FilterOptions } from "@/lib/api";

type Selected = {
  origins: string[];
  destinations: string[];
  modes: string[];
  hs: string[];
};

type Props = {
  filters: FilterOptions | null;
  selected: Selected;
  onToggle: (type: keyof Selected, value: string) => void;
  onClearAll: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  onDismissError?: () => void;
  className?: string;
  visible?: boolean;
};

type FacetKey = keyof Selected;

const FACETS: Array<{ key: FacetKey; label: string }> = [
  { key: "origins", label: "Origins" },
  { key: "destinations", label: "Destinations" },
  { key: "modes", label: "Modes" },
  { key: "hs", label: "HS Codes" },
];

const CHIP_BASE =
  "mr-2 mb-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-200";
const CHIP_ACTIVE = "bg-indigo-600 text-white hover:bg-indigo-500 focus:ring-offset-1";
const CHIP_INACTIVE =
  "bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-indigo-500 focus:ring-offset-1";
const CHIP_OVERFLOW =
  "bg-slate-200 text-slate-600 hover:bg-slate-300 focus-visible:ring-indigo-500 focus:ring-offset-1";

const SKELETON_CHIPS = Array.from({ length: 6 });

export default function SearchFilters({
  filters,
  selected,
  onToggle,
  onClearAll,
  loading = false,
  errorMessage,
  onDismissError,
  className,
  visible = true,
}: Props) {
  if (!visible) {
    return null;
  }

  const [expanded, setExpanded] = React.useState<Record<FacetKey, boolean>>({
    origins: false,
    destinations: false,
    modes: false,
    hs: false,
  });

  const resolvedFilters: FilterOptions = React.useMemo(
    () => ({
      origins: filters?.origins ?? [],
      destinations: filters?.destinations ?? [],
      modes: filters?.modes ?? [],
      hs: filters?.hs ?? [],
    }),
    [filters],
  );

  const hasSelections = React.useMemo(
    () =>
      selected.origins.length > 0 ||
      selected.destinations.length > 0 ||
      selected.modes.length > 0 ||
      selected.hs.length > 0,
    [selected],
  );

  const toggleExpanded = React.useCallback((key: FacetKey) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (loading) {
    return (
      <div className={`flex flex-col gap-3 ${className ?? ""}`}>
        <div className="flex flex-wrap">
          {SKELETON_CHIPS.map((_, index) => (
            <span
              key={index}
              className="mr-2 mb-2 inline-flex h-6 w-16 animate-pulse rounded-full bg-slate-200"
            />
          ))}
        </div>
      </div>
    );
  }

  const renderFacet = (key: FacetKey, label: string) => {
    const options = resolvedFilters[key] ?? [];
    if (options.length === 0) {
      return null;
    }

    const showAll = expanded[key];
    const visibleOptions = showAll ? options : options.slice(0, 8);
    const remaining = Math.max(0, options.length - visibleOptions.length);

    return (
      <div key={key} className="flex flex-wrap items-center">
        <span className="mr-3 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {visibleOptions.map((value) => {
          const normalizedValue = key === "modes" ? value.toLowerCase() : value;
          const displayLabel = key === "modes" ? value.toUpperCase() : value;
          const isActive = selected[key].includes(normalizedValue);

          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(key, normalizedValue)}
              className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_INACTIVE}`}
              aria-pressed={isActive}
            >
              <span>{displayLabel}</span>
              {isActive && <span className="ml-1 text-[11px] font-semibold">×</span>}
            </button>
          );
        })}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => toggleExpanded(key)}
            className={`${CHIP_BASE} ${CHIP_OVERFLOW}`}
          >
            {showAll ? "Show less" : `+${remaining} more`}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {errorMessage && (
        <div className="mr-2 mb-1 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span>{errorMessage}</span>
          {onDismissError && (
            <button
              type="button"
              onClick={onDismissError}
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
      {FACETS.map(({ key, label }) => renderFacet(key, label))}
      {hasSelections && (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-auto inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-500"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
