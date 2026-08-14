// HeaderSearch — the global topbar search pill, shared by BOTH app
// chromes (layout/lit/AppHeader.jsx and components/layout/AppShell.jsx).
//
// Behavior (CEO fix 2026-08-13 — the input was previously dead):
//   - Enter            → /app/search?q=<term> (Intelligence Explorer company
//                        search, which already reads ?q= and auto-runs).
//   - Typeahead        → debounced (250ms) lookup of the user's recent SAVED
//                        companies (lit_saved_companies joined to
//                        lit_companies, name ILIKE match, most recent
//                        activity first — RLS scopes rows to the viewer +
//                        org-shared saves). Selecting a row deep-links to
//                        the company profile. A final "Search '<term>' in
//                        Explorer →" row is always present and is the
//                        default Enter target.
//   - ↑/↓              → move between saved-company rows and the Explorer row.
//   - Esc              → clears the term (or closes/blurs when already empty).
//   - X button         → clears and refocuses.
//   - Focus ring       → focus-within ring on the pill so it reads as alive.
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Building2, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

const MIN_CHARS = 2;
const MAX_ROWS = 5;

export default function HeaderSearch({
  className = "",
  placeholder = "Search companies…",
}) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  // -1 == the "Search in Explorer" fallback row. It is the default so a
  // plain Enter always behaves predictably (full Explorer search); arrow
  // keys opt into the saved-company shortcuts.
  const [active, setActive] = useState(-1);

  const trimmed = term.trim();
  const showDropdown = open && trimmed.length >= MIN_CHARS;

  // Debounced saved-company lookup. RLS on lit_saved_companies already
  // restricts rows to the viewer's own saves (+ org-shared saves when the
  // workspace toggle is on), so this doubles as a personal "recent
  // companies" jump list rather than a global index scan.
  useEffect(() => {
    if (trimmed.length < MIN_CHARS) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("lit_saved_companies")
          .select(
            "company_id, last_activity_at, company:lit_companies!inner(id, source_company_key, name, city, country_code)",
          )
          .ilike("company.name", `%${trimmed}%`)
          .order("last_activity_at", { ascending: false, nullsFirst: false })
          .limit(12);
        if (cancelled) return;
        // Dedupe by company — several org-mates may have saved the same one.
        const seen = new Set();
        const next = [];
        for (const r of (error ? [] : data) ?? []) {
          const c = r?.company;
          if (!c?.id || seen.has(c.id)) continue;
          seen.add(c.id);
          next.push({
            id: c.id,
            key: c.source_company_key || c.id,
            name: c.name || "Unknown company",
            meta: [c.city, c.country_code].filter(Boolean).join(", "),
          });
          if (next.length >= MAX_ROWS) break;
        }
        setRows(next);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmed]);

  // Reset the highlighted row whenever the term or result set changes.
  useEffect(() => {
    setActive(-1);
  }, [trimmed, rows.length]);

  // Click anywhere outside closes the dropdown.
  useEffect(() => {
    function onDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const goToExplorer = () => {
    if (!trimmed) return;
    setOpen(false);
    inputRef.current?.blur();
    navigate(`/app/search?q=${encodeURIComponent(trimmed)}`);
  };

  const goToCompany = (row) => {
    setOpen(false);
    setTerm("");
    inputRef.current?.blur();
    navigate(`/app/companies/${encodeURIComponent(row.key)}`);
  };

  const clearTerm = () => {
    setTerm("");
    setRows([]);
    setActive(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (showDropdown && active >= 0 && active < rows.length) {
        goToCompany(rows[active]);
      } else {
        goToExplorer();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (term) {
        clearTerm();
      } else {
        setOpen(false);
        inputRef.current?.blur();
      }
    } else if (event.key === "ArrowDown" && showDropdown && rows.length) {
      event.preventDefault();
      setActive((i) => (i + 1 >= rows.length ? -1 : i + 1));
    } else if (event.key === "ArrowUp" && showDropdown && rows.length) {
      event.preventDefault();
      setActive((i) => (i - 1 < -1 ? rows.length - 1 : i - 1));
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search companies"
          role="combobox"
          aria-expanded={showDropdown}
          className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
        {term ? (
          <button
            type="button"
            onClick={clearTerm}
            aria-label="Clear search"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-[80] mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.14)]">
          {loading && rows.length === 0 && (
            <div className="px-4 py-2.5 text-xs text-slate-500">Searching…</div>
          )}
          {rows.length > 0 && (
            <>
              <div className="border-b border-slate-100 px-4 pb-1.5 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Saved companies
              </div>
              <ul role="listbox">
                {rows.map((row, i) => (
                  <li
                    key={row.id}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(event) => {
                      // mousedown (not click) so the outside-click closer
                      // never races the navigation.
                      event.preventDefault();
                      goToCompany(row);
                    }}
                    className={`flex cursor-pointer items-center gap-2.5 px-4 py-2.5 transition ${
                      i === active ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                      <Building2 size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {row.name}
                      </div>
                      {row.meta ? (
                        <div className="truncate text-xs text-slate-500">
                          {row.meta}
                        </div>
                      ) : null}
                    </div>
                    <ArrowUpRight size={14} className="shrink-0 text-slate-400" />
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            onMouseEnter={() => setActive(-1)}
            onMouseDown={(event) => {
              event.preventDefault();
              goToExplorer();
            }}
            className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition ${
              rows.length > 0 ? "border-t border-slate-100" : ""
            } ${active === -1 ? "bg-blue-50 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <Search size={14} className="shrink-0 text-slate-400" />
            <span className="truncate">
              Search “{trimmed}” in Explorer
            </span>
            <ArrowUpRight size={14} className="ml-auto shrink-0 text-slate-400" />
          </button>
        </div>
      )}
    </div>
  );
}
