import React, { useEffect, useState, useCallback } from "react";
import { getFilterOptions } from "@/api/functions/getFilterOptions";
import { AlertCircle } from "lucide-react";

function parseFilterOptions(response) {
  if (!response) return {};
  const data = response.data ? response.data : response;
  return {
    origin_countries: Array.isArray(data.origin_countries) ? data.origin_countries : [],
    destination_countries: Array.isArray(data.destination_countries) ? data.destination_countries : [],
    modes: Array.isArray(data.modes) ? data.modes : [],
  };
}

export default function SearchFilters({ onChange }) {
  const [options, setOptions] = useState({ origins: [], destinations: [], modes: [] });
  const [filters, setFilters] = useState({
    origin: "",
    destination: "",
    mode: "",
    date_start: "",
    date_end: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getFilterOptions({});
      if (response && (response.status === 404 || response.ok === false)) {
         throw new Error(response.error || "Function not found (404).");
      }
      const parsed = parseFilterOptions(response);
      setOptions({
        origins: parsed.origin_countries.sort(),
        destinations: parsed.destination_countries.sort(),
        modes: parsed.modes.sort(),
      });
    } catch (err) {
      console.error("SearchFilters: Error loading filter options:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);
  
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
              Could not load search filters. Please try again later. ({error})
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
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

      {/* Mode */}
      <div>
        <label htmlFor="mode" className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
        <select
          id="mode"
          value={filters.mode}
          onChange={(e) => handleFilterChange('mode', e.target.value)}
          disabled={isLoading}
          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          <option value="">Any Mode</option>
          {options.modes.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
        </select>
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
  );
}