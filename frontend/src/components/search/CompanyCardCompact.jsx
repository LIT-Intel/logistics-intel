import React from 'react';
import { BookOpen, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompanyCardCompact({ company, onView, onSave, isSaved }) {
  const {
    name,
    alias,
    domain,
    shipments_12m,
    last_activity,
    top_route_origin,
    top_route_destination,
    is_ready,
  } = company || {};

  const displayName = name || 'Unnamed Co.';
  const subtitle = alias || domain || '';
  const shipmentText = shipments_12m != null ? shipments_12m.toLocaleString() : null;
  const activityText = last_activity || null;
  const routeText = (top_route_origin || top_route_destination)
    ? `${top_route_origin || '—'} → ${top_route_destination || '—'}`
    : null;

  return (
    <div className="w-full bg-white rounded-xl shadow-md hover:shadow-lg p-5 flex flex-col justify-between min-h-[220px]">
      <div>
        <h3 className="text-xl font-bold text-gray-900">{displayName}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}

        <div className="border-t border-b border-gray-200 py-4 mt-4 grid grid-cols-3 gap-4 text-sm">
          {/* Shipments KPI */}
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#7F3DFF]" />
            <span className="text-gray-900">{shipmentText != null ? shipmentText : <span className="text-gray-400">—</span>}</span>
          </div>

          {/* Activity KPI */}
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            <span>{activityText != null ? activityText : <span classClassName="text-gray-400">—</span>}</span>
          </div>

          {/* Top Route KPI */}
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-500" />
            <span>{routeText != null ? routeText : <span className="text-gray-400">—</span>}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-between items-center">
        <Button
          size="sm"
          className={isSaved ? "bg-green-500 text-white px-3 py-1 rounded-full" : "bg-[#7F3DFF] text-white px-3 py-1 rounded-full"}
          onClick={(e) => { e.stopPropagation(); onSave && onSave(company); }}
        >
          {isSaved ? "Saved" : "Save"}
        </Button>

        <button
          onClick={(e) => { e.stopPropagation(); onView && onView(company); }}
          className="text-gray-700 flex items-center gap-1 text-sm"
        >
          Details →
        </button>
      </div>
    </div>
  );
}
