import React, { useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "@/utils/debounce";

type Suggestion = { id: string; name: string; website?: string | null };

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: Suggestion) => void;
  fetchSuggestions: (q: string) => Promise<Suggestion[]>;
  placeholder?: string;
  minChars?: number; // default 3
};

export default function AutocompleteInput({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder = "Search by company name…",
  minChars = 3,
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const runFetch = useMemo(
    () =>
      debounce(async (q: string) => {
        const qq = q.trim();
        if (qq.length < minChars) {
          setItems([]);
          setOpen(false);
          return;
        }
        setLoading(true);
        try {
          const rows = await fetchSuggestions(qq);
          setItems(rows);
          setOpen(rows.length > 0);
          setHighlight(0);
        } catch {
          setItems([]);
          setOpen(false);
        } finally {
          setLoading(false);
        }
      }, 250),
    [fetchSuggestions, minChars]
  );

  useEffect(() => {
    runFetch(value);
  }, [value, runFetch]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = items[highlight];
      if (picked) {
        onSelect(picked);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full h-12 border border-gray-300 rounded-lg px-4 focus:ring-indigo-500 focus:border-indigo-500"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="autocomplete-listbox"
      />
      {open && (
        <div
          id="autocomplete-listbox"
          role="listbox"
          className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto"
        >
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
          )}
          {!loading &&
            items.map((s, i) => (
              <button
                key={s.id || s.name + i}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => {
                  onSelect(s);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm ${
                  i === highlight ? "bg-indigo-50" : "bg-white"
                } hover:bg-indigo-50`}
              >
                <div className="font-medium text-gray-900">{s.name}</div>
                {s.website && (
                  <div className="text-xs text-gray-500 truncate">{s.website}</div>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
