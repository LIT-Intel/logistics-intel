import React from 'react';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompanyCardCompact({ company, onView, onSave }) {
  // 🔐 Prevent rendering unnamed/empty companies
  if (!company || (!company.company_name && !company.name)) return null;

  const {
    company_id,
    company_name,
    name,
    total_shipments_12m,
    activity_level,
    top_origin,
    top_destination
  } = company;

  const displayName = company_name || name || 'Unnamed Co.';
  const shipmentsText = total_shipments_12m ? `${total_shipments_12m.toLocaleString()} Shipments (12m)` : `-- Shipments (12m)`;
  const activityText = activity_level || '--';
  const topRouteText = top_origin && top_destination ? `${top_origin} → ${top_destination}` : '';

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold text-gray-800 leading-snug">{displayName}</h3>
          <Button variant="ghost" size="sm" className="text-purple-600" onClick={(e) => { e.preventDefault(); onSave?.(company); }}>
            <Bookmark className="w-4 h-4 mr-1" />
            Save
          </Button>
        </div>

        <div className="text-sm text-gray-600 space-y-1">
          <p>📦 {shipmentsText}</p>
          <p>🕒 Activity: {activityText}</p>
          {topRouteText && (
            <p>📍 Top Route: {topRouteText}</p>
          )}
        </div>
      </div>

      <div className="mt-4 text-right">
        <Button variant="link" className="text-purple-600 text-sm" onClick={(e) => { e.preventDefault(); onView?.(company); }}>
          Details →
        </Button>
      </div>
    </div>
  );
}
