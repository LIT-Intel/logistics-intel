import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  Ship,
  MapPin,
  MoreVertical,
  Trash2,
  Building2,
  Truck,
  Eye
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';

export default function CompanyCard({ company, onDelete, onView, onStartOutreach }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const formatWeight = (weightKg) => {
    if (weightKg === null || weightKg === undefined || isNaN(weightKg)) return 'N/A';
    if (weightKg >= 1000000) return `${(weightKg / 1000000).toFixed(1)}M kg`;
    if (weightKg >= 1000) return `${(weightKg / 1000).toFixed(0)}K kg`;
    return `${weightKg.toFixed(0)} kg`;
  };

  const totalWeight = company.total_weight_12m || 0;
  const shipmentCount = company.shipments_12m || 0;
  const topRoute = company.top_routes?.[0] || 'Various routes';
  const primaryCarrier = company.top_carriers?.[0] || 'Multiple carriers';

  const getModeDistribution = (modeMix) => {
    if (!modeMix || typeof modeMix !== 'object') return [];
    return Object.entries(modeMix)
      .filter(([, percentage]) => percentage > 5)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 2);
  };

  const modeDistribution = getModeDistribution(company.mode_mix_json);

  const handleDelete = () => {
    setIsMenuOpen(false);
    if (onDelete) {
      onDelete(company.id);
    } else {
      console.warn("onDelete handler not provided to CompanyCard");
    }
  };
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-gray-200/60 hover:shadow-xl transition-all duration-300"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 truncate text-lg mb-1">
            {company.name}
          </h3>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              <span className="truncate">{company.industry || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span className="truncate">
                {[company.hq_city, company.hq_country].filter(Boolean).join(', ') || 'N/A'}
              </span>
            </div>
          </div>
        </div>
        
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onView}>
              <Eye className="w-4 h-4 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStartOutreach(company)}>
              <Mail className="w-4 h-4 mr-2" />
              Start Outreach
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:bg-red-50 focus:text-red-700">
              <Trash2 className="w-4 h-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-medium">Total Weight (12m)</div>
            <div className="text-base font-bold text-blue-900">{formatWeight(totalWeight)}</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="text-xs text-purple-600 font-medium">Shipments</div>
            <div className="text-base font-bold text-purple-900">{shipmentCount.toLocaleString()}</div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Ship className="w-3 h-3 text-gray-500" />
            <span className="text-gray-600">Route:</span>
            <span className="font-medium text-gray-900 truncate flex-1">{topRoute}</span>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="w-3 h-3 text-gray-500" />
            <span className="text-gray-600">Carrier:</span>
            <span className="font-medium text-gray-900 truncate flex-1">{primaryCarrier}</span>
          </div>
        </div>

        {modeDistribution.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {modeDistribution.map(([mode, percentage]) => {
              const modeColors = {
                ocean: 'bg-blue-100 text-blue-800',
                air: 'bg-purple-100 text-purple-800',
                truck: 'bg-green-100 text-green-800',
                rail: 'bg-orange-100 text-orange-800'
              };
              
              return (
                <Badge 
                  key={mode} 
                  className={`text-xs ${modeColors[mode] || 'bg-gray-100 text-gray-800'}`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)} {Math.round(percentage)}%
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            company.enrichment_status === 'enriched' ? 'bg-green-500' : 
            company.enrichment_status === 'pending' ? 'bg-yellow-500' : 'bg-gray-300'
          }`} />
          <span className="capitalize">{company.enrichment_status || 'none'}</span>
        </div>
        <span>
          {company.last_seen ? `Last: ${format(new Date(company.last_seen), 'MMM d')}` : 'No recent activity'}
        </span>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onView}
          className="flex-1"
        >
          <Eye className="w-3 h-3 mr-1" />
          View
        </Button>
        <Button
          size="sm"
          onClick={() => onStartOutreach(company)}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Mail className="w-3 h-3 mr-1" />
          Contact
        </Button>
      </div>
    </motion.div>
  );
}