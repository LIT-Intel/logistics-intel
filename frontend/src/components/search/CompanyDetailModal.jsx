import React from 'react';
import { MapPin, Clock, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompanyCardCompact({ company, onSelect, onSave, isSaved }) {
  const companyName = company?.company_name || company?.name || 'Unnamed Co.';
  const shipments12m = company?.shipments_12m ?? '--';
  const activity = company?.activity_level ?? '--';
  const topRoute = company?.top_route || `None → ${company?.country || '—'}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md flex flex-col justify-between h-full">
      <div>
        {/* Header: Company Name + Save */}
        <div className="flex justify-between items-start mb-2">
          <h2 className="text-lg font-semibold leading-tight text-gray-900">{companyName}</h2>
          <Button
            size="sm"
            variant="secondary"
            className="text-xs px-3 py-1 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200"
            onClick={(e) => {
              e.stopPropagation();
              if (!isSaved && onSave) onSave(company);
            }}
            disabled={isSaved}
          >
            <Bookmark size={14} className="mr-1" />
            {isSaved ? 'Saved' : 'Save'}
          </Button>
        </div>

        {/* Metrics: Shipments + Activity */}
        <div className="flex items-center text-sm text-gray-700 space-x-4 mb-1">
          <div className="flex items-center space-x-1">
            <Bookmark size={14} className="text-gray-400" />
            <span>{shipments12m} Shipments (12m)</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock size={14} className="text-gray-400" />
            <span>Activity: {activity}</span>
          </div>
        </div>

        {/* Top Route */}
        <div className="flex items-center text-sm text-gray-700 mt-1">
          <MapPin size={14} className="text-gray-400 mr-1" />
          <span className="truncate">Top Route: {topRoute}</span>
        </div>
      </div>

      {/* Details Button */}
      <div className="mt-3 text-right">
        <button
          onClick={() => onSelect?.(company)}
          className="text-sm text-violet-700 hover:underline font-medium"
        >
          Details →
        </button>
      </div>
    </div>
  );
}
