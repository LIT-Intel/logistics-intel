
import React, { useState } from 'react';
import { motion } from 'framer-motion';
// Removed Badge as it's no longer used in the updated design
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Ship, Plane, Truck, Train, MapPin, Mail, Eye, Building2, MoreVertical, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function CompanyListItem({ 
  company, 
  onUpdate, // Preserved as per original and outline, though not used within this component
  onView, 
  onStartOutreach, 
  onDelete, // Added for handleDelete functionality
  index = 0 
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Helper to format weight
  const formatWeight = (weightKg) => {
    if (!weightKg) return 'N/A';
    if (weightKg >= 1000000) return `${(weightKg / 1000000).toFixed(1)}M kg`;
    if (weightKg >= 1000) return `${(weightKg / 1000).toFixed(0)}K kg`;
    return `${weightKg.toFixed(0)} kg`;
  };

  // Get key metrics
  const totalWeight = company.total_weight_12m || 0;
  const shipmentCount = company.shipments_12m || 0;
  const topRoute = company.top_routes?.[0] || 'Various routes';
  const primaryCarrier = company.top_carriers?.[0] || 'Multiple carriers';

  // Get primary mode
  const getPrimaryMode = (modeMix) => {
    if (!modeMix || typeof modeMix !== 'object') return null;
    const entries = Object.entries(modeMix);
    if (entries.length === 0) return null;
    const [mode, percentage] = entries.reduce((a, b) => a[1] > b[1] ? a : b);
    return { mode, percentage: Math.round(percentage) };
  };

  const primaryMode = getPrimaryMode(company.mode_mix_json);

  const getModeIcon = (mode) => {
    const icons = {
      ocean: Ship,
      air: Plane,
      truck: Truck,
      rail: Train
    };
    return icons[mode] || Ship; // Default to Ship if mode not found
  };

  const handleDelete = async () => {
    // This is a placeholder. In a real application, you would
    // likely open a confirmation dialog, then call an API.
    // Assuming onDelete prop is passed to handle the actual deletion logic.
    if (onDelete) {
      onDelete(company.id);
    } else {
      console.warn("onDelete prop not provided to CompanyListItem. Cannot delete company.");
    }
    setIsMenuOpen(false); // Close the dropdown menu after action
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="p-4 hover:bg-gray-50/80 transition-all duration-200"
    >
      <div className="flex items-center justify-between">
        {/* Left Section - Company Info */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-gray-900 truncate">{company.name}</h3>
            <div className={`w-2 h-2 rounded-full ${
              company.enrichment_status === 'enriched' ? 'bg-green-500' : 
              company.enrichment_status === 'pending' ? 'bg-yellow-500' : 'bg-gray-300'
            }`} title={`Enrichment status: ${company.enrichment_status || 'N/A'}`} />
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
            <div className="flex items-center gap-1" title="Industry">
              <Building2 className="w-3 h-3" />
              <span>{company.industry || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-1" title="Headquarters location">
              <MapPin className="w-3 h-3" />
              <span>{[company.hq_city, company.hq_country].filter(Boolean).join(', ') || 'N/A'}</span>
            </div>
          </div>

          {/* Key Trade Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div title="Total weight shipped in last 12 months">
              <span className="text-gray-500">Weight (12m):</span>
              <span className="ml-1 font-medium text-blue-700">{formatWeight(totalWeight)}</span>
            </div>
            <div title="Total shipments in last 12 months">
              <span className="text-gray-500">Shipments:</span>
              <span className="ml-1 font-medium text-purple-700">{shipmentCount.toLocaleString()}</span>
            </div>
            <div className="md:col-span-2" title="Top shipping route">
              <span className="text-gray-500">Route:</span>
              <span className="ml-1 font-medium text-gray-900 truncate">{topRoute}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mt-2">
            <div title="Primary shipping carrier">
              <span className="text-gray-500">Primary Carrier:</span>
              <span className="ml-1 font-medium text-gray-900 truncate">{primaryCarrier}</span>
            </div>
            {primaryMode && (
              <div className="flex items-center gap-1" title={`Primary mode of transport: ${primaryMode.mode}`}>
                <span className="text-gray-500">Main Mode:</span>
                {React.createElement(getModeIcon(primaryMode.mode), { 
                  className: "w-3 h-3 text-gray-600 ml-1 flex-shrink-0" 
                })}
                <span className="font-medium text-gray-900 capitalize">
                  {primaryMode.mode} ({primaryMode.percentage}%)
                </span>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500 mt-2">
            {company.last_seen ? `Last activity: ${format(new Date(company.last_seen), 'MMM d, yyyy')}` : 'No recent activity'}
          </div>
        </div>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onView}
            className="hidden sm:inline-flex" // Hide on small screens, show on others
          >
            <Eye className="w-3 h-3 mr-1" />
            View
          </Button>
          
          <Button
            size="sm"
            onClick={() => onStartOutreach(company)}
            className="bg-blue-600 hover:bg-blue-700 text-white hidden sm:inline-flex" // Hide on small screens, show on others
          >
            <Mail className="w-3 h-3 mr-1" />
            Contact
          </Button>

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
              {onDelete && ( // Only show remove if onDelete prop is provided
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:bg-red-50 focus:text-red-700">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  );
}
