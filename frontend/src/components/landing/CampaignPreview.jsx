import React from 'react';
import { Users, Mail, Clock, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function CampaignPreview() {
  return (
    <motion.div
      className="w-[260px] md:w-[320px] bg-white rounded-2xl shadow-xl border border-gray-200/60 p-4"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-green-600" />
        <h3 className="font-bold text-base text-gray-900">Campaign Sequence</h3>
      </div>

      {/* Sequence Steps */}
      <div className="flex items-center justify-between mb-4 text-xs">
        <div className="flex items-center gap-1 bg-blue-50 rounded-lg px-2 py-1">
          <Mail className="w-3 h-3 text-blue-600" />
          <span className="font-medium">Email</span>
        </div>
        <div className="text-gray-400">→</div>
        <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1">
          <Clock className="w-3 h-3 text-gray-600" />
          <span className="font-medium">Wait 2d</span>
        </div>
        <div className="text-gray-400">→</div>
        <div className="flex items-center gap-1 bg-purple-50 rounded-lg px-2 py-1">
          <span className="font-medium">LinkedIn</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-green-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-green-700">62%</div>
          <div className="text-xs text-green-600">Open Rate</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-blue-700">14%</div>
          <div className="text-xs text-blue-600">Reply Rate</div>
        </div>
      </div>

      {/* Action */}
      <Button className="w-full h-8 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg">
        <TrendingUp className="w-3 h-3 mr-1" />
        Build Sequence
      </Button>
    </motion.div>
  );
}