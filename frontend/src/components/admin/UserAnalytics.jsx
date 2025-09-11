import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { subDays, format, isAfter } from 'date-fns';

export default function UserAnalytics({ users, searches }) {
  const processData = () => {
    const today = new Date();
    const data = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(today, 29 - i);
      return {
        date: format(date, 'MMM dd'),
        signups: 0,
        searches: 0,
      };
    });

    users.forEach(user => {
      const userDate = new Date(user.created_date);
      const thirtyDaysAgo = subDays(today, 30);
      if (isAfter(userDate, thirtyDaysAgo)) {
        const formattedDate = format(userDate, 'MMM dd');
        const entry = data.find(d => d.date === formattedDate);
        if (entry) entry.signups++;
      }
    });

    searches.forEach(search => {
      const searchDate = new Date(search.created_date);
      const thirtyDaysAgo = subDays(today, 30);
      if (isAfter(searchDate, thirtyDaysAgo)) {
        const formattedDate = format(searchDate, 'MMM dd');
        const entry = data.find(d => d.date === formattedDate);
        if (entry) entry.searches++;
      }
    });

    return data;
  };

  const chartData = processData();

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
      <CardHeader>
        <CardTitle>User Activity (Last 30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" orientation="left" stroke="#8884d8" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar yAxisId="left" dataKey="signups" fill="#8884d8" name="New Signups" />
              <Bar yAxisId="right" dataKey="searches" fill="#82ca9d" name="Searches" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}