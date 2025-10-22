import React from 'react';
import { Ship, Clock, MapPin, Check, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CompanyCardCompact({ company, onView, onSave }) {
  const {
    company_id,
    id,
    company_name,
    name,
    domain,
    shipments_12m,
    hq_city,
    hq_state,
    activity_score,
    is_ready
  } = company || {};

  const displayName = company_name || name || 'Unnamed Co.';
  const displayDomain = domain || '';
  const location = [hq_city, hq_state].filter(Boolean).join(', ');
  const shipments = shipments_12m != null ? Number(shipments_12m).toLocaleString() : '';
  const activity = activity_score != null ? `${Math.round(Number(activity_score) * 100)}%` : '';

  const idVal = company_id || id;

  return (
    <div
      className="bg-white rounded-xl shadow-md border-t-4 border-[#7F3DFF] p-5 flex flex-col justify-between h-full cursor-pointer transition-shadow hover:shadow-lg"
      onClick={() => onView?.(company)}
    >
      {/* Top: Name & Meta */}
      <div className="space-y-1 mb-4">
        <h3 className="text-xl font-bold text-gray-900">{displayName}</h3>
        <p className="text-sm text-gray-500">{displayDomain}</p>
      </div>

      {/* KPI Section */}
      <div className="border-t border-b border-gray-200 py-3 grid grid-cols-3 gap-2 text-sm text-gray-700">
        <div className="flex items-center gap-2">
          <Ship size={16} className="text-[#7F3DFF]" />
          <span>{shipments || <span className="text-gray-400">—</span>}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gray-500" />
          <span>{activity || <span className="text-gray-400">—</span>}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-gray-500" />
          <span>{location || <span className="text-gray-400">—</span>}</span>
        </div>
      </div>

      {/* Bottom: Actions */}
      <div className="mt-4 flex justify-between items-center">
        {/* AI Ready badge */}
        {is_ready && (
          <div className="bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
            <Zap size={12} />
            Ready
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          <Button
            size="sm"
            className="bg-[#7F3DFF] hover:bg-[#6930cc] text-white"
            onClick={(e) => { e.stopPropagation(); onSave?.(company); }}
          >
            <Plus size={14} className="mr-1" />
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-gray-700"
            onClick={(e) => { e.stopPropagation(); onView?.(company); }}
          >
            Details
          </Button>
        </div>
      </div>
    </div>
  );
}
