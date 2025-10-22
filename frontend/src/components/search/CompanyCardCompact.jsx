import React from 'react';
import { Bookmark, Clock, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompanyCardCompact({ company, onView, onSave }) {
  const {
    name = 'Unnamed Co.',
    total_shipments_12m,
    top_route_origin,
    top_route_destination,
    activity_summary_12m,
    isSaved,
  } = company || {};

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      {/* Name */}
      <h3 className="text-lg font-semibold text-gray-800 mb-2">
        {name}
      </h3>

      {/* Metrics */}
      <div className="flex items-center text-sm text-gray-600 space-x-6 mb-3">
        {/* TEUs */}
        {total_shipments_12m != null && (
          <div className="flex items-center gap-1">
            <Bookmark className="h-4 w-4 text-purple-500" />
            <span>{total_shipments_12m}</span>
          </div>
        )}

        {/* Activity */}
        {activity_summary_12m?.length > 0 && (
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-purple-500" />
            <span>{activity_summary_12m.join(', ')}</span>
          </div>
        )}

        {/* Top Route */}
        {(top_route_origin || top_route_destination) && (
          <div className="flex items-center gap-1">
            <MapPin className="h-4 w-4 text-purple-500" />
            <span>
              {top_route_origin || ''} {top_route_origin && top_route_destination ? '→' : ''} {top_route_destination || ''}
            </span>
          </div>
        )}
      </div>

      {/* Footer: Save + View */}
      <div className="flex justify-between items-center">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSave && onSave(company);
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
            onView && onView(company);
          }}
        >
          Details →
        </Button>
      </div>
    </div>
  );
}
