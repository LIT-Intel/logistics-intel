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
    origin_countries: Array.isArray(data.origin_countries) ? data.origin_countries : (Array.isArray(data.origins) ? data.origins : []),
    destination_countries: Array.isArray(data.destination_countries) ? data.destination_countries : (Array.isArray(data.destinations) ? data.destinations : []),
    modes: Array.isArray(data.modes) ? data.modes : [],
    carriers: Array.isArray(data.carriers) ? data.carriers : [],
    hs_prefixes: Array.isArray(data.hs_prefixes) ? data.hs_prefixes : (Array.isArray(data.hs_codes) ? data.hs_codes : []),
  };
}

export default function SearchFilters({ onChange }) {
  const [options, setOptions] = useState({ origins: [], destinations: [], modes: [], carriers: [], hs: [] });
  const [openMobile, setOpenMobile] = useState(false);
  const [filters, setFilters] = useState({
    origin: "",
    destination: "",
    mode: "any", // radio: any | air | ocean
    date_start: "",
    date_end: "",
    carrier: "",
    hs: [],  // multi-select (prefixes)
    hs_text: "",
    origin_city: "",
    origin_state: "",
    origin_zip: "",
    dest_city: "",
    dest_state: "",
    dest_zip: "",
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
    // Smart parsing for location inputs: try to infer state/ZIP
    if (key === 'origin_city' || key === 'dest_city') {
      setFilters(prev => ({ ...prev, [key]: value }));
      return;
    }
    if (key === 'origin_state' || key === 'dest_state') {
      const v = (value || '').toUpperCase().slice(0, 2);
      setFilters(prev => ({ ...prev, [key]: v }));
      return;
    }
    if (key === 'origin_zip' || key === 'dest_zip') {
      const v = String(value || '').replace(/[^0-9]/g, '').slice(0, 10);
      setFilters(prev => ({ ...prev, [key]: v }));
      return;
    }
    // General case
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
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="md:hidden inline-flex items-center px-3 py-2 text-sm rounded-lg border bg-white"
          onClick={() => setOpenMobile(v => !v)}
        >
          {openMobile ? 'Hide Filters' : 'Show Filters'}
        </button>
        <div />
      </div>

      <div className={`${openMobile ? 'grid' : 'hidden'} md:grid grid-cols-1 md:grid-cols-6 gap-4`}>
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

      {/* Origin City */}
      <div>
        <label htmlFor="origin_city" className="block text-sm font-medium text-gray-700 mb-1">Origin City</label>
        <input
          id="origin_city"
          type="text"
          value={filters.origin_city}
          onChange={(e) => handleFilterChange('origin_city', e.target.value)}
          disabled={isLoading}
          className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          placeholder="e.g., Los Angeles"
        />
      </div>

      {/* Origin State */}
      <div>
        <label htmlFor="origin_state" className="block text-sm font-medium text-gray-700 mb-1">Origin State</label>
        <input
          id="origin_state"
          type="text"
          value={filters.origin_state}
          onChange={(e) => handleFilterChange('origin_state', e.target.value.toUpperCase().slice(0, 2))}
          disabled={isLoading}
          className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          placeholder="e.g., CA"
        />
      </div>

      {/* Origin ZIP */}
      <div>
        <label htmlFor="origin_zip" className="block text-sm font-medium text-gray-700 mb-1">Origin ZIP</label>
        <input
          id="origin_zip"
          type="text"
          inputMode="numeric"
          pattern="\\d*"
          value={filters.origin_zip}
          onChange={(e) => handleFilterChange('origin_zip', e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
          disabled={isLoading}
          className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          placeholder="e.g., 90001"
        />
      </div>

      {/* Destination City */}
      <div>
        <label htmlFor="dest_city" className="block text-sm font-medium text-gray-700 mb-1">Destination City</label>
        <input
          id="dest_city"
          type="text"
          value={filters.dest_city}
          onChange={(e) => handleFilterChange('dest_city', e.target.value)}
          disabled={isLoading}
          className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          placeholder="e.g., Shanghai"
        />
      </div>

      {/* Destination State */}
      <div>
        <label htmlFor="dest_state" className="block text-sm font-medium text-gray-700 mb-1">Destination State</label>
        <input
          id="dest_state"
          type="text"
          value={filters.dest_state}
          onChange={(e) => handleFilterChange('dest_state', e.target.value.toUpperCase().slice(0, 2))}
          disabled={isLoading}
          className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          placeholder="e.g., NY"
        />
      </div>

      {/* Destination ZIP */}
      <div>
        <label htmlFor="dest_zip" className="block text-sm font-medium text-gray-700 mb-1">Destination ZIP</label>
        <input
          id="dest_zip"
          type="text"
          inputMode="numeric"
          pattern="\\d*"
          value={filters.dest_zip}
          onChange={(e) => handleFilterChange('dest_zip', e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
          disabled={isLoading}
          className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          placeholder="e.g., 10001"
        />
      </div>

      {/* Mode (radio) */}
      <div>
        <div className="block text-sm font-medium text-gray-700 mb-1">Mode</div>
        <div className="flex items-center gap-4 text-sm">
          {['any','air','ocean'].map(m => (
            <label key={m} className="inline-flex items-center gap-2">
              <input type="radio" name="mode" value={m} checked={filters.mode === m} onChange={(e) => handleFilterChange('mode', e.target.value)} />
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

      {/* HS Codes (free text only) */}
      <div>
        <label htmlFor="hs_text" className="block text-sm font-medium text-gray-700 mb-1">HS Codes</label>
        <input
          id="hs_text"
          type="text"
          value={filters.hs_text}
          onChange={(e) => handleFilterChange('hs_text', e.target.value)}
          placeholder="Enter HS codes (comma-separated), e.g., 8471, 8517, 9403"
          className="block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        />
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

      </div>
    </div>
  );
}