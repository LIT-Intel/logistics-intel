"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase";

type CompanyIndexRow = {
  company_id: string;
  company_name: string;
  country?: string;
  city?: string;
  total_shipments?: number;
  total_teu?: number;
};

type Props = {
  value: string;
  onSelect: (row: CompanyIndexRow) => void;
  placeholder?: string;
};

export default function AutocompleteInput({
  value,
  onSelect,
  placeholder = "Search companies",
}: Props) {
  const [query, setQuery] = React.useState(value || "");
  const [results, setResults] = React.useState<CompanyIndexRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Debounced search
  React.useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const handle = setTimeout(() => {
      runSearch(query);
    }, 300);

    return () => clearTimeout(handle);
  }, [query]);

  async function runSearch(q: string) {
    setLoading(true);

    const { data, error } = await supabase
      .from("lit_company_index")
      .select(
        `
        company_id,
        company_name,
        country,
        city,
        total_shipments,
        total_teu
      `
      )
      .ilike("company_name", `%${q}%`)
      .order("total_shipments", { ascending: false })
      .limit(25);

    if (error) {
      console.error("Search error:", error);
      setResults([]);
      setLoading(false);
      return;
    }

    setResults(data ?? []);
    setLoading(false);
  }

  return (
    <div className="relative w-full">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {loading && (
        <div className="absolute right-3 top-2 text-xs text-slate-400">
          Searching…
        </div>
      )}

      {results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((row) => (
            <button
              key={row.company_id}
              type="button"
              onClick={() => {
                onSelect(row);
                setResults([]);
              }}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-100"
            >
              <span className="font-medium text-slate-900">
                {row.company_name}
              </span>
              <span className="text-xs text-slate-500">
                {row.city || "—"} {row.country || ""}
                {row.total_shipments
                  ? ` • ${row.total_shipments.toLocaleString()} shipments`
                  : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
