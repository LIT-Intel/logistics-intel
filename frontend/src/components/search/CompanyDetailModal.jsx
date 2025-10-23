import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, BookOpen, Clock, MapPin, BarChart2 } from 'lucide-react';
import { getCompanyShipments } from '@/lib/api';
import { hasFeature } from '@/lib/access';

export default function CompanyDetailModal({ company, isOpen, onClose, onSave, user, isSaved = false }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const companyId = company?.company_id || company?.id;

  useEffect(() => {
    if (!isOpen || !companyId) return;
    setLoading(true);
    getCompanyShipments({ company_id: String(companyId), limit: 1000, offset: 0 })
      .then(res => setShipments(res.rows || []))
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, [isOpen, companyId]);

  if (!isOpen || !company) return null;

  const name = company.company_name || company.name || 'Company';
  const aliasOrId = company.alias || company.company_id || '';
  const website = company.website || company.domain || null;
  const hqText = [company.hq_city, company.hq_state].filter(Boolean).join(', ');
  const growth = company.growth_rate != null ? `${Math.round(company.growth_rate * 100)}%` : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      {/* Overlay handled by parent Dialog */}
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto rounded-xl bg-white">
        {/* Header */}
        <DialogHeader className="flex justify-between items-center p-6">
          <div>
            <DialogTitle className="text-2xl font-bold">{name}</DialogTitle>
            {aliasOrId && <p className="text-sm text-gray-500">ID: {aliasOrId}</p>}
          </div>
          <div className="flex gap-2 items-center">
            <Button
              size="sm"
              className={isSaved ? "bg-green-500 text-white px-3 py-1 rounded-full" : "bg-[#7F3DFF] text-white px-3 py-1 rounded-full"}
              onClick={() => onSave && onSave(company)}
            >
              {isSaved ? "Saved" : "Save to Command Center"}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="w-5 h-5 text-gray-500 hover:text-gray-700" />
            </Button>
          </div>
        </DialogHeader>

        {/* KPI Summary */}
        <div className="grid grid-cols-4 gap-4 p-6 text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#7F3DFF]" />
            <span>{shipments.length > 0 ? shipments.length : <span className="text-gray-400">—</span>}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            <span>{company.last_activity || <span className="text-gray-400">—</span>}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-500" />
            <span>{hqText || <span className="text-gray-400">—</span>}</span>
          </div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-gray-500" />
            <span>{growth || <span className="text-gray-400">—</span>}</span>
          </div>
        </div>

        {/* Chart Area */}
        <div className="border border-gray-200 bg-white p-6 m-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">12‑Month Shipment Volume</h4>
          <div className="h-[150px] w-full bg-gray-50 flex items-end space-x-1">
            {/* Insert bar chart logic here */}
            {(() => {
              const volumes = []; /* logic to compute */
              const max = volumes.length ? Math.max(...volumes) : 1;
              return volumes.map((v,i) => (
                <div key={i} style={{ height: `${(v/max)*150}px`, width: '20px', backgroundColor: i === volumes.length-1 ? '#7F3DFF' : '#A97EFF' }} />
              ));
            })()}
          </div>
        </div>

        {/* Tabs */}
        <div className="p-6">
          <div className="flex border-b border-gray-200">
            <button className="px-4 py-2 text-[#7F3DFF] border-b-2 border-[#7F3DFF]">Overview</button>
            <button className="px-4 py-2 text-gray-500">Shipments</button>
            <button className="px-4 py-2 text-gray-500">Contacts</button>
          </div>
          <div className="mt-4">
            {/* Content for the selected tab */}
            <p className="text-gray-500 text-sm">Detailed insights will display here once wired.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
