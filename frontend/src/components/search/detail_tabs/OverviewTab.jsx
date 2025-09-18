
import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Building2, MapPin, Globe, Users, DollarSign, TrendingUp, 
  Ship, Plane, Truck, BarChart3, Calendar, Train, Package 
} from 'lucide-react';
import { format } from 'date-fns';

export default function OverviewTab({ company, isLoading }) {
  if (!isLoading && !company) {
    return (
      <div className="text-center py-8 text-gray-600">
        No overview data available for this company.
      </div>
    );
  }
  // Helper function for formatting weight
  const formatWeight = (weightKg) => {
    if (!weightKg) return 'N/A';
    if (weightKg >= 1000000) return `${(weightKg / 1000000).toFixed(1)}M kg`;
    if (weightKg >= 1000) return `${(weightKg / 1000).toFixed(0)}K kg`;
    return `${weightKg.toFixed(0)} kg`;
  };

  const analytics = useMemo(() => {
    if (!company) return null;

    return {
      totalShipments: company.shipments_12m || 0,
      topRoute: company.top_route || 'N/A',
      topCarriers: company.top_carriers || [],
      modeBreakdown: company.mode_breakdown || [],
    };
  }, [company]);

  const getModeIcon = (mode) => {
    const icons = {
      ocean: Ship,
      air: Plane,
      truck: Truck,
      rail: Train,
      unknown: Ship // Default icon for unknown mode
    };
    return icons[mode] || Ship;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Company Basic Info */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 text-white">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <Building2 className="w-5 h-5 text-white" />
              Company Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-sm text-gray-200">Industry:</span>
              <p className="font-medium text-white">{company.industry || 'Not specified'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-200">Headquarters:</span>
              <p className="font-medium text-white">
                {[company.hq_city, company.hq_country].filter(Boolean).join(', ') || 'Not specified'}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-200">Domain:</span>
              <p className="font-medium text-white">
                {company.domain ? (
                  <a href={`https://${String(company.domain).replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-300 hover:underline">
                    {company.domain}
                  </a>
                ) : 'Not specified'}
              </p>
            </div>
            {company.employee_count && (
              <div>
                <span className="text-sm text-gray-200">Employees:</span>
                <p className="font-medium text-white">{company.employee_count.toLocaleString()}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Trade Activity Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-sm text-gray-600">Total Shipments (12m):</span>
              <p className="font-bold text-purple-700 text-lg">{(analytics?.totalShipments || 0).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-sm text-gray-600">Top Route:</span>
              <p className="font-medium">{analytics?.topRoute}</p>
            </div>
            <div>
              <span className="text-sm text-gray-600">Last Seen:</span>
              <p className="font-medium">
                {company.last_seen ? format(new Date(company.last_seen), 'MMM d, yyyy') : 'No recent activity'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trade Analytics */}
      {analytics && (
        <div className="grid md:grid-cols-1 gap-6">
          {/* Top Carriers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Primary Carriers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.topCarriers.length > 0 ? (
                  analytics.topCarriers.map((carrier, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-900">{carrier}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">No carrier data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Mode Distribution */}
      {analytics && analytics.modeBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Transportation Modes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {analytics.modeBreakdown.map((modeData) => {
                const IconComponent = getModeIcon(modeData.mode);
                const total = analytics.totalShipments;
                const percentage = total > 0 ? ((modeData.cnt / total) * 100).toFixed(1) : 0;
                
                return (
                  <div key={modeData.mode} className="text-center p-4 bg-gray-50 rounded-lg">
                    <IconComponent className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                    <h4 className="font-semibold capitalize text-gray-900">{modeData.mode}</h4>
                    <p className="text-sm text-gray-600">{modeData.cnt} shipments ({percentage}%)</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top HS Codes */}
      {company.top_hs && company.top_hs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5" />
              Top Commodities (HS Codes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {company.top_hs.slice(0, 10).map((hs, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {hs}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
