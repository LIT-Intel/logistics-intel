import React, { useState } from "react";

type Mode = "shippers" | "companies";

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>("shippers");
  const [q, setQ] = useState("");

  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-24">
      <header className="pt-8 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Search</h1>
        <p className="text-sm text-slate-500">UI placeholder to verify toggle renders without flicker.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <div className="inline-flex rounded-2xl border border-slate-200 p-0.5">
          <button
            onClick={() => setMode("shippers")}
            className={`px-3 py-1.5 text-sm rounded-2xl ${mode === "shippers" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            aria-pressed={mode === "shippers"}
          >
            Shippers
          </button>
          <button
            onClick={() => setMode("companies")}
            className={`px-3 py-1.5 text-sm rounded-2xl ${mode === "companies" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            aria-pressed={mode === "companies"}
          >
            Companies
          </button>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by company name or alias…"
          className="w-full sm:w-80 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="text-xs text-slate-500">
        Mode: <b>{mode}</b> · Query: <b>{q || "—"}</b>
      </div>
    </div>
  );
}
