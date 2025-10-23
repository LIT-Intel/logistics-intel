import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ClipboardList, Clock, MapPin, BarChart2 } from 'lucide-react';
import { getCompanyShipments } from '@/lib/api'; // assume exists
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
  const website = company.website || company.domain || null;
  const hqText = [company.hq_city, company.hq_state].filter(Boolean).join(', ');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto rounded-xl bg-white">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle className="text-2xl font-bold">{name}</DialogTitle>
              {hqText && <p className="text-sm text-gray-500">HQ: {hqText}</p>}
              {website && (
                <a href={`https://${website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline">
                  {website}
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onSave?.(company)} disabled={isSaved}>
                {isSaved ? 'Saved' : 'Save to Command Center'}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="w-5 h-5 text-gray-500" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* KPI Summary */}
        <div className="grid grid-cols-4 gap-4 text-sm text-gray-700 mt-4 mb-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#7F3DFF]" />
            <span>{shipments.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            <span>{company.last_activity || '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-500" />
            <span>{hqText || '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-gray-500" />
            <span>{company.growth_rate != null ? `${Math.round(company.growth_rate * 100)}%` : '—'}</span>
          </div>
        </div>

        {/* Tabs / Details */}
        <div className="tabs-container"> {/* placeholder for actual tabs UI */}
          {/* Tab nav & content would go here */}
          <p className="text-gray-500 text-sm">Additional company insights and shipment summary will appear here once wired.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
