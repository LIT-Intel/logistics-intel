import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Search, Building2, BarChart, Percent, UserCheck } from 'lucide-react';

const KPICard = ({ title, value, icon: Icon, change }) => (
  <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
      <Icon className="h-5 w-5 text-purple-500" />
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      {change && <p className="text-xs text-gray-500 mt-1">{change}</p>}
    </CardContent>
  </Card>
);

export default function AdminKPIs({ data }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KPICard title="Total Users" value={data.totalUsers} icon={Users} />
      <KPICard title="Weekly Active Users" value={data.activeUsers} icon={UserCheck} />
      <KPICard title="Total Companies" value={data.totalCompanies} icon={Building2} />
      <KPICard title="Total Searches" value={data.totalSearches} icon={Search} />
      <KPICard title="Avg Searches/User" value={data.avgSearchesPerUser} icon={BarChart} />
      <KPICard title="Enrichment Rate" value={`${data.enrichmentRate}%`} icon={Percent} />
    </div>
  );
}