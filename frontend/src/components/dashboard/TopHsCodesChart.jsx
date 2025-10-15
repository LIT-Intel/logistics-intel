import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function TopHsCodesChart({ shipments = [] }) {
  // Ensure shipments is always an array
  const shipmentsArray = Array.isArray(shipments) ? shipments : [];
  
  const hsCodeCounts = shipmentsArray.reduce((acc, shipment) => {
    if (shipment.hs_code) {
      const code = shipment.hs_code.toString().slice(0, 2);
      acc[code] = (acc[code] || 0) + 1;
    }
    return acc;
  }, {});

  const data = Object.entries(hsCodeCounts)
    .map(([name, value]) => ({ name, shipments: value }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 5);

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
      <CardHeader>
        <CardTitle>Top HS Codes</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
              <Tooltip
                cursor={{ fill: 'rgba(230, 240, 255, 0.5)' }}
                contentStyle={{ backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '0.5rem' }}
              />
              <Bar dataKey="shipments" fill="#8884d8" background={{ fill: '#eee' }} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}