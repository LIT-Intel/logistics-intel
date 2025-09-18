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
  Mail,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';

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
  index = 0
}) {
  const formatShipments = (count) => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toLocaleString();
  };

  const isCurrentlySaving = savingCompanyId === company.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="p-4 hover:bg-gray-50/80 transition-all duration-200 cursor-pointer border-b border-gray-100 last:border-b-0"
      onClick={() => onSelect(company)}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-gray-900 truncate">{company.name}</h3>
            {isNew && (
              <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs">
                New
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
            <div className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              <span>ID: {company.id}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="flex items-center gap-1 text-blue-600 font-medium">
                <TrendingUp className="w-3 h-3" />
                <span>Shipments (12M):</span>
              </div>
              <span className="font-bold text-blue-900">
                {formatShipments(company.shipments_12m)}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1 text-purple-600 font-medium">
                <Calendar className="w-3 h-3" />
                <span>Last Activity:</span>
              </div>
              <span className="font-bold text-purple-900">
                {company.last_seen ? format(new Date(company.last_seen), 'MMM d') : 'N/A'}
              </span>
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center gap-1 text-gray-500 font-medium">
                <Ship className="w-3 h-3" />
                <span>Top Route:</span>
              </div>
              <span className="font-medium text-gray-900 truncate">
                {company.top_route || 'Various routes'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mt-2">
            <div>
              <span className="text-gray-500">Top Carrier:</span>
              <span className="ml-1 font-medium text-gray-900 truncate">
                {company.top_carrier || 'Multiple carriers'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSave(company)}
            disabled={isCurrentlySaving || isSaved}
            className="hidden sm:inline-flex"
          >
            {isCurrentlySaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            {isSaved ? <BookmarkCheck className="w-3 h-3 mr-1 text-blue-600" /> : <Bookmark className="w-3 h-3 mr-1" />}
            {isSaved ? 'Saved' : 'Save'}
          </Button>
          
          <Button
            size="sm"
            onClick={() => { window.location.href = `/app/companies/${company.id || company.company_id}`; }}
            className="bg-blue-600 hover:bg-blue-700 text-white hidden sm:inline-flex"
          >
            View
          </Button>
        </div>
      </div>
    </motion.div>
  );
}