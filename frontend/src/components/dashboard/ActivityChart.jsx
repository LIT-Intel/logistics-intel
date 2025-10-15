import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, subDays } from 'date-fns';

export default function ActivityChart({ searches = [] }) {
  // Ensure searches is always an array
  const searchesArray = Array.isArray(searches) ? searches : [];
  
  // Aggregate data by day for the last 30 days
  const data = Array.from({ length: 30 }).map((_, i) => {
    const date = subDays(new Date(), 29 - i);
    return {
      date: format(date, 'MMM dd'),
      searches: 0,
    };
  });

  searchesArray.forEach(search => {
    if (search && search.created_date) {
      const searchDate = new Date(search.created_date);
      const thirtyDaysAgo = subDays(new Date(), 30);
      if (searchDate >= thirtyDaysAgo) {
        const formattedDate = format(searchDate, 'MMM dd');
        const dayData = data.find(d => d.date === formattedDate);
        if (dayData) {
          dayData.searches += 1;
        }
      }
    }
  });

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
      <CardHeader>
        <CardTitle>Activity (Last 30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(5px)',
                  border: '1px solid rgba(200, 200, 200, 0.5)',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}
              />
              <Legend wrapperStyle={{fontSize: "14px"}}/>
              <Line
                type="monotone"
                dataKey="searches"
                stroke="#2F7BFF"
                strokeWidth={2}
                dot={{ r: 4, fill: "#2F7BFF" }}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}