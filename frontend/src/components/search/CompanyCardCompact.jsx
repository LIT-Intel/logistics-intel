import React from 'react';
import { Bookmark, Clock, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompanyCardCompact({ company, onView, onSave }) {
  const {
    name = 'Unnamed Co.',
    total_shipments_12m,
    activity_summary_12m,
    top_route_origin,
    top_route_destination,
  } = company || {};

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      {/* Company Name */}
      <h3 className="text-lg font-semibold text-gray-800 mb-3">{name}</h3>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 text-sm text-gray-700 gap-2 mb-4">
        {/* TEUs */}
        <div className="flex items-center gap-1 whitespace-nowrap">
          <Bookmark className="h-4 w-4 text-purple-500" />
          {total_shipments_12m ?? '—'}
        </div>

        {/* Activity */}
        <div className="flex items-center gap-1 whitespace-nowrap">
          <Clock className="h-4 w-4 text-purple-500" />
          {activity_summary_12m?.length ? activity_summary_12m.join(', ') : '—'}
        </div>

        {/* Top Route */}
        <div className="flex items-center gap-1 whitespace-nowrap">
          <MapPin className="h-4 w-4 text-purple-500" />
          {(top_route_origin || top_route_destination) ? (
            <>
              {top_route_origin || ''} {top_route_origin && top_route_destination ? '→' : ''} {top_route_destination || ''}
            </>
          ) : '—'}
        </div>
      </div>

      {/* Footer: Save + View */}
      <div className="flex justify-between items-center mt-auto">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSave?.(company);
          }}
          className="text-purple-600 border-purple-600 hover:bg-purple-50"
        >
          <Plus className="w-4 h-4 mr-1" />
          Save
        </Button>

        <Button
          size="sm"
          variant="link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onView?.(company);
          }}
        >
          Details →
        </Button>
      </div>
    </div>
  );
}
