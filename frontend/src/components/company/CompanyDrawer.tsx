import React, { useEffect, useMemo, useState } from 'react';
import { iyFetchCompanyBols } from '@/lib/api';
import { CompanyLite, ShipmentLite } from '@/types/importyeti';

const formatNumber = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat().format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

interface Props {
  company: CompanyLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CompanyDrawer({ company, open, onOpenChange }: Props) {
  const isOpen = Boolean(open && company);
  const [shipments, setShipments] = useState<ShipmentLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !company || company.source !== 'importyeti') {
      setShipments([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const key = company.company_id.startsWith('company/') ? company.company_id : `company/${company.company_id}`;
    iyFetchCompanyBols({ companyKey: key, limit: 20, offset: 0 })
      .then((rows) => {
        if (cancelled) return;
        setShipments(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to fetch shipments');
        setShipments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company, isOpen]);

  const supplierList = useMemo(() => {
    if (!company?.extras?.top_suppliers?.length) return '—';
    return company.extras.top_suppliers.join(', ');
  }, [company]);

  if (!isOpen || !company) return null;

  const isImportYeti = company.source === 'importyeti';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="absolute right-0 top-0 h-full w-full overflow-auto bg-white shadow-2xl md:w-[680px]">
        <div className="flex items-start justify-between border-b px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{company.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">Source: {isImportYeti ? 'ImportYeti' : company.source.toUpperCase()}</span>
              {company.country_code && <span>{company.country_code}</span>}
              {company.address && <span>{company.address}</span>}
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section className="grid grid-cols-2 gap-3">
            <Stat label="Shipments (12m)" value={formatNumber(company.kpis.shipments_12m)} />
            <Stat label="Last activity" value={formatDate(company.kpis.last_activity)} />
            <Stat label="Top suppliers" value={supplierList} spanFull />
          </section>

          {!isImportYeti && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              ImportYeti shipment data is only available for Shippers. Save this company and check back once Lusha is live.
            </div>
          )}

          {isImportYeti && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Recent Shipments</h3>
                {loading && <span className="text-xs text-slate-500">Loading…</span>}
              </div>
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>
              )}
              {!error && (
                <div className="overflow-auto rounded-xl border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">BOL</th>
                        <th className="px-3 py-2 text-left">MBL</th>
                        <th className="px-3 py-2 text-left">HS Code</th>
                        <th className="px-3 py-2 text-right">TEU</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-left">Unit</th>
                        <th className="px-3 py-2 text-left">Shipper</th>
                        <th className="px-3 py-2 text-left">Consignee</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Cost (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shipments.map((row, index) => (
                        <tr key={`${row.bol}-${index}`} className="bg-white">
                          <td className="px-3 py-2 text-slate-700">{formatDate(row.date)}</td>
                          <td className="px-3 py-2 text-slate-700">{row.bol || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.mbl || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.hs_code || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-800">{formatNumber(row.teu ?? null)}</td>
                          <td className="px-3 py-2 text-right text-slate-800">{formatNumber(row.qty ?? null)}</td>
                          <td className="px-3 py-2 text-slate-600">{row.qty_unit || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.shipper_name || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.consignee_name || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.description || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-800">{formatNumber(row.shipping_cost_usd ?? null)}</td>
                        </tr>
                      ))}
                      {!shipments.length && !loading && (
                        <tr>
                          <td colSpan={11} className="px-3 py-6 text-center text-sm text-slate-500">No shipments found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, spanFull = false }: { label: string; value: string; spanFull?: boolean }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 ${spanFull ? 'col-span-2' : ''}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 break-words">{value}</div>
    </div>
  );
}
