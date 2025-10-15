import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function TradeLanesChart({ shipments = [] }) {
  // Ensure shipments is always an array
  const shipmentsArray = Array.isArray(shipments) ? shipments : [];
  
  const laneCounts = shipmentsArray.reduce((acc, shipment) => {
    if (shipment.origin_country && shipment.dest_country) {
      const lane = `${shipment.origin_country.slice(0,3).toUpperCase()} → ${shipment.dest_country.slice(0,3).toUpperCase()}`;
      acc[lane] = (acc[lane] || 0) + 1;
    }
    return acc;
  }, {});

  const data = Object.entries(laneCounts)
    .map(([name, shipments]) => ({ name, shipments }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 8);

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Top Trade Lanes</CardTitle>
          <Badge variant="outline">{Object.keys(laneCounts).length || 0} total lanes</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                <Tooltip
                  cursor={{ fill: 'rgba(130, 202, 157, 0.2)' }}
                  contentStyle={{ 
                    backgroundColor: 'rgba(255,255,255,0.95)', 
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb'
                  }}
                  formatter={([value]) => [`${value} shipments`, 'Volume']}
                />
                <Bar dataKey="shipments" fill="#82ca9d" background={{ fill: '#f3f4f6' }} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No trade lane data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}