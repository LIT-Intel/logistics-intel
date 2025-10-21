import React, { useEffect, useRef, useState } from "react";

type Suggestion = { id: string; name: string; website?: string | null };

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: Suggestion) => void;
  // optional: falls back to local list if this fails or is omitted
  fetchSuggestions?: (q: string) => Promise<Suggestion[]>;
  placeholder?: string;
  minChars?: number;
};

const LOCAL = ["Dole", "Del Monte", "Maersk", "MSC", "CMA CGM", "Tesla", "UPS", "Walmart", "Target", "Amazon"];

export default function AutocompleteInput({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder = "Search by company name… [AC HARD TEST]",
  minChars = 1,
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  async function load(q: string) {
    const qq = (q || "").trim();
    if (qq.length < minChars) {
      setItems([]); setOpen(false); return;
    }
    if (fetchSuggestions) {
      try {
        const rows = await fetchSuggestions(qq);
        if (Array.isArray(rows) && rows.length) {
          setItems(rows); setOpen(true); return;
        }
      } catch (_) { /* fall through */ }
    }
    const rows = LOCAL
      .filter(n => n.toLowerCase().includes(qq.toLowerCase()))
      .slice(0, 8)
      .map((name, i) => ({ id: String(i+1), name, website: null }));
    setItems(rows); setOpen(true);
  }

  useEffect(() => { load(value); }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function choose(i: number) {
    const s = items[i];
    if (!s) return;
    onSelect(s);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h+1, items.length-1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h-1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(highlight); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (items.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full pl-4 pr-12 py-3 text-base md:text-lg bg-white border border-blue-300 ring-2 ring-blue-400 rounded-xl"
        data-test="ac-hard"
      />
      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-white border rounded-xl shadow-xl z-50 max-h-72 overflow-auto">
          {items.map((s, i) => (
            <button
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); choose(i); }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-2 ${i === highlight ? "bg-blue-50" : ""}`}
            >
              <div className="text-sm font-medium">{s.name}</div>
              {s.website ? <div className="text-xs text-gray-500 truncate">{s.website}</div> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
