import React, { useEffect, useRef, useState } from "react";
import { searchCompanies as searchCompaniesApi } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";

type Suggestion = {
  company_id?: string | number;
  company_name: string;
  domain?: string | null;
};

export default function AutocompleteInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Search by company name or alias (e.g., UPS, Maersk)…",
  minChars = 2,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  minChars?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const debouncedQ = useDebounce(value, 300);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // load suggestions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = (debouncedQ || "").trim();
      if (disabled || q.length < minChars) {
        setLoading(false);
        setItems([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      setOpen(true); // show the dropdown immediately with a loading state
      try {
        const result = await searchCompaniesApi({
          q,
          pageSize: 6,
          limit: 6,
          // keep filters empty for suggestion speed
          offset: 0,
        });
        if (cancelled) return;
        const rows = Array.isArray(result?.rows)
          ? result.rows
          : (Array.isArray(result?.items) ? result.items : []);
        const mapped: Suggestion[] = rows
          .map((r: any) => ({
            company_id: r?.company_id ?? r?.id,
            company_name: String(r?.company_name ?? r?.name ?? "").trim(),
            domain: r?.domain ?? null,
          }))
          .filter((r: Suggestion) => r.company_name);
        setItems(mapped);
        // Keep open only if we have results
        setOpen(mapped.length > 0);
      } catch {
        if (!cancelled) {
          setItems([]);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, minChars, disabled]);

  // close on outside click / escape
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setOpen(false);
            onSubmit();
          }
        }}
        placeholder={placeholder}
        className="flex w-full border border-input bg-transparent px-3 py-1 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pl-9 h-12 text-base rounded-lg"
        data-test="search-input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
      />

      {/* dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
          role="listbox"
        >
          <div className="px-3 py-2 text-xs font-medium text-gray-600">
            {loading ? "Loading…" : "Live suggestions"}
          </div>
          <div className="border-t border-gray-100" />
          {
            <ul className="max-h-72 overflow-auto">
              {items.map((s, idx) => (
                <li
                  key={`${s.company_id ?? idx}-${s.company_name}`}
                  className="px-3 py-3 text-sm cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    onChange(s.company_name);
                    setOpen(false);
                  }}
                >
                  <div className="font-medium text-gray-900">{s.company_name}</div>
                  {s.domain ? (
                    <div className="text-xs text-gray-500">{s.domain}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          }
        </div>
      )}
    </div>
  );
}
