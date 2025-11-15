'use client';

import { useEffect, useState } from 'react';
import { iyCompanyBols } from '@/lib/api';
import ProGate from '@/components/ProGate';

export default function CommandCenterShipments({ companyId }: { companyId: string }) {
  const [state, setState] = useState<{ rows?: any[]; gate?: any; error?: string }>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await iyCompanyBols({ company_id: companyId, limit: 25, offset: 0 });
        if (!alive) return;
        const rows = Array.isArray(res?.rows) ? res.rows : [];
        setState({ rows });
      } catch (e: any) {
        if (!alive) return;
        if (e?.status === 402) {
          setState({ gate: e });
        } else {
          setState({
            error: e?.detail || e?.error || 'Failed to load shipments for company',
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [companyId]);

  if (state.gate) {
    return (
      <ProGate
        title="Shipments locked"
        description="BOL tables, HTS codes, routes, and 12-month charts are available on Pro. Upgrade to unlock this company’s shipment history."
        ctaText="Upgrade to Pro"
        onUpgrade={() => window.open('/pricing', '_blank')}
      />
    );
  }

  if (state.error) {
    return <div className="text-red-600">Error: {state.error}</div>;
  }

  const rows = state.rows || [];
  if (!rows.length) {
    return <div className="text-slate-500">No shipments to show.</div>;
  }

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-sm text-slate-600 mb-3">Showing {rows.length} BOLs (first page)</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2 pr-4">BOL</th>
              <th className="py-2 pr-4">Ship Date</th>
              <th className="py-2 pr-4">Origin</th>
              <th className="py-2 pr-4">Destination</th>
              <th className="py-2 pr-4">Supplier</th>
              <th className="py-2 pr-4">Product</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="py-2 pr-4">{r?.bol_number || r?.bol || '-'}</td>
                <td className="py-2 pr-4">{r?.ship_date || r?.date || '-'}</td>
                <td className="py-2 pr-4">{r?.origin_port || r?.origin || '-'}</td>
                <td className="py-2 pr-4">{r?.destination_port || r?.destination || '-'}</td>
                <td className="py-2 pr-4">{r?.supplier || r?.shipper || '-'}</td>
                <td className="py-2 pr-4">{r?.product_description || r?.product || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
