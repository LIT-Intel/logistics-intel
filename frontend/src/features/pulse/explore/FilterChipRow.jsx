// V6-style active filter chips — cyan-tinted pills with X. Each chip shows
// the category name + value (+ optional metric in parens, e.g.
// "Industry: Manufacturing ($9796.3B) ✕").

import { X } from 'lucide-react';
import { REGION_LABELS } from './regionPresets';

function chipLabel(category, value) {
  if (category === 'geo.region') return REGION_LABELS[value] ?? value;
  return value;
}

function flattenFilters(filters) {
  const chips = [];
  if (filters.name?.trim()) {
    chips.push({ category: 'name', categoryLabel: 'Company', value: filters.name, label: filters.name });
  }
  if (filters.industry?.length) {
    for (const v of filters.industry) chips.push({ category: 'industry', categoryLabel: 'Industry', value: v, label: v });
  }
  if (filters.geo?.region) {
    chips.push({ category: 'geo.region', categoryLabel: 'Region', value: filters.geo.region, label: chipLabel('geo.region', filters.geo.region) });
  }
  if (filters.geo?.states?.length && !filters.geo?.region) {
    chips.push({ category: 'geo.states', categoryLabel: 'States', value: filters.geo.states.join(','), label: `${filters.geo.states.length} states` });
  }
  if (filters.geo?.countries?.length) {
    chips.push({ category: 'geo.countries', categoryLabel: 'Country', value: filters.geo.countries.join(','), label: filters.geo.countries.join(', ') });
  }
  if (filters.opportunity_types?.length) {
    for (const v of filters.opportunity_types) chips.push({ category: 'opportunity_types', categoryLabel: 'Opportunity', value: v, label: v });
  }
  if (filters.freshness_state?.length) {
    for (const v of filters.freshness_state) chips.push({ category: 'freshness_state', categoryLabel: 'Freshness', value: v, label: v });
  }
  if (filters.dataset_filter && filters.dataset_filter !== 'all') {
    chips.push({ category: 'dataset_filter', categoryLabel: 'Dataset', value: filters.dataset_filter, label: filters.dataset_filter });
  }
  return chips;
}

function removeChip(filters, chip) {
  const next = { ...filters, geo: { ...(filters.geo || {}) } };
  if (chip.category === 'name') {
    delete next.name;
  } else if (chip.category === 'industry') {
    next.industry = (next.industry ?? []).filter((v) => v !== chip.value);
  } else if (chip.category === 'geo.region') {
    delete next.geo.region;
    delete next.geo.states;
  } else if (chip.category === 'geo.states') {
    delete next.geo.states;
  } else if (chip.category === 'geo.countries') {
    delete next.geo.countries;
  } else if (chip.category === 'opportunity_types') {
    next.opportunity_types = (next.opportunity_types ?? []).filter((v) => v !== chip.value);
  } else if (chip.category === 'freshness_state') {
    next.freshness_state = (next.freshness_state ?? []).filter((v) => v !== chip.value);
  } else if (chip.category === 'dataset_filter') {
    next.dataset_filter = 'all';
  }
  return next;
}

export default function FilterChipRow({ filters, onChange }) {
  const chips = flattenFilters(filters);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 items-center px-3 sm:px-4 py-1.5 sm:py-2 bg-white border-b border-slate-200 overflow-x-auto">
      {chips.map((c, i) => (
        <span
          key={`${c.category}:${c.value}:${i}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-cyan-50 ring-1 ring-cyan-200 text-cyan-900 pl-2 pr-1 py-0.5 text-xs"
        >
          <span className="text-cyan-700/70 font-medium">{c.categoryLabel}:</span>
          <span className="font-medium">{c.label}</span>
          <button
            type="button"
            className="ml-0.5 hover:bg-cyan-100 rounded p-0.5 text-cyan-700 hover:text-cyan-900"
            onClick={() => onChange(removeChip(filters, c))}
            aria-label={`Remove ${c.label}`}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <button
        type="button"
        className="ml-1 text-xs text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
        onClick={() => onChange({})}
      >
        Clear all
      </button>
    </div>
  );
}
