
import React from 'react';
import { Building2, MapPin, Ship, Plane, Bookmark, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function CompanyCardPreview({ 
  company, 
  onSelect, 
  isSaved
}) {
  const handleSaveClick = (e) => {
    e.stopPropagation();
    // This button will now prompt login/signup instead of saving
    window.location.href = '/?signup=true';
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      onClick={onSelect}
      className="bg-white rounded-xl shadow-md border p-4 cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors truncate pr-2">
          {company.name}
        </h3>
        {/* The save button is now a CTA to sign up */}
        <button
          onClick={handleSaveClick}
          className="p-1.5 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
          aria-label="Save company"
        >
          <Bookmark className={`w-4 h-4 ${isSaved ? 'text-blue-600 fill-current' : 'text-gray-400'}`} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 mb-4 relative z-10">
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-500 font-medium">Shipments 12m</div>
          <div className="text-lg font-bold text-gray-900">1,284</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-500 font-medium">Top HS</div>
          <div className="text-lg font-bold text-gray-900">9403, 8471</div>
        </div>
      </div>

      {/* Mode Mix */}
      <div className="mb-4 relative z-10">
        <div className="text-xs text-gray-500 font-medium mb-2">Transportation Mix</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Ship className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium">Ocean 78%</span>
          </div>
          <div className="flex items-center gap-1">
            <Plane className="w-4 h-4 text-sky-600" />
            <span className="text-sm font-medium">Air 22%</span>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      <div className="text-sm text-gray-600 mb-6 space-y-1 relative z-10">
        <div>• Similar: Lowe's, Menards, Ace…</div>
        <div>• Likely contacts: Logistics, Procurement</div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 relative z-10">
        <Button className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
          Start Outreach
        </Button>
        <Button variant="outline" className="flex-1 h-9 text-sm rounded-lg">
          Draft RFP
        </Button>
      </div>
    </motion.div>
  );
}
