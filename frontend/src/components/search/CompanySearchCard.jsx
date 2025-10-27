import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Ship,
  Calendar,
  TrendingUp,
  Bookmark,
  BookmarkCheck,
  Loader2,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import { kpiFrom } from '@/lib/api';
import dynamic from 'next/dynamic';

const CompanyLanesPanel = dynamic(() => import('@/components/CompanyLanesPanel'), { ssr: false });

export default function CompanySearchCard({
  company,
  onSelect,
  onSave,
  isSaving,
  isSaved,
  isNew,
  onStartOutreach,
  onDraftRFP,
  savingCompanyId
}) {
  const [showLanes, setShowLanes] = useState(false);
  const formatShipments = (count) => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toLocaleString();
  };

  const isCurrentlySaving = savingCompanyId === company.id;

  const { shipments12m, lastActivity, originsTop, carriersTop } = kpiFrom({
    company_id: company.company_id || company.id || null,
    company_name: company.company_name || company.name || 'Unknown',
    shipments_12m: company.shipments_12m,
    shipments12m: company.shipments_12m,
    shipments: company.shipments,
    last_activity: company.last_seen,
    lastActivity: company.last_seen,
    lastShipmentDate: company.last_seen,
    origins_top: company.origins_top,
    originsTop: company.originsTop,
    dests_top: company.dests_top,
    destsTop: company.destsTop,
    carriers_top: company.carriers_top,
    carriersTop: company.carriersTop,
  });

  const teus = company.total_teus ?? null;
  const growth = company.growth_rate == null ? null : `${Math.round(Number(company.growth_rate) * 100)}%`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 md:p-5 shadow-lg border border-gray-200/60 hover:shadow-xl transition-all duration-300 cursor-pointer"
      onClick={() => onSelect(company)}
    >
      {isNew && (
        <div className="mb-3">
          <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">
            New Shipper
          </Badge>
        </div>
      )}

      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 truncate text-lg">
            {company.name}
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Building2 className="w-3 h-3" />
            <span>ID: {company.id}</span>
          </div>
        </div>
      </div>

      {/* Actions directly under name */}
      <div className="flex gap-2 mt-3 mb-4" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSave(company)}
          disabled={isCurrentlySaving || isSaved}
          className="flex-1"
        >
          {isCurrentlySaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          {isSaved ? <BookmarkCheck className="w-3 h-3 mr-1 text-blue-600" /> : <Bookmark className="w-3 h-3 mr-1" />}
          {isSaved ? 'Saved' : 'Save'}
        </Button>
        <Button
          size="sm"
          onClick={(e) => { e.stopPropagation(); if (isSaved) { window.location.href = `/app/companies/${company.id || company.company_id}`; } else { onSelect(company); } }}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          View Details
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowLanes((v) => !v)}
          className="flex-1"
        >
          {showLanes ? 'Hide Lanes' : 'Lanes'}
        </Button>
      </div>

      {/* KPI tiles below actions - uniform squares compact */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: 'Shipments (12M)', value: formatShipments(shipments12m) },
          { label: 'Last Activity', value: lastActivity ? format(new Date(lastActivity), 'MMM d') : '—' },
          { label: 'Total TEUs', value: teus != null ? Number(teus).toLocaleString() : '—' },
          { label: 'Growth Rate', value: growth != null ? growth : '—' },
        ].map((k, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white min-h-[96px] p-3 flex flex-col items-center justify-center">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 truncate w-full text-center">{k.label}</div>
            <div className="mt-1 text-xl font-bold text-gray-900 truncate w-full text-center">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <Ship className="w-3 h-3 text-gray-500" />
          <span className="text-gray-600">Top Route:</span>
          <span className="font-medium text-gray-900 truncate flex-1">
            {originsTop?.[0] ? `${originsTop[0]} → ${''}` : (company.origin && company.destination ? `${company.origin} → ${company.destination}` : 'Various routes')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="w-3 h-3 text-gray-500" />
          <span className="text-gray-600">Top Carrier:</span>
          <span className="font-medium text-gray-900 truncate flex-1">
            {carriersTop?.[0] || 'Multiple carriers'}
          </span>
        </div>
      </div>

      {/* Lanes Panel Toggle */}
      {showLanes && (
        <div className="mt-3" onClick={(e)=> e.stopPropagation()}>
          <CompanyLanesPanel company={company.name || company.company_name || ''} />
        </div>
      )}

      {/* Meta (route/carrier) */}
    </motion.div>
  );
}