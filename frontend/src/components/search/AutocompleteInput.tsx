import React, { useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "@/utils/debounce";

type Suggestion = { company_id: string; company_name: string; shipments_12m?: number };
const GW_DEFAULT = "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";

function findSearchButton(): HTMLButtonElement | null {
  return document.querySelector('[data-test="search-button"]') as HTMLButtonElement | null;
}
function findSearchInput(): HTMLInputElement | null {
  // Strong selectors first
  const s1 = document.querySelector('input[data-test="search-input"]') as HTMLInputElement | null;
  if (s1) return s1;
  const s2 = document.querySelector('input[name="keyword"]') as HTMLInputElement | null;
  if (s2) return s2;
  const s3 = document.querySelector('input[placeholder*="Search" i]') as HTMLInputElement | null;
  if (s3) return s3;
  // Fallback: near the button
  const btn = findSearchButton();
  const root = (btn?.closest("form") || btn?.closest("div") || document.body) as HTMLElement;
  const s4 = root.querySelector('input[type="search"], input[type="text"]') as HTMLInputElement | null;
  return s4 || null;
}

// Programmatically set value on a React-controlled input so React sees it
function setReactInputValue(input: HTMLInputElement, v: string) {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const setter = desc?.set;
  if (setter) setter.call(input, v);
  else (input.value = v);
  // Fire proper events so React updates state
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: v, inputType: "insertText" } as any));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function submitSearch(withValue: string) {
  const input = findSearchInput();
  if (input) setReactInputValue(input, withValue);

  // Prefer form submission (works with form handlers)
  const form = input?.closest("form") as HTMLFormElement | null;
  if (form && typeof (form as any).requestSubmit === "function") {
    (form as any).requestSubmit();
    return;
  }

  // Fallback to clicking the existing Search button
  const b = findSearchButton();
  if (b) b.click();
}

export default function AutocompleteInput({
  minChars = 2,
  placeholder = "Search companies…",
}: { minChars?: number; placeholder?: string; }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const API_BASE = (import.meta as any).env?.VITE_LIT_GATEWAY_BASE || GW_DEFAULT;

  const suggest = useMemo(() => debounce(async (query: string) => {
    if (!query || query.length < minChars) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const body = { keyword: query, limit: 6, offset: 0 };

      // Try proxy first (local / server), then gateway (prod-safe)
      let r = await fetch("/api/lit/public/searchCompanies", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) {
        r = await fetch(`${String(API_BASE).replace(/\/$/, "")}/public/searchCompanies`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        });
      }
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setSuggestions((data?.rows || data?.results || []).slice(0, 6));
      setOpen(true);
    } catch (e) {
      console.error("suggest error:", e);
      setSuggestions([]); setOpen(false);
    } finally {
      setLoading(false);
    }
  }, 250), [API_BASE, minChars]);

  useEffect(() => { suggest(q); }, [q, suggest]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current) return; if (!ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); const v = q.trim(); if (v) { setOpen(false); submitSearch(v); } }
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder={placeholder}
      />
      {open && (loading || suggestions.length > 0) && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>}
          {!loading && suggestions.map((s) => (
            <button
              key={s.company_id}
              onClick={() => { setQ(s.company_name); setOpen(false); submitSearch(s.company_name); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
            >
              <div className="truncate">
                <div className="text-sm font-medium text-gray-900 truncate">{s.company_name}</div>
                {typeof s.shipments_12m === "number" && (
                  <div className="text-xs text-gray-500">{s.shipments_12m} shipments (12m)</div>
                )}
              </div>
              <span className="text-[10px] text-gray-400">Enter ↵</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
