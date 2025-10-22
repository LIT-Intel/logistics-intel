import React from 'react';
import { Building, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompanyCardCompact(props) { console.log('CompanyCardCompact data:', props.company); const company = props.company;({ company, onView, onSave }) {
  const {
    name,
    id,
    company_id,
    total_shipments_12m,
    activity_score,
    top_route_origin,
    top_route_destination,
  } = company;

  const safeName = name || 'Unnamed Co.';
  const companyId = company_id || id;

  const formatMetric = (value) =>
    value || value === 0 ? value : <span className="text-gray-400">—</span>;

  const showShipments = total_shipments_12m || total_shipments_12m === 0;
  const showActivity = activity_score || activity_score === 0;
  const showTopRoute = top_route_origin || top_route_destination;

  return (
    <div className="bg-white border rounded-2xl shadow-sm p-5 flex flex-col justify-between">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{safeName}</h3>

        <div className="flex flex-col gap-2 text-sm text-gray-600">
          {showShipments && (
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-gray-500" />
              {formatMetric(total_shipments_12m)}
            </div>
          )}

          {showActivity && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              {formatMetric(activity_score)}
            </div>
          )}

          {showTopRoute && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span>
                {top_route_origin || <span className="text-gray-400">—</span>} →{' '}
                {top_route_destination || <span className="text-gray-400">—</span>}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mt-4">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSave && onSave(companyId);
          }}
        >
          + Save
        </Button>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onView && onView(company);
          }}
          className="text-sm text-primary font-medium"
        >
          Details →
        </button>
      </div>
    </div>
  );
}
