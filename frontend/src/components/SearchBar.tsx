'use client';

import { useCallback, useEffect, useState } from "react";

type Props = {
  initialQuery?: string;
  onSearch: (q: string) => void;
  isLoading?: boolean;
  placeholder?: string;
};

export default function SearchBar({
  initialQuery = "",
  onSearch,
  isLoading = false,
  placeholder = "Search companies or shippers…",
}: Props) {
  const [q, setQ] = useState(initialQuery.trim());

  useEffect(() => {
    setQ(initialQuery.trim());
  }, [initialQuery]);

  const runSearch = useCallback(() => {
    const value = q.trim();
    if (!value || isLoading) return;
    onSearch(value);
  }, [q, isLoading, onSearch]);

  return (
    <div className="w-full max-w-3xl">
      <label htmlFor="search" className="sr-only">
        Search
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runSearch();
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          aria-describedby="search-help"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={!q.trim() || isLoading}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Search"
        >
          {isLoading ? "Searching…" : "Search"}
        </button>
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              if (!isLoading) {
                onSearch("");
              }
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition hover:bg-slate-50"
            aria-label="Clear search"
            title="Clear search"
          >
            Clear
          </button>
        )}
      </div>
      <p id="search-help" className="mt-2 text-xs text-slate-500">
        Type a company or shipper name, then press Enter or hit Search.
      </p>
    </div>
  );
}
