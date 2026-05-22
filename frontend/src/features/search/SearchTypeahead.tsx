// SearchTypeahead — dropdown overlay for /app/search.
//
// Renders absolutely beneath the search input. Fires a debounced
// (250ms) lookup against lit_company_index for company_name prefix
// matches. Click any row OR Enter on a selected row navigates to
// /app/companies/{id} — bypasses the full searchShippers call.
//
// Fallback row at the bottom: "Press Enter to search all results for
// 'q'" routes to the parent's existing form submission.

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

type CompanyIndexRow = {
  company_id: string;
  company_name: string;
  city: string | null;
  country: string | null;
  total_shipments: number | null;
};

type Props = {
  /** Current value of the search input (controlled by parent). */
  query: string;
  /** True when input is focused — controls whether the dropdown is shown. */
  isOpen: boolean;
  /** Fires when the user selects the fallback row (or presses Enter on no selection).
   *  Parent should run its existing handleSearch. */
  onFallbackSubmit: () => void;
  /** Fires when the dropdown should close (Esc key, blur). */
  onClose: () => void;
};

export default function SearchTypeahead({
  query,
  isOpen,
  onFallbackSubmit,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = React.useState<CompanyIndexRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const trimmed = query.trim();
  const showDropdown = isOpen && trimmed.length >= 2;

  // Debounced lookup. 250ms feels snappy without flooding the DB on
  // every keystroke. lit_company_index has a GIN trigram index on
  // company_name so ILIKE 'prefix%' returns in <50ms.
  React.useEffect(() => {
    if (trimmed.length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from("lit_company_index")
        .select("company_id, company_name, city, country, total_shipments")
        .ilike("company_name", `${trimmed}%`)
        .order("total_shipments", { ascending: false, nullsFirst: false })
        .limit(6);
      if (!error && data) setRows(data as CompanyIndexRow[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [trimmed]);

  // Reset selection when results change.
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [rows.length]);

  // Keyboard nav: ↑/↓ to move, Enter to select, Esc to close.
  // Bound at the window level since the parent's <input> already owns focus.
  React.useEffect(() => {
    if (!showDropdown) return;
    const totalItems = rows.length + 1; // +1 for the fallback row
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % totalItems);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + totalItems) % totalItems);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex < rows.length) {
          navigate(`/app/companies/${rows[selectedIndex].company_id}`);
        } else {
          onFallbackSubmit();
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showDropdown, rows, selectedIndex, navigate, onFallbackSubmit, onClose]);

  if (!showDropdown) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
      {loading && rows.length === 0 && (
        <div className="px-4 py-3 text-xs text-ink-500">Searching…</div>
      )}
      {!loading && rows.length === 0 && (
        <div className="px-4 py-3 text-xs text-ink-500">
          No matches yet. Keep typing or press Enter to search markets.
        </div>
      )}
      <ul role="listbox" className="max-h-[400px] overflow-y-auto">
        {rows.map((r, i) => {
          const meta = [
            r.city || r.country,
            r.total_shipments
              ? `${r.total_shipments.toLocaleString()} shipments`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const selected = i === selectedIndex;
          return (
            <li
              key={r.company_id}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => navigate(`/app/companies/${r.company_id}`)}
              className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition ${
                selected ? "bg-blue-50" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                <Building2 size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-semibold text-ink-900 truncate">
                  {r.company_name}
                </div>
                {meta && (
                  <div className="font-body text-xs text-ink-500 truncate">
                    {meta}
                  </div>
                )}
              </div>
              <ArrowUpRight size={16} className="ml-auto mt-1 text-slate-400" />
            </li>
          );
        })}
        {rows.length > 0 && (
          <li
            role="option"
            aria-selected={selectedIndex === rows.length}
            onMouseEnter={() => setSelectedIndex(rows.length)}
            onClick={onFallbackSubmit}
            className={`flex cursor-pointer items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-xs italic transition ${
              selectedIndex === rows.length
                ? "bg-blue-50 text-ink-900"
                : "text-ink-500 hover:bg-slate-50"
            }`}
          >
            <span className="text-slate-400">↓</span>
            Press Enter to search all results for "{trimmed}"
          </li>
        )}
      </ul>
    </div>
  );
}
