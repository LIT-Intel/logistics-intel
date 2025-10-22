import React, { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  minChars?: number;     // default 2
  limit?: number;        // default 6
};

/**
 * Debounced input with live suggestions backed by /api/lit/public/searchCompanies.
 * - Keeps keyboard "Enter" -> hard submit.
 * - Clicking a suggestion fills input and triggers onSubmit (if provided).
 */
export default function AutocompleteInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Search by company name or alias (e.g., UPS, Maersk)…",
  className = "",
  minChars = 2,
  limit = 6,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch
  useEffect(() => {
    const term = (value || "").trim();
    if (term.length < minChars) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const h = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        setLoading(true);
        const res = await fetch("/api/lit/public/searchCompanies", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ q: term, limit, offset: 0 }),
          signal: ac.signal,
        });

        if (!res.ok) throw new Error(`suggestions ${res.status}`);
        const data = await res.json();
        const rows: any[] = data?.results || data?.rows || [];
        setSuggestions(rows.slice(0, limit));
        setOpen(true);
      } catch (e) {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(h);
  }, [value, minChars, limit]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-autocomplete-root="1"]')) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className={`relative ${className}`} data-autocomplete-root="1">
      <input
        data-test="search-input"
        className="flex w-full border border-input bg-transparent px-3 py-1 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pl-9 h-12 text-base rounded-lg"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setOpen(false);
            onSubmit?.();
          }
        }}
      />

      {/* search icon */}
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.3-4.3"></path>
      </svg>

      {/* Suggestions popover */}
      {(value || "").trim().length >= minChars && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="px-4 py-3 text-sm text-gray-600 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-600" />
            Live suggestions
            {loading && <span className="ml-2 text-gray-400">· loading…</span>}
          </div>

          {!open || suggestions.length === 0 ? (
            <div className="px-4 pb-4 text-gray-500 text-sm">No live matches yet</div>
          ) : (
            <ul className="pb-2 max-h-72 overflow-auto">
              {suggestions.map((s, i) => {
                const name = s?.company_name || s?.name || "(unknown)";
                const id = s?.company_id || s?.id || "";
                return (
                  <li key={`${id || name}-${i}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                        onSubmit?.();
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span className="truncate">{name}</span>
                      {id && (
                        <span className="ml-3 text-xs text-gray-400">ID: {id}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
