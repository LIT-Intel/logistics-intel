import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, subMonths, parseISO } from 'date-fns';

export default function ProjectStatisticsChart({ searches = [] }) {
  const [timeRange, setTimeRange] = useState('6m');

  // Process searches data for the bar chart
  const processSearchData = () => {
    if (!Array.isArray(searches) || searches.length === 0) {
      // Default sample data
      return [
        { month: 'Feb', searches: 18, companies: 6 },
        { month: 'Mar', searches: 22, companies: 8 },
        { month: 'Apr', searches: 15, companies: 5 },
        { month: 'May', searches: 28, companies: 12 },
        { month: 'Jun', searches: 24, companies: 9 },
        { month: 'Jul', searches: 12, companies: 4 }
      ];
    }

    const months = timeRange === '1y' ? 12 : 6;
    const monthsData = Array.from({ length: months }).map((_, i) => {
      const date = subMonths(new Date(), months - 1 - i);
      return {
        month: format(date, 'MMM'),
        searches: 0,
        companies: 0,
        rawDate: date
      };
    });

    // Aggregate searches by month
    searches.forEach(search => {
      if (search && search.created_date) {
        try {
          const searchDate = parseISO(search.created_date);
          const monthData = monthsData.find(m => {
            return format(m.rawDate, 'yyyy-MM') === format(searchDate, 'yyyy-MM');
          });
          
          if (monthData) {
            monthData.searches += 1;
            // Simulate companies discovered (roughly 1/3 of searches)
            if (Math.random() > 0.67) {
              monthData.companies += 1;
            }
          }
        } catch (error) {
          console.error('Error parsing search date:', error);
        }
      }
    });

    return monthsData.map(({ rawDate, ...rest }) => rest);
  };

  const data = processSearchData();

  const timeRangeOptions = [
    { id: 'all', label: 'All', active: timeRange === 'all' },
    { id: '6m', label: '6M', active: timeRange === '6m' },
    { id: '1y', label: '1Y', active: timeRange === '1y' }
  ];

  return (
    <Card 
      className="bg-white border-[#E5E7EB] h-full"
      style={{
        boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)',
        borderRadius: '12px'
      }}
    >
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-[#0F172A]">
            Search Activity
          </CardTitle>
          <div className="flex gap-1">
            {timeRangeOptions.map((option) => (
              <Button
                key={option.id}
                variant={option.active ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(option.id)}
                className={`h-8 px-3 text-sm ${
                  option.active 
                    ? 'bg-[#1E5EFF] text-white hover:bg-[#1E5EFF]/90' 
                    : 'bg-transparent text-[#6B7280] border-[#E5E7EB] hover:bg-[#F9FAFB]'
                }`}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12, fill: '#6B7280' }}
                axisLine={{ stroke: '#E5E7EB' }}
                tickLine={{ stroke: '#E5E7EB' }}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: '#6B7280' }}
                axisLine={{ stroke: '#E5E7EB' }}
                tickLine={{ stroke: '#E5E7EB' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
                }}
                labelStyle={{ color: '#0F172A', fontWeight: 600 }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '14px', color: '#6B7280' }}
                iconType="rect"
              />
              <Bar 
                dataKey="searches" 
                fill="#1E5EFF" 
                name="Searches"
                radius={[2, 2, 0, 0]}
                maxBarSize={40}
              />
              <Bar 
                dataKey="companies" 
                fill="#19C37D" 
                name="Companies Found"
                radius={[2, 2, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}