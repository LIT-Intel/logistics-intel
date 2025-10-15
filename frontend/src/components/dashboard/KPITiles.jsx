import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Building2, Ship, Users } from 'lucide-react';

const kpiConfig = [
  {
    title: "Searches (7d)",
    key: "searches",
    icon: Search,
    color: "from-blue-500 to-blue-600",
  },
  {
    title: "Companies Added",
    key: "companies",
    icon: Building2,
    color: "from-purple-500 to-purple-600",
  },
  {
    title: "Total Shipments",
    key: "shipments",
    icon: Ship,
    color: "from-green-500 to-green-600",
  },
  {
    title: "Active Users (7d)",
    key: "activeUsers",
    icon: Users,
    color: "from-orange-500 to-orange-600",
  }
];

export default function KPITiles({ data = {} }) {
  const safeData = {
    searches: 0,
    companies: 0,
    shipments: 0,
    activeUsers: 0,
    ...data
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {kpiConfig.map(kpi => (
        <Card key={kpi.key} className="bg-white/80 backdrop-blur-sm shadow-lg border-none overflow-hidden">
          <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${kpi.color} opacity-20`}></div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{kpi.title}</CardTitle>
            <kpi.icon className={`w-5 h-5 text-transparent bg-clip-text bg-gradient-to-r ${kpi.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {safeData[kpi.key].toLocaleString() || 0}{kpi.suffix || ''}
            </div>
            <p className="text-xs text-gray-500 mt-1 invisible">vs. last period</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}