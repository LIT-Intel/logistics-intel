import React, { useEffect, useState } from 'react';
import { fetchCompanyShipments } from '@/lib/api';
import { ServiceModeIcon } from '@/components/pulse/ServiceModeIcon';

type Props = {
  companyId?: string | null;
  limit?: number;
};

function formatNumber(value: unknown) {
  const num = typeof value === 'number' ? value : value == null ? null : Number(value);
  if (num == null || Number.isNaN(num)) return '—';
  return new Intl.NumberFormat().format(num);
}

function formatDate(value: unknown) {
  if (!value) return 'Unknown';
  const source = (value as any)?.value ?? value;
  const text = String(source).trim();
  if (!text || text === '-' || text.toLowerCase() === 'none' || text.toLowerCase() === 'unknown') {
    return 'Unknown';
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString();
}

function cleanLabel(value: unknown) {
  if (value == null) return 'Unknown';
  const text = String(value).trim();
  if (!text) return 'Unknown';
  const lowered = text.toLowerCase();
  return lowered === 'none' || lowered === 'unknown' || text === '-' ? 'Unknown' : text;
}

function cleanCarrier(value: unknown) {
  if (value == null) return 'Unknown';
  const text = String(value).trim();
  if (!text || text === '-' || text === '—') return 'Unknown';
  const lowered = text.toLowerCase();
  return lowered === 'none' || lowered === 'unknown' ? 'Unknown' : text;
}

export default function CompanyShipmentsPanel({ companyId, limit = 50 }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId || !companyId.trim()) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetchCompanyShipments(companyId, { limit, offset: 0 })
      .then((data) => {
        if (cancelled) return;
        const items = (data?.rows || data?.items || data?.shipments || []) as any[];
        setRows(Array.isArray(items) ? items : []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setRows([]);
          setError(err?.message || 'Failed to load shipments');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, limit]);

  if (!companyId) {
    return <span className="text-sm text-slate-500">Select a company to view shipments.</span>;
  }

  if (loading) {
    return <span className="text-sm text-slate-500">Loading shipments…</span>;
  }

  if (error) {
    return <span className="text-sm text-rose-600">{error}</span>;
  }

  if (!rows.length) {
    return <span className="text-sm text-slate-500">No shipments found.</span>;
  }

  return (
    <div className="overflow-auto rounded-xl border">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Service</th>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">BOL</th>
            <th className="px-3 py-2 text-left">MBL</th>
            <th className="px-3 py-2 text-left">HS</th>
            <th className="px-3 py-2 text-right">TEU</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-left">Origin Port</th>
            <th className="px-3 py-2 text-left">POD</th>
            <th className="px-3 py-2 text-left">Final Dest</th>
            <th className="px-3 py-2 text-left">Arrival</th>
            <th className="px-3 py-2 text-left">Shipper</th>
            <th className="px-3 py-2 text-left">Consignee</th>
            <th className="px-3 py-2 text-right">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => {
            const destCity = row.dest_city || row.destination_city;
            const destCountry = row.dest_country_code || row.dest_country;
            const finalDest = destCity
              ? `${destCity}${destCountry ? `, ${destCountry}` : ''}`
              : '—';
            const cost = row.shipping_cost_usd ?? row.value_usd;
            return (
              <tr key={`${row.shipment_id || row.id || index}-${index}`} className="bg-white">
                <td className="px-3 py-2 text-slate-700"><ServiceModeIcon shipment={row} /></td>
                <td className="px-3 py-2 text-slate-700">{formatDate(row.shipped_on ?? row.date)}</td>
                <td className="px-3 py-2 text-slate-700">{cleanLabel(row.bol)}</td>
                <td className="px-3 py-2 text-slate-600">{cleanLabel(row.mbl)}</td>
                <td className="px-3 py-2 text-slate-600">{cleanLabel(row.hs_code)}</td>
                <td className="px-3 py-2 text-right text-slate-800">{formatNumber(row.teu)}</td>
                <td className="px-3 py-2 text-right text-slate-800">{formatNumber(row.qty)}</td>
                <td className="px-3 py-2 text-slate-600">{cleanLabel(row.origin_port || row.origin || row.origin_country)}</td>
                <td className="px-3 py-2 text-slate-600">{cleanLabel(row.destination_port || row.destination || row.dest_country)}</td>
                <td className="px-3 py-2 text-slate-600">{finalDest}</td>
                <td className="px-3 py-2 text-slate-600">{row.arrival_date ? new Date(row.arrival_date).toLocaleDateString('en-US') : '—'}</td>
                <td className="px-3 py-2 text-slate-600">{cleanLabel(row.shipper_name || row.shipper)}</td>
                <td className="px-3 py-2 text-slate-600">{cleanLabel(row.consignee_name || row.consignee || row.carrier)}</td>
                <td className="px-3 py-2 text-right text-slate-800">{formatNumber(cost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
