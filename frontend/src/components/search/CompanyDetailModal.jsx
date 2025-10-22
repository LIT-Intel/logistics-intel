import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, MapPin, Ship, Clock } from 'lucide-react';

export default function CompanyDetailModal({ company, isOpen, onClose }) {
  if (!isOpen || !company) return null;

  const {
    company_name,
    name,
    domain,
    hq_city,
    hq_state,
    shipments_12m,
    activity_score
  } = company;

  const displayName = company_name || name || 'Unnamed Co.';
  const location = [hq_city, hq_state].filter(Boolean).join(', ') || null;
  const shipments = shipments_12m != null ? Number(shipments_12m).toLocaleString() : null;
  const activity = activity_score != null ? `${Math.round(Number(activity_score) * 100)}%` : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>{displayName}</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4 text-sm text-gray-800">
            <div className="flex items-center gap-2">
              <Ship size={16} className="text-[#7F3DFF]" />
              <span>{shipments ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-gray-500" />
              <span>{activity ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-gray-500" />
              <span>{location ?? '—'}</span>
            </div>
          </div>

          {/* Placeholder for tabs or extended view */}
          <div className="text-gray-500 text-sm border-t pt-3">
            Additional company insights and shipment summary will appear here once wired.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
