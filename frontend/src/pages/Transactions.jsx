import React, { useEffect, useState } from 'react';
import { Shipment, Company } from '@/api/entities';
import { Eye, ExternalLink, Ship, Plane, Truck, CheckCircle, Clock } from 'lucide-react';

function modePill(mode) {
  const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  if (mode === 'ocean') return { cls: base + ' bg-blue-100 text-blue-800', icon: Ship };
  if (mode === 'air') return { cls: base + ' bg-purple-100 text-purple-800', icon: Plane };
  if (mode === 'truck') return { cls: base + ' bg-green-100 text-green-800', icon: Truck };
  return { cls: base + ' bg-gray-100 text-gray-800', icon: Ship };
}

function statusPill(status) {
  const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  if (!status) return { cls: base + ' bg-gray-100 text-gray-800', icon: Clock };
  const s = String(status).toLowerCase();
  if (s.includes('delivered') || s.includes('complete')) return { cls: base + ' bg-green-100 text-green-800', icon: CheckCircle };
  if (s.includes('in transit')) return { cls: base + ' bg-yellow-100 text-yellow-800', icon: Clock };
  return { cls: base + ' bg-gray-100 text-gray-800', icon: Clock };
}

export default function Transactions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const shipments = await Shipment.list('-date', 250);
        const asArray = Array.isArray(shipments) ? shipments : (shipments?.data || shipments?.items || []);
        const normalized = asArray.map((s) => ({
          id: s.id,
          company_name: s.company_name || s.buyer_name || '—',
          route: s.route || [s.origin, s.destination].filter(Boolean).join(' → '),
          mode: (s.mode || s.transport_mode || 'ocean').toLowerCase(),
          date: s.date || s.created_date,
          value: s.value_usd || s.value || 0,
          status: s.status || s.delivery_status || 'In Transit',
        }));
        if (mounted) setRows(normalized);
      } catch (e) {
        if (mounted) setError(e?.message || 'Failed to load shipments');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-red-800 font-semibold mb-1">Transaction Load Error</div>
          <div className="text-red-700 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Shipment Transactions</h1>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shipment ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((r) => {
                const m = modePill(r.mode);
                const s = statusPill(r.status);
                const ModeIcon = m.icon;
                const StatusIcon = s.icon;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">#{String(r.id).slice(0, 8)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.company_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.route || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={m.cls}><ModeIcon size={12} className="mr-1" />{String(r.mode).toUpperCase()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.value ? `$${Number(r.value).toLocaleString()}` : '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={s.cls}><StatusIcon size={12} className="mr-1" />{r.status}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-800 mr-3" title="View"><Eye size={16} /></button>
                      <button className="text-green-600 hover:text-green-800" title="Open"><ExternalLink size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

