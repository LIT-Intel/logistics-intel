import React, { useEffect, useState } from 'react';
import type { SearchRow } from '@/lib/types';
import { buildCompanyShipmentsUrl } from '@/lib/api';

export default function CompanyModal({
  company,
  shipmentsUrl, // initial (not strictly needed since we rebuild with canonical id)
  onClose,
}: {
  company: SearchRow;
  shipmentsUrl?: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = buildCompanyShipmentsUrl(company, 50, 0);
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const d = await r.json().catch(() => ({}));
        setRows(Array.isArray(d?.rows) ? d.rows : []);
      })
      .catch((e:any) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [company?.company_id, company?.company_name]);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-5xl bg-white rounded-none sm:rounded-2xl shadow-xl flex flex-col" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-4 py-3 sm:px-5 border-b sticky top-0 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="text-base sm:text-lg font-semibold truncate">{company.company_name}</div>
          <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm">Close</button>
        </div>
        <div className="flex-1 overflow-auto p-3 sm:p-4">
          {loading ? 'Loading shipments…' : (
            error ? (
              <div className="text-sm text-rose-600">{error}</div>
            ) : rows.length ? (
              <div>
                <div className="text-sm text-slate-700 mb-2">Showing {rows.length} shipments…</div>
                <div className="overflow-auto rounded-xl border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">Mode</th>
                        <th className="text-left px-3 py-2">Origin → Dest</th>
                        <th className="text-left px-3 py-2">Carrier</th>
                        <th className="text-right px-3 py-2">Containers</th>
                        <th className="text-right px-3 py-2">Weight (kg)</th>
                        <th className="text-right px-3 py-2">Value (USD)</th>
                        <th className="text-left px-3 py-2">HS</th>
                        <th className="text-left px-3 py-2">Commodity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r:any, i:number) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{r?.shipment_date?.value || r?.date?.value || '—'}</td>
                          <td className="px-3 py-2">{r?.mode || '—'}</td>
                          <td className="px-3 py-2">
                            {(r?.origin_country || '—')} → {(r?.dest_country || '—')}
                            <div className="text-xs text-slate-500">
                              {(r?.origin_port || '—')} → {(r?.dest_port || '—')}
                            </div>
                          </td>
                          <td className="px-3 py-2">{r?.carrier || '—'}</td>
                          <td className="px-3 py-2 text-right">{r?.container_count ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{r?.gross_weight_kg ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{r?.value_usd ?? '—'}</td>
                          <td className="px-3 py-2">{r?.hs_code || '—'}</td>
                          <td className="px-3 py-2">{r?.commodity_description || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No shipments found.</div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
