// Renders active filter chips with remove buttons + a "Clear all" link.
// Filters are passed in flat; chips are derived for display.

import { X } from 'lucide-react';
import { REGION_LABELS } from './regionPresets';

function chipLabel(category, value) {
  if (category === 'geo.region') return REGION_LABELS[value] ?? value;
  return value;
}

function flattenFilters(filters) {
  const chips = [];
  if (filters.industry?.length) {
    for (const v of filters.industry) chips.push({ category: 'industry', value: v, label: v });
  }
  if (filters.geo?.region) {
    chips.push({ category: 'geo.region', value: filters.geo.region, label: chipLabel('geo.region', filters.geo.region) });
  }
  if (filters.geo?.states?.length && !filters.geo?.region) {
    chips.push({ category: 'geo.states', value: filters.geo.states.join(','), label: `${filters.geo.states.length} states` });
  }
  if (filters.geo?.countries?.length) {
    chips.push({ category: 'geo.countries', value: filters.geo.countries.join(','), label: filters.geo.countries.join(', ') });
  }
  if (filters.opportunity_types?.length) {
    for (const v of filters.opportunity_types) chips.push({ category: 'opportunity_types', value: v, label: `Opp: ${v}` });
  }
  if (filters.freshness_state?.length) {
    for (const v of filters.freshness_state) chips.push({ category: 'freshness_state', value: v, label: `Freshness: ${v}` });
  }
  if (filters.dataset_filter && filters.dataset_filter !== 'all') {
    chips.push({ category: 'dataset_filter', value: filters.dataset_filter, label: filters.dataset_filter });
  }
  return chips;
}

function removeChip(filters, chip) {
  const next = { ...filters, geo: { ...(filters.geo || {}) } };
  if (chip.category === 'industry') {
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
    <div className="flex flex-wrap gap-2 items-center">
      {chips.map((c, i) => (
        <span
          key={`${c.category}:${c.value}:${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 text-xs"
        >
          {c.label}
          <button
            type="button"
            className="ml-0.5 hover:text-slate-900"
            onClick={() => onChange(removeChip(filters, c))}
            aria-label={`Remove ${c.label}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <button
        type="button"
        className="text-xs text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
        onClick={() => onChange({})}
      >
        Clear all
      </button>
    </div>
  );
}
