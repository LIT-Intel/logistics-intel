import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { getGatewayBase } from "@/lib/env";
import { searchCompanies } from "@/lib/api/search"; // existing client util
// ^ if your search client export differs, keep the current import you have.

type Mode = "shippers" | "companies";

export default function SearchPage() {
  const didInitRef = useRef(false);
  const [mode, setMode] = useState<Mode>("shippers");
  const [keyword, setKeyword] = useState("");
  const debouncedKeyword = useDebounce(keyword, 250);

  // Initial one-time read from URL
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const qsMode = (url.searchParams.get("mode") as Mode) || "shippers";
    const qsKeyword = url.searchParams.get("keyword") || "";
    setMode(qsMode);
    setKeyword(qsKeyword);
  }, []);

  // Write URL when user changes state (after initial mount)
  useEffect(() => {
    if (typeof window === "undefined" || !didInitRef.current) return;
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    if (debouncedKeyword) url.searchParams.set("keyword", debouncedKeyword);
    else url.searchParams.delete("keyword");
    window.history.replaceState(null, "", url.toString());
  }, [mode, debouncedKeyword]);

  // Data fetch (sample: reuse your existing loader)
  const base = useMemo(() => getGatewayBase(), []);
  useEffect(() => {
    // call your existing loader here; keep UI shell stable while loading
    // Example: searchCompanies({ base, mode, keyword: debouncedKeyword, limit: 20, offset: 0 })
    // .then(setResults).catch(setError)
  }, [base, mode, debouncedKeyword]);

  // Minimal shell so first paint doesn’t jump; replace with your existing JSX
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Mode toggle (keep your styling/brand tokens) */}
      <div className="flex items-center gap-2 mb-4">
        <button
          className={`px-3 py-1 rounded-2xl ${mode === "shippers" ? "bg-black text-white" : "bg-gray-100"}`}
          onClick={() => setMode("shippers")}
        >
          Shippers
        </button>
        <button
          className={`px-3 py-1 rounded-2xl ${mode === "companies" ? "bg-black text-white" : "bg-gray-100"}`}
          onClick={() => setMode("companies")}
        >
          Companies
        </button>
        <input
          className="ml-auto w-80 rounded-xl border px-3 py-2"
          placeholder="Search keyword…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* Your KPI header + grid go here; render skeletons first to avoid flicker */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 rounded-2xl border p-4 min-h-24">KPI header (skeleton/then data)</div>
        <div className="col-span-12 rounded-2xl border p-4 min-h-64">Results grid (skeleton/then cards)</div>
      </div>
    </div>
  );
}
