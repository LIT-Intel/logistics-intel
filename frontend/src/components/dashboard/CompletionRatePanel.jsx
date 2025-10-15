import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

export default function CompletionRatePanel({ stats = {} }) {
  // Calculate some meaningful metrics from available data
  const completionRate = Math.min(Math.max(
    stats.companies > 0 ? Math.round((stats.searches / stats.companies) * 100) : 0,
    0
  ), 100);

  const progressValue = Math.min(Math.max(
    stats.companies > 0 ? Math.round((stats.companies / Math.max(stats.companies, 50)) * 100) : 0,
    0
  ), 100);

  return (
    <Card 
      className="bg-white border-[#E5E7EB] h-full"
      style={{
        boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)',
        borderRadius: '12px'
      }}
    >
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold text-[#0F172A]">
          Activity Rate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Stat */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-3xl font-bold text-[#0F172A]">
              {completionRate}%
            </span>
            <div className="flex items-center gap-1 px-2 py-1 bg-[#19C37D]/10 rounded-full">
              <TrendingUp className="w-3 h-3 text-[#19C37D]" />
              <span className="text-xs font-medium text-[#19C37D]">
                +12%
              </span>
            </div>
          </div>
          <p className="text-sm text-[#6B7280]">
            Search to Company Ratio
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#0F172A]">
              Data Collection Progress
            </span>
            <span className="text-sm text-[#6B7280]">
              {progressValue}%
            </span>
          </div>
          <div className="w-full bg-[#F9FAFB] rounded-full h-2">
            <div 
              className="h-2 rounded-full bg-gradient-to-r from-[#1E5EFF] to-[#19C37D] transition-all duration-300"
              style={{ width: `${progressValue}%` }}
            ></div>
          </div>
          <p className="text-xs text-[#6B7280]">
            Companies added to your database
          </p>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#E5E7EB]">
          <div className="text-center">
            <div className="text-lg font-bold text-[#0F172A]">
              {stats.activeUsers || 0}
            </div>
            <p className="text-xs text-[#6B7280]">
              Active Users
            </p>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-[#0F172A]">
              {Math.floor(stats.shipments / 1000) || 0}k
            </div>
            <p className="text-xs text-[#6B7280]">
              Data Points
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}