import React from 'react';
import { Bookmark, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompanyCardCompact({ company, onView, onSave }) {
  const {
    name = 'Unnamed Co.',
    total_shipments_12m,
    activity_score,
    top_route_origin,
    top_route_destination,
  } = company || {};

  const formatValue = (value) =>
    value != null ? value : <span className="text-gray-400">—</span>;

  const hasRoute = top_route_origin || top_route_destination;

  return (
    <div className="bg-white border-4 border-[#7F3DFF] rounded-xl shadow-md hover:shadow-lg p-5 flex flex-col justify-between h-full">
      {/* Company Name */}
      <h3 className="text-xl font-bold text-gray-900">{name}</h3>

      {/* KPI Metrics */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm text-gray-700">
        {/* Shipments */}
        <div className="flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-purple-600" />
          {formatValue(total_shipments_12m)}
        </div>

        {/* Activity */}
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600" />
          {formatValue(activity_score)}
        </div>

        {/* Top Route */}
        <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
          <MapPin className="w-5 h-5 text-purple-600" />
          {hasRoute
            ? `${top_route_origin || '—'} → ${top_route_destination || '—'}`
            : <span className="text-gray-400">—</span>
          }
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="mt-5 flex justify-between items-center">
        <Button
          size="sm"
          variant="outline"
          className="text-[#7F3DFF] border-[#7F3DFF] hover:bg-purple-50"
          onClick={() => onSave && onSave(company)}
        >
          + Save
        </Button>
        <button
          onClick={() => onView && onView(company)}
          className="text-gray-700 text-sm font-medium"
        >
          Details →
        </button>
      </div>
    </div>
  );
}
