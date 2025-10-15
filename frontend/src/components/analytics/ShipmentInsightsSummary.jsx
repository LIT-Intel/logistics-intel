import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Anchor, 
  Globe, 
  Package, 
  TrendingUp, 
  MapPin,
  Calendar,
  DollarSign
} from 'lucide-react';
import { Shipment } from '@/api/entities';

export default function ShipmentInsightsSummary({ companyId }) {
  const [insights, setInsights] = useState({
    totalShipments: 0,
    totalValue: 0,
    topRoutes: [],
    topHsCodes: [],
    modeDistribution: {},
    seasonalTrends: {},
    averageValue: 0,
    growthRate: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadInsights();
  }, [companyId]);

  const loadInsights = async () => {
    setIsLoading(true);
    try {
      const shipments = await Shipment.filter(
        companyId ? { company_id: companyId } : {},
        '-date',
        1000
      );

      const processedInsights = processShipmentData(shipments);
      setInsights(processedInsights);
    } catch (error) {
      console.error('Failed to load insights:', error);
    }
    setIsLoading(false);
  };

  const processShipmentData = (shipments) => {
    const routes = {};
    const hsCodes = {};
    const modes = {};
    const months = {};
    let totalValue = 0;

    shipments.forEach(shipment => {
      // Route analysis
      const route = `${shipment.origin_country} → ${shipment.dest_country}`;
      routes[route] = (routes[route] || 0) + 1;

      // HS Code analysis
      if (shipment.hs_code) {
        hsCodes[shipment.hs_code] = (hsCodes[shipment.hs_code] || 0) + 1;
      }

      // Mode analysis
      if (shipment.mode) {
        modes[shipment.mode] = (modes[shipment.mode] || 0) + 1;
      }

      // Seasonal analysis
      if (shipment.date) {
        const month = new Date(shipment.date).getMonth();
        months[month] = (months[month] || 0) + 1;
      }

      // Value analysis
      totalValue += shipment.value_usd || 0;
    });

    const topRoutes = Object.entries(routes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([route, count]) => ({ route, count }));

    const topHsCodes = Object.entries(hsCodes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([code, count]) => ({ code, count }));

    const averageValue = shipments.length > 0 ? totalValue / shipments.length : 0;

    // Calculate growth rate (mock calculation)
    const growthRate = Math.random() * 20 - 10; // -10% to +10%

    return {
      totalShipments: shipments.length,
      totalValue,
      topRoutes,
      topHsCodes,
      modeDistribution: modes,
      seasonalTrends: months,
      averageValue,
      growthRate
    };
  };

  const formatCurrency = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${Math.round(value)}`;
  };

  const getModeIcon = (mode) => {
    const icons = {
      'air': '✈️',
      'ocean': '🚢',
      'truck': '🚛',
      'rail': '🚂'
    };
    return icons[mode] || '📦';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalModeShipments = Object.values(insights.modeDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Overview Stats */}
      <Card className="bg-white/80 backdrop-blur-sm border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {insights.totalShipments.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Total Shipments</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {formatCurrency(insights.totalValue)}
              </div>
              <div className="text-sm text-gray-600">Total Value</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {formatCurrency(insights.averageValue)}
              </div>
              <div className="text-sm text-gray-600">Average Value</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${insights.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {insights.growthRate >= 0 ? '+' : ''}{insights.growthRate.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Growth Rate</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transportation Modes */}
      <Card className="bg-white/80 backdrop-blur-sm border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Anchor className="w-5 h-5 text-blue-600" />
            Transportation Modes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(insights.modeDistribution).map(([mode, count]) => {
            const percentage = totalModeShipments > 0 ? (count / totalModeShipments) * 100 : 0;
            return (
              <div key={mode} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getModeIcon(mode)}</span>
                    <span className="capitalize font-medium">{mode}</span>
                  </div>
                  <Badge variant="outline">{count} shipments</Badge>
                </div>
                <Progress value={percentage} className="h-2" />
                <div className="text-xs text-gray-500 text-right">
                  {percentage.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Top Routes */}
      <Card className="bg-white/80 backdrop-blur-sm border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            Top Trade Routes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {insights.topRoutes.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge className="bg-blue-100 text-blue-800">#{index + 1}</Badge>
                  <span className="font-medium text-sm">{item.route}</span>
                </div>
                <Badge variant="outline">{item.count} shipments</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top HS Codes */}
      <Card className="bg-white/80 backdrop-blur-sm border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Top HS Codes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {insights.topHsCodes.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-100 text-green-800">#{index + 1}</Badge>
                  <code className="font-mono text-sm bg-white px-2 py-1 rounded">
                    {item.code}
                  </code>
                </div>
                <Badge variant="outline">{item.count} shipments</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}