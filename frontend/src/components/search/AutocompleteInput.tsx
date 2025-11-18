import React, { useEffect, useMemo, useRef, useState } from "react";
import { iySearchShippers } from "@/lib/iy";

type Props = {
  onSelect?: (row: { id: string; name: string; country?: string }) => void;
  placeholder?: string;
};

export default function AutocompleteInput({
  onSelect,
  placeholder = "Search by company name or alias (e.g., UPS, Maersk)…",
}: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Array<{ id: string; name: string; country?: string }>>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const debounced = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!debounced) {
        setRows([]);
        return;
      }
      setLoading(true);
      const r = await iySearchShippers(debounced, 1);
      setLoading(false);
      if (!alive) return;

      if (!r.ok) {
        // CF challenge or plan gate → show empty suggestions without breaking
        setRows([]);
        setOpen(true);
        return;
      }
      const data: any = r.data;
      const arr = Array.isArray(data?.results || data) ? (data.results || data) : [];
      const mapped = arr.map((it: any) => ({
        id: String(it.id ?? it.company_id ?? it.slug ?? it.name ?? crypto.randomUUID()),
        name: String(it.name ?? it.company_name ?? it.slug ?? "Unknown"),
        country: it.country || it.country_code,
      }));
      setRows(mapped);
      setOpen(true);
    }
    const t = setTimeout(run, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [debounced]);

  return (
    <div className="relative" ref={boxRef}>
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => rows.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && rows[0]) {
            onSelect?.(rows[0]);
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow">
          {loading && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
          {!loading && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">No results yet or temporarily blocked. Try again soon.</div>
          )}
          {!loading && rows.map((r) => (
            <button
              key={r.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => { onSelect?.(r); setOpen(false); }}
            >
              <div className="font-medium">{r.name}</div>
              {r.country && <div className="text-xs text-slate-500">{r.country}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
