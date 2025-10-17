import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Globe } from 'lucide-react';
import { getCompanyShipments } from '@/lib/api';

export default function CompanyDetailModal({ company, isOpen, onClose, onSave, user, isSaved = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const companyId = company?.company_id || company?.id || null;
  const name = company?.company_name || company?.name || 'Company';
  const website = company?.website || company?.domain || null;

  useEffect(() => {
    let abort = false;
    async function load() {
      if (!isOpen || !companyId) return;
      setLoading(true);
      setError('');
      try {
        const res = await getCompanyShipments({ company_id: String(companyId), limit: 50, offset: 0 });
        if (!abort) setRows(Array.isArray(res?.rows) ? res.rows : []);
      } catch (e) {
        if (!abort) {
          setRows([]);
          setError('Failed to load shipments.');
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => { abort = true; };
  }, [isOpen, companyId]);

  if (!isOpen || !company) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 md:rounded-2xl rounded-none md:inset-auto inset-0">
        <DialogHeader className="p-5 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold text-gray-900 truncate" title={name}>{name}</DialogTitle>
              <div className="mt-1 text-xs text-gray-600 truncate">ID: {String(companyId)}</div>
              {website && (
                <div className="mt-1 flex items-center gap-1.5 text-sm text-blue-600">
                  <Globe className="w-4 h-4" />
                  <a href={`https://${String(website).replace(/^https?:\/\//,'')}`} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                    {String(website)}
                  </a>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-full">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-5">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          )}
          <div className="mb-3 text-sm text-gray-700">Recent shipments</div>
          <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
            {loading ? (
              <div className="p-6 text-sm text-gray-500">Loading shipments…</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No shipment data available.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Mode</th>
                    <th className="px-3 py-2 text-left font-medium">Origin</th>
                    <th className="px-3 py-2 text-left font-medium">Destination</th>
                    <th className="px-3 py-2 text-left font-medium">Carrier</th>
                    <th className="px-3 py-2 text-right font-medium">Containers</th>
                    <th className="px-3 py-2 text-right font-medium">TEUs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => {
                    const d = r.shipped_on || r.date || r.snapshot_date || r.shipment_date || null;
                    const mode = r.mode || r.transport_mode || '—';
                    const origin = r.origin || r.origin_city || r.origin_country || r.origin_port || '—';
                    const dest = r.destination || r.dest_city || r.dest_country || r.dest_port || '—';
                    const carrier = r.carrier_name || r.carrier || '—';
                    const containers = r.container_count ?? '—';
                    const teu = r.teu ?? '—';
                    return (
                      <tr key={i} className="bg-white">
                        <td className="px-3 py-2 whitespace-nowrap">{d ? new Date(d).toLocaleDateString() : '—'}</td>
                        <td className="px-3 py-2 capitalize">{String(mode).toLowerCase()}</td>
                        <td className="px-3 py-2">{origin}</td>
                        <td className="px-3 py-2">{dest}</td>
                        <td className="px-3 py-2">{carrier}</td>
                        <td className="px-3 py-2 text-right">{typeof containers === 'number' ? containers.toLocaleString() : containers}</td>
                        <td className="px-3 py-2 text-right">{typeof teu === 'number' ? teu.toLocaleString() : teu}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
