import { useEffect, useState } from "react";
import { searchCompanies } from '@/lib/api';

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
};

function loadSaved() {
  try { return JSON.parse(localStorage.getItem("lit:savedCompanies") || "[]"); } catch { return []; }
}
function saveSaved(list: any[]) {
  localStorage.setItem("lit:savedCompanies", JSON.stringify(list));
}
function setSelected(company_id: string | null, name: string, domain?: string | null) {
  localStorage.setItem("lit:selectedCompany", JSON.stringify({ company_id, name, domain: domain ?? null }));
}

export default function AddCompanyModal({ open, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<"LIT"|"MANUAL">("LIT");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LitRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!open) { setRows(null); setQ(""); setError(null); } }, [open]);

  async function runLitSearch() {
    setLoading(true); setError(null); setRows(null);
    try {
      const result = await searchCompanies({ q: q || null, limit: 10, offset: 0 });
      setRows(Array.isArray(result?.rows) ? result.rows : (Array.isArray(result?.items) ? result.items : []));
    } catch (e:any) {
      setError(e?.message || "Search failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function saveRow(row: LitRow) {
    const entry = { company_id: row.company_id, name: row.company_name, domain: null, source: "LIT", ts: Date.now() };
    const next = [entry, ...loadSaved().filter((x:any)=>x.company_id!==row.company_id)];
    saveSaved(next);
    setSelected(row.company_id, row.company_name, null);
    onSaved?.({ company_id: row.company_id, name: row.company_name, domain: null });
    onClose();
    // simplest hydration; we’ll refine later
    window.location.reload();
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
                {error && <div className="text-sm text-red-600">Error: {error}</div>}
                {rows===null && !loading && <div className="text-sm text-gray-500">Enter a query to search.</div>}
                {rows?.length===0 && !loading && <div className="text-sm text-gray-500">No results.</div>}

                {rows?.map((row)=> (
                  <div key={`${row.company_id}-${row.company_name}`} className="rounded-xl border p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{row.company_name}</div>
                      <div className="text-xs text-gray-500">
                        Shipments(12m): {row.shipments_12m ?? "—"} • Top lane:
                        {" "}{row.top_routes?.[0]?.origin_country ?? "—"} → {row.top_routes?.[0]?.dest_country ?? "—"}
                      </div>
                    </div>
                    <button className="px-3 py-1.5 text-sm rounded-lg border" onClick={()=>saveRow(row)}>Save</button>
                  </div>
                ))}
              </div>
            </>
          )}

          

          {tab === "MANUAL" && (
            <ManualAdd onSaved={(payload)=>{ onSaved?.(payload); onClose(); window.location.reload(); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function ManualAdd({ onSaved }:{ onSaved:(p:{company_id:null; name:string; domain?:string|null})=>void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");

  function submit() {
    if (!name.trim()) return;
    const entry = { company_id: null, name: name.trim(), domain: domain.trim() || null, source: "MANUAL", ts: Date.now() };
    const next = [entry, ...loadSaved()];
    saveSaved(next);
    setSelected(null, entry.name, entry.domain ?? null);
    onSaved({ company_id: null, name: entry.name, domain: entry.domain ?? null });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Company name" value={name} onChange={(e)=>setName(e.target.value)} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Domain (optional)" value={domain} onChange={(e)=>setDomain(e.target.value)} />
      </div>
      <button className="px-3 py-2 rounded-lg border text-sm" onClick={submit}>Save</button>
    </div>
  );
}
