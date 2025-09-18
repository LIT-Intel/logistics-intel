import React, { useEffect, useState, useCallback } from "react";
import { getFilterOptions } from "@/lib/api";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";

function parseFilterOptions(response) {
  if (!response) return {};
  const data = response.data ? response.data : response;
  return {
    origin_countries: Array.isArray(data.origin_countries) ? data.origin_countries : [],
    destination_countries: Array.isArray(data.destination_countries) ? data.destination_countries : [],
    modes: Array.isArray(data.modes) ? data.modes : [],
    carriers: Array.isArray(data.carriers) ? data.carriers : [],
    hs_prefixes: Array.isArray(data.hs_prefixes) ? data.hs_prefixes : [],
  };
}

export default function SearchFilters({ onChange }) {
  const [options, setOptions] = useState({ origins: [], destinations: [], modes: [], carriers: [], hs: [] });
  const [showRaw, setShowRaw] = useState(false);
  const [filters, setFilters] = useState({
    origin: "",
    destination: "",
    mode: [], // multi-select
    date_start: "",
    date_end: "",
    carrier: "",
    hs: [],  // multi-select (prefixes)
    value_min: 0,
    value_max: 0,
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ["filter-options"],
    queryFn: () => getFilterOptions({}),
    staleTime: 1000 * 60 * 10,
  });

  useEffect(() => {
    if (data) {
      const parsed = parseFilterOptions(data);
      setOptions({
        origins: parsed.origin_countries.sort(),
        destinations: parsed.destination_countries.sort(),
        modes: parsed.modes.sort(),
        carriers: parsed.carriers.sort(),
        hs: parsed.hs_prefixes.sort(),
      });
    }
  }, [data]);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      onChange?.(filters);
    }, 300);
    return () => clearTimeout(handler);
  }, [filters, onChange]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md my-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">
              Could not load search filters. Please try again later. ({error.message || String(error)})
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
      <div className="md:col-span-5 flex items-center justify-between">
        <div />
        <button
          type="button"
          className="text-xs text-blue-600 underline"
          onClick={() => setShowRaw(v => !v)}
        >
          {showRaw ? "Hide" : "Load"} Filters JSON
        </button>
      </div>
      {/* Origin Country */}
      <div>
        <label htmlFor="origin" className="block text-sm font-medium text-gray-700 mb-1">Origin Country</label>
        <select
          id="origin"
          value={filters.origin}
          onChange={(e) => handleFilterChange('origin', e.target.value)}
          disabled={isLoading}
          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          <option value="">Any Origin</option>
          {options.origins.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {/* Destination Country */}
      <div>
        <label htmlFor="destination" className="block text-sm font-medium text-gray-700 mb-1">Destination Country</label>
        <select
          id="destination"
          value={filters.destination}
          onChange={(e) => handleFilterChange('destination', e.target.value)}
          disabled={isLoading}
          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          <option value="">Any Destination</option>
          {options.destinations.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Mode (multi) */}
      <div>
        <div className="block text-sm font-medium text-gray-700 mb-1">Mode</div>
        <div className="flex flex-wrap gap-3">
          {options.modes.map(m => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.mode.includes(m)}
                onCheckedChange={(v) => {
                  const next = new Set(filters.mode);
                  if (v) next.add(m); else next.delete(m);
                  handleFilterChange('mode', Array.from(next));
                }}
              />
              <span className="capitalize">{m}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Carrier */}
      <div>
        <label htmlFor="carrier" className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
        <select
          id="carrier"
          value={filters.carrier}
          onChange={(e) => handleFilterChange('carrier', e.target.value)}
          disabled={isLoading}
          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          <option value="">Any Carrier</option>
          {options.carriers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* HS Code (multi prefixes) */}
      <div>
        <div className="block text-sm font-medium text-gray-700 mb-1">HS Codes</div>
        <div className="flex flex-wrap gap-3">
          {options.hs.slice(0, 12).map(h => (
            <label key={h} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.hs.includes(h)}
                onCheckedChange={(v) => {
                  const next = new Set(filters.hs);
                  if (v) next.add(h); else next.delete(h);
                  handleFilterChange('hs', Array.from(next));
                }}
              />
              <span>{h}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Shipment Value (slider) */}
      <div className="md:col-span-2">
        <div className="block text-sm font-medium text-gray-700 mb-1">Shipment Value (USD)</div>
        <div className="px-2">
          <Slider min={0} max={1000000} step={10000} value={[filters.value_min, filters.value_max || 1000000]}
            onValueChange={([min, max]) => setFilters(prev => ({ ...prev, value_min: min, value_max: max }))}
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>${'{'}{filters.value_min.toLocaleString()}{'}'}</span>
            <span>${'{'}{(filters.value_max || 1000000).toLocaleString()}{'}'}</span>
          </div>
        </div>
      </div>

      {/* Date Start */}
      <div>
        <label htmlFor="date_start" className="block text-sm font-medium text-gray-700 mb-1">Date Start</label>
        <input
          type="date"
          id="date_start"
          value={filters.date_start}
          onChange={(e) => handleFilterChange('date_start', e.target.value)}
          className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        />
      </div>

      {/* Date End */}
      <div>
        <label htmlFor="date_end" className="block text-sm font-medium text-gray-700 mb-1">Date End</label>
        <input
          type="date"
          id="date_end"
          value={filters.date_end}
          onChange={(e) => handleFilterChange('date_end', e.target.value)}
          className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        />
      </div>

      {showRaw && (
        <pre className="md:col-span-6 mt-2 text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-64">
{JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}