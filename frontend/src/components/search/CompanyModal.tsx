import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { getCompanyShipmentsUnified } from '@/lib/api';

type Company = { company_id?: string | null; company_name?: string };
type ModalProps = { company: Company | null; open: boolean; onClose: (open: boolean) => void };

export default function CompanyModal({ company, open, onClose }: ModalProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cid = company?.company_id || undefined;
  const cname = company?.company_name || undefined;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !company) return;
      setLoading(true); setError(null);
      try {
        const { rows } = await getCompanyShipmentsUnified({ company_id: cid, company_name: cid ? undefined : cname, limit: 50, offset: 0 });
        if (!cancelled) setRows(Array.isArray(rows) ? rows : []);
      } catch (e: any) {
        if (!cancelled) { setRows([]); setError('Failed to load shipments'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, cid, cname, company]);

  if (!open || !company) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-5 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold text-gray-900 truncate" title={company?.company_name || 'Company'}>
                {company?.company_name || 'Company'}
              </DialogTitle>
              <div className="mt-1 text-xs text-gray-600">ID: {company?.company_id || '—'}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onClose(false)} aria-label="Close" className="rounded-full">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-5">
          {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
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
                    const d = (r as any)?.date?.value || (r as any)?.shipment_date?.value || (r as any)?.shipped_on || null;
                    const mode = (r as any)?.mode || (r as any)?.transport_mode || '—';
                    const origin = (r as any)?.origin_city || (r as any)?.origin_country || (r as any)?.origin_port || '—';
                    const dest = (r as any)?.dest_city || (r as any)?.dest_country || (r as any)?.dest_port || '—';
                    const carrier = (r as any)?.carrier || '—';
                    const containers = (r as any)?.container_count ?? '—';
                    const teu = (r as any)?.teu ?? '—';
                    return (
                      <tr key={i} className="bg-white">
                        <td className="px-3 py-2 whitespace-nowrap">{d ? new Date(String(d)).toLocaleDateString() : '—'}</td>
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
