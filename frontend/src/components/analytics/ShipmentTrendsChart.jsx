import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, Ship, Calendar } from 'lucide-react';
import { format, subMonths, startOfMonth } from 'date-fns';
import { Shipment } from '@/api/entities';

export default function ShipmentTrendsChart({ companyId, timeRange = '12m' }) {
  const [data, setData] = useState([]);
  const [viewMode, setViewMode] = useState('volume');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTrendsData();
  }, [companyId, timeRange, viewMode]);

  const loadTrendsData = async () => {
    setIsLoading(true);
    try {
      const shipments = await Shipment.filter(
        companyId ? { company_id: companyId } : {},
        '-date',
        1000
      );

      const months = parseInt(timeRange.replace('m', ''));
      const trendsData = generateTrendsData(shipments, months, viewMode);
      setData(trendsData);
    } catch (error) {
      console.error('Failed to load trends data:', error);
    }
    setIsLoading(false);
  };

  const generateTrendsData = (shipments, months, mode) => {
    const data = [];
    
    for (let i = months - 1; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const monthStart = startOfMonth(monthDate);
      const monthKey = format(monthStart, 'yyyy-MM');
      
      const monthShipments = shipments.filter(shipment => {
        if (!shipment.date) return false;
        const shipmentDate = new Date(shipment.date);
        return format(startOfMonth(shipmentDate), 'yyyy-MM') === monthKey;
      });

      let value = 0;
      if (mode === 'volume') {
        value = monthShipments.length;
      } else if (mode === 'value') {
        value = monthShipments.reduce((sum, s) => sum + (s.value_usd || 0), 0);
      } else if (mode === 'weight') {
        value = monthShipments.reduce((sum, s) => sum + (s.weight_kg || 0), 0);
      }

      data.push({
        month: format(monthStart, 'MMM yyyy'),
        value: Math.round(value),
        count: monthShipments.length
      });
    }

    return data;
  };

  const getYAxisLabel = () => {
    switch (viewMode) {
      case 'volume': return 'Shipments';
      case 'value': return 'Value (USD)';
      case 'weight': return 'Weight (kg)';
      default: return 'Count';
    }
  };

  const formatValue = (value) => {
    if (viewMode === 'value') {
      return `$${(value / 1000).toFixed(0)}K`;
    } else if (viewMode === 'weight') {
      return `${(value / 1000).toFixed(1)}T`;
    }
    return value.toString();
  };

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  const averageValue = data.length > 0 ? Math.round(totalValue / data.length) : 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <CardTitle>Shipment Trends</CardTitle>
        </div>
        <div className="flex items-center gap-3">
          <Select value={viewMode} onValueChange={setViewMode}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="volume">Volume</SelectItem>
              <SelectItem value="value">Value</SelectItem>
              <SelectItem value="weight">Weight</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">
            {timeRange.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {formatValue(totalValue)}
            </div>
            <div className="text-sm text-gray-600">Total {getYAxisLabel()}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatValue(averageValue)}
            </div>
            <div className="text-sm text-gray-600">Monthly Average</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {data.length}
            </div>
            <div className="text-sm text-gray-600">Months of Data</div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'volume' ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value, name) => [formatValue(value), getYAxisLabel()]}
                  labelStyle={{ color: '#374151' }}
                />
                <Bar 
                  dataKey="value" 
                  fill="#3B82F6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value, name) => [formatValue(value), getYAxisLabel()]}
                  labelStyle={{ color: '#374151' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3B82F6" 
                  strokeWidth={3}
                  dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Insights */}
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start gap-3">
            <Ship className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-900 mb-1">Trend Analysis</h4>
              <p className="text-sm text-blue-800">
                {data.length > 1 && data[data.length - 1].value > data[data.length - 2].value ? (
                  <>📈 Trending upward with {formatValue(data[data.length - 1].value)} last month</>
                ) : data.length > 1 && data[data.length - 1].value < data[data.length - 2].value ? (
                  <>📉 Trending downward with {formatValue(data[data.length - 1].value)} last month</>
                ) : (
                  <>📊 Stable activity with {formatValue(averageValue)} monthly average</>
                )}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}