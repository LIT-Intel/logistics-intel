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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">{company.company_name}</div>
          <button onClick={onClose} className="rounded-lg border px-3 py-1.5">Close</button>
        </div>
        <div className="mt-3">
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
