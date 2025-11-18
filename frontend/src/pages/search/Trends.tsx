import { useEffect, useState } from "react";
import { searchCompanies } from "@/lib/api";

type TrendRow = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
};

export default function TrendsPage() {
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    searchCompanies({ q: "", limit: 20, offset: 0 })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setErr(res.message ?? "Failed to load trends");
          setRows([]);
          return;
        }
        setErr(null);
        setRows(Array.isArray(res?.rows) ? res.rows : []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to load trends");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Trends</h1>
      </div>

      {err && (
        <div className="mt-4 rounded-xl bg-red-50 text-red-700 border border-red-200 p-3 text-sm">
          {err}
        </div>
      )}

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        {rows.map((r) => (
          <div key={r.company_id} className="rounded-2xl border p-4 bg-white">
            <div className="font-semibold text-lg">{r.company_name}</div>
            <div className="text-sm text-slate-600">Shipments (12m): {r.shipments_12m ?? "—"}</div>
            <div className="text-sm text-slate-600">Last activity: {r.last_activity ?? "—"}</div>
          </div>
        ))}
      </div>

      {!err && rows.length === 0 && (
        <div className="mt-6 text-sm text-slate-500">No trend data yet.</div>
      )}
    </div>
  );
}
