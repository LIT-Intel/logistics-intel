import { useEffect, useState } from "react";
import { getGatewayBase } from "@/lib/env";
import { saveCompany, isLimitExceeded } from "@/lib/saveCompany";
import { parseLimitExceeded, type LimitExceeded } from "@/lib/usage";

const API_BASE = getGatewayBase().replace(/\/$/, "") || "/api/lit";

type LitRow = {
  company_id: string | null;
  company_name: string;
  shipments_12m?: number | null;
  last_activity?: { value?: string | null } | null;
  top_routes?: { origin_country: string | null; dest_country: string | null; shipments: number | null }[] | null;
  top_carriers?: { name: string | null; share_pct: number | null }[] | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: (payload: { company_id: string | null; name: string; domain?: string | null }) => void;
  onLimitExceeded?: (payload: LimitExceeded) => void;
};

function setSelected(company_id: string | null, name: string, domain?: string | null) {
  localStorage.setItem("lit:selectedCompany", JSON.stringify({ company_id, name, domain: domain ?? null }));
}

export default function AddCompanyModal({ open, onClose, onSaved, onLimitExceeded }: Props) {
  const [tab, setTab] = useState<"LIT"|"MANUAL">("LIT");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LitRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchLocked, setSearchLocked] = useState<LimitExceeded | null>(null);

  useEffect(() => {
    if (!open) {
      setRows(null);
      setQ("");
      setError(null);
      setSearchLocked(null);
      setSavingId(null);
    }
  }, [open]);

  async function runLitSearch() {
    setLoading(true);
    setError(null);
    setRows(null);
    setSearchLocked(null);
    try {
      const r = await fetch(`${API_BASE}/public/searchCompanies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: q || null, limit: 10, offset: 0 }),
      });

      // Plan-limit gate returns 403 + LIMIT_EXCEEDED; surface to user
      // instead of swallowing into "0 results" or generic error.
      if (r.status === 403) {
        const body = await r.json().catch(() => null);
        const limit = parseLimitExceeded(body);
        if (limit) {
          setSearchLocked(limit);
          setRows(null);
          onLimitExceeded?.(limit);
          return;
        }
      }

      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setRows(data?.rows || []);
    } catch (e: any) {
      setError(e?.message || "Search failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveRow(row: LitRow) {
    const id = row.company_id || row.company_name;
    setSavingId(id);
    setError(null);
    try {
      const result = await saveCompany({
        source_company_key: row.company_id ?? row.company_name,
        company_data: {
          source: "lit",
          source_company_key: row.company_id ?? row.company_name,
          name: row.company_name,
          shipments_12m: row.shipments_12m ?? null,
        },
        stage: "prospect",
      });

      if (isLimitExceeded(result)) {
        onLimitExceeded?.(result as unknown as LimitExceeded);
        setError(result.message);
        return;
      }
      if (!result.ok) {
        setError(result.message || "Save failed");
        return;
      }

      setSelected(row.company_id, row.company_name, null);
      onSaved?.({ company_id: row.company_id, name: row.company_name, domain: null });
      onClose();
      // simplest hydration; we'll refine later
      window.location.reload();
    } finally {
      setSavingId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
      <div className="w-[860px] max-w-[95vw] rounded-2xl bg-white shadow-2xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="text-sm font-semibold">Add Company</div>
          <button onClick={onClose} className="text-sm text-gray-500">Close</button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-4 flex gap-2 border-b">
          {["LIT","MANUAL"].map((t)=>(
            <button
              key={t}
              onClick={()=>setTab(t as any)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab===t ? "border-indigo-600 text-indigo-700 font-medium" : "border-transparent text-gray-500"}`}
            >{t}</button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5">
          {tab === "LIT" && (
            <>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Search by company name…"
                  value={q}
                  onChange={(e)=>setQ(e.target.value)}
                  onKeyDown={(e)=> e.key==='Enter' && runLitSearch()}
                />
                <button onClick={runLitSearch} disabled={loading} className="px-3 py-2 rounded-lg border text-sm">
                  {loading ? "Searching…" : "Search"}
                </button>
              </div>

              <div className="mt-4 max-h-80 overflow-auto space-y-2">
                {searchLocked && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="font-semibold">You've used all your free trial search credits.</div>
                    <div className="mt-1 text-xs">
                      {searchLocked.used} / {searchLocked.limit} used.{" "}
                      <a href={searchLocked.upgrade_url || "/app/billing"} className="font-medium underline">Upgrade to continue.</a>
                    </div>
                  </div>
                )}
                {error && !searchLocked && <div className="text-sm text-red-600">Error: {error}</div>}
                {rows===null && !loading && !searchLocked && <div className="text-sm text-gray-500">Enter a query to search.</div>}
                {rows?.length===0 && !loading && !searchLocked && <div className="text-sm text-gray-500">No results.</div>}

                {rows?.map((row)=> {
                  const id = row.company_id || row.company_name;
                  const isSaving = savingId === id;
                  return (
                    <div key={`${row.company_id}-${row.company_name}`} className="rounded-xl border p-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{row.company_name}</div>
                        <div className="text-xs text-gray-500">
                          Shipments(12m): {row.shipments_12m ?? "—"} • Top lane:
                          {" "}{row.top_routes?.[0]?.origin_country ?? "—"} → {row.top_routes?.[0]?.dest_country ?? "—"}
                        </div>
                      </div>
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg border disabled:opacity-50"
                        onClick={() => saveRow(row)}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}



          {tab === "MANUAL" && (
            <ManualAdd
              onSaved={(payload) => { onSaved?.(payload); onClose(); window.location.reload(); }}
              onLimitExceeded={onLimitExceeded}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ManualAdd({
  onSaved,
  onLimitExceeded,
}: {
  onSaved: (p: { company_id: null; name: string; domain?: string | null }) => void;
  onLimitExceeded?: (payload: LimitExceeded) => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const cleanedName = name.trim();
      const cleanedDomain = domain.trim() || null;
      const result = await saveCompany({
        source_company_key: cleanedDomain || cleanedName,
        company_data: {
          source: "manual",
          source_company_key: cleanedDomain || cleanedName,
          name: cleanedName,
          domain: cleanedDomain,
        },
        stage: "prospect",
      });

      if (isLimitExceeded(result)) {
        onLimitExceeded?.(result as unknown as LimitExceeded);
        setErr(result.message);
        return;
      }
      if (!result.ok) {
        setErr(result.message || "Save failed");
        return;
      }

      setSelected(null, cleanedName, cleanedDomain);
      onSaved({ company_id: null, name: cleanedName, domain: cleanedDomain });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Domain (optional)" value={domain} onChange={(e) => setDomain(e.target.value)} />
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <button
        className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
        onClick={submit}
        disabled={busy || !name.trim()}
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
