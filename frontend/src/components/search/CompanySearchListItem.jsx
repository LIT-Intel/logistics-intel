import React from 'react';
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

export default function CompanySearchListItem({
  company,
  onSelect,
  onSave,
  isSaving,
  isSaved,
  isNew,
  onStartOutreach,
  onDraftRFP,
  savingCompanyId,
  selectedId,
  index = 0
}) {
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
  const growth = company.growth_rate ?? null;

  const isSelected = selectedId && (selectedId === (company.id || company.company_id));
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={[
        'rounded-xl p-[1px] mb-3 cursor-pointer transition-shadow shadow-sm',
        'bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-700',
        'hover:from-indigo-600 hover:to-blue-600',
        isSelected ? 'ring-2 ring-offset-2 ring-indigo-500' : '',
      ].join(' ')}
      onClick={() => onSelect(company)}
    >
      <div className="rounded-xl bg-white p-4 hover:bg-slate-50">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 truncate">{company.company_name || company.name}</h3>
              {isNew && <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs">New</Badge>}
            </div>
            <p className="text-xs text-gray-600 mb-2">ID: {company.company_id || company.id}</p>
            <p className="text-sm text-gray-700 line-clamp-2 mb-2">
              {(company.summary || company.description || `Top route ${company.top_route || 'various'}; top carrier ${company.top_carrier || 'various'}.`).toString()}
            </p>
            <div className="flex flex-wrap gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Shipments (12M): <b className="text-gray-900 ml-1">{formatShipments(shipments12m)}</b></span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Last: <b className="text-gray-900 ml-1">{lastActivity ? format(new Date(lastActivity), 'MMM d') : '—'}</b></span>
              <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> TEUs: <b className="text-gray-900 ml-1">{teus != null ? Number(teus).toLocaleString() : '—'}</b></span>
              <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Growth: <b className="text-gray-900 ml-1">{growth != null ? `${growth}` : '—'}</b></span>
              <span className="hidden md:flex items-center gap-1"><Ship className="w-3 h-3" /> Route: <b className="text-gray-900 ml-1 truncate max-w-[220px]">{originsTop?.[0] || company.top_route || 'Various'}</b></span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" onClick={() => onSave(company)} disabled={isCurrentlySaving || isSaved}>
              {isCurrentlySaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {isSaved ? <BookmarkCheck className="w-3 h-3 mr-1 text-blue-600" /> : <Bookmark className="w-3 h-3 mr-1" />}
              {isSaved ? 'Saved' : 'Save'}
            </Button>
            <Button size="sm" onClick={() => { isSaved ? (window.location.href = `/app/companies/${company.id || company.company_id}`) : onSelect(company); }} className="bg-blue-600 hover:bg-blue-700 text-white">
              View
            </Button>
            {isSaved && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-2 py-0.5">
                Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}