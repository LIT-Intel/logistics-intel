import React from 'react';
import { FileText, Download, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function RfpQuotePreview() {
  return (
    <motion.div
      className="w-[280px] md:w-[360px] bg-white rounded-2xl shadow-xl border border-gray-200/60 p-5"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-purple-600" />
        <h3 className="font-bold text-base text-gray-900">Multimodal Quote</h3>
      </div>

      {/* Quote Sections */}
      <div className="space-y-3 mb-4">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="text-xs font-medium text-blue-700 mb-1">Ocean</div>
          <div className="text-sm text-gray-700">CNSHA → USLAX • 40' FCL • $3,150/cntr • 16–18d</div>
        </div>
        
        <div className="bg-green-50 rounded-lg p-3">
          <div className="text-xs font-medium text-green-700 mb-1">Drayage</div>
          <div className="text-sm text-gray-700">Port LA → Ramp • $540/cntr • 2d free</div>
        </div>
        
        <div className="bg-orange-50 rounded-lg p-3">
          <div className="text-xs font-medium text-orange-700 mb-1">FTL</div>
          <div className="text-sm text-gray-700">LAX Ramp → Chicago DC • $2,250/load • ~3.5d</div>
        </div>
      </div>

      {/* Total */}
      <div className="bg-gray-900 rounded-lg p-3 mb-4">
        <div className="text-white text-center">
          <div className="text-xs font-medium opacity-80">Total Estimate</div>
          <div className="text-lg font-bold">$5,940</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 text-xs">
          <Download className="w-3 h-3 mr-1" />
          PDF
        </Button>
        <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-xs">
          <Mail className="w-3 h-3 mr-1" />
          Insert in Email
        </Button>
      </div>
    </motion.div>
  );
}