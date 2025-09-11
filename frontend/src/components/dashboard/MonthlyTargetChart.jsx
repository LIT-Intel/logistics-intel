import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

export default function MonthlyTargetChart({ shipments = [] }) {
  // Process shipments data for the donut chart
  const processShipmentsData = () => {
    if (!Array.isArray(shipments) || shipments.length === 0) {
      return [
        { name: 'Ocean', value: 45, color: '#1E5EFF' },
        { name: 'Air', value: 35, color: '#19C37D' },
        { name: 'Truck', value: 20, color: '#FFB020' }
      ];
    }

    const modeCounts = shipments.reduce((acc, shipment) => {
      const mode = shipment.mode || 'unknown';
      acc[mode] = (acc[mode] || 0) + 1;
      return acc;
    }, {});

    const colors = {
      ocean: '#1E5EFF',
      air: '#19C37D', 
      truck: '#FFB020',
      rail: '#F04438',
      unknown: '#6B7280'
    };

    return Object.entries(modeCounts).map(([mode, count]) => ({
      name: mode.charAt(0).toUpperCase() + mode.slice(1),
      value: count,
      color: colors[mode] || colors.unknown
    }));
  };

  const data = processShipmentsData();
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null; // Don't show labels for slices < 5%
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="text-sm font-medium"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

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
          Shipment Volume by Mode
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                labelLine={false}
                label={CustomLabel}
                outerRadius={80}
                innerRadius={40}
                fill="#8884d8"
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Custom Legend */}
        <div className="flex flex-wrap justify-center gap-4 mt-4 pt-4 border-t border-[#E5E7EB]">
          {data.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.color }}
              ></div>
              <span className="text-sm text-[#6B7280]">
                {item.name} ({item.value})
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}