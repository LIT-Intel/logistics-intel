import React, { useEffect, useMemo, useState } from 'react';
import { fetchCompanyLanes } from '@/lib/api';

export default function CompanyLanesPanel({ company, month: initialMonth, origin: initialOrigin, dest: initialDest }: { company: string; month?: string; origin?: string; dest?: string; }) {
  const [month, setMonth] = useState<string>(initialMonth || '');
  const [origin, setOrigin] = useState<string>(initialOrigin || '');
  const [dest, setDest] = useState<string>(initialDest || '');
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(() => `${company}|${month}|${origin}|${dest}`, [company, month, origin, dest]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!company || !company.trim()) { setRows([]); return; }
      setLoading(true); setError(null);
      try {
        const data = await fetchCompanyLanes({ company, month: month || undefined, origin: origin || undefined, dest: dest || undefined, limit: 10 });
        const items = (data?.items || data?.rows || data?.lanes || []) as any[];
        if (!cancelled) setRows(items);
      } catch (e: any) {
        if (!cancelled) { setRows([]); setError(e?.message || 'Failed to load lanes'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key, company, month, origin, dest]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-3">
        <div>
          <div className="text-xs text-gray-600 mb-1">Month</div>
          <input type="month" value={month ? month.slice(0,7) : ''} onChange={(e)=> setMonth(e.target.value ? `${e.target.value}-01` : '')} className="border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <div className="text-xs text-gray-600 mb-1">Origin</div>
          <input value={origin} onChange={(e)=> setOrigin(e.target.value)} placeholder="e.g., CN" className="border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <div className="text-xs text-gray-600 mb-1">Destination</div>
          <input value={dest} onChange={(e)=> setDest(e.target.value)} placeholder="e.g., US" className="border rounded px-3 py-2 text-sm" />
        </div>
        <div className="text-sm text-gray-600 sm:ml-auto">Top 10 lanes</div>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading lanes…</div>}
      {error && <div className="text-sm text-red-600">Error: {error}</div>}
      {!loading && !error && (rows?.length ? (
        <div className="overflow-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Origin</Th>
                <Th>Destination</Th>
                <Th className="text-right">Shipments</Th>
                <Th className="text-right">TEU</Th>
                <Th className="text-right">Value (USD)</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="bg-white">
                  <Td>{r.origin_label || r.origin || r.origin_country || '—'}</Td>
                  <Td>{r.dest_label || r.dest || r.dest_country || '—'}</Td>
                  <Td className="text-right">{num(r.shipments ?? r.count)}</Td>
                  <Td className="text-right">{num(r.teu)}</Td>
                  <Td className="text-right">{currency(r.value_usd)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-gray-500">No lanes for selected month.</div>
      ))}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
function num(n: any) {
  const v = typeof n === 'number' ? n : (n == null ? null : Number(n));
  return v == null || Number.isNaN(v) ? '—' : new Intl.NumberFormat().format(v);
}
function currency(n: any) {
  const v = typeof n === 'number' ? n : (n == null ? null : Number(n));
  return v == null || Number.isNaN(v) ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}
