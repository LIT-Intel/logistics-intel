import React from 'react';
import { MapPin, Clock, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompanyCardCompact({ company, onView, onSave }) {
  console.log('CompanyCardCompact data:', company);

  const {
    name,
    shipments_12m,
    activity_level,
    top_route,
    company_id,
    id,
  } = company || {};

  const displayId = company_id || id;
  const location = top_route?.destination;
  const origin = top_route?.origin;

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between h-full">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{name}</h3>

        <div className="mt-3 space-y-2 text-sm text-gray-700">
          {shipments_12m !== undefined && shipments_12m !== null && (
            <div className="flex items-center gap-2">
              <Ship className="w-4 h-4 text-gray-500" />
              {shipments_12m.toLocaleString()}
            </div>
          )}

          {activity_level && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              {activity_level}
            </div>
          )}

          {(origin || location) && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span className="text-gray-700">{origin || '—'} → {location || '—'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => onSave && onSave(displayId)}
        >
          + Save
        </Button>
        <Button variant="link" onClick={() => onView && onView(displayId)}>
          Details →
        </Button>
      </div>
    </div>
  );
}
