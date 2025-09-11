import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Search, Ship, Building2, TrendingUp, TrendingDown } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function DashboardKPICards({ stats }) {
  const kpis = [
    {
      title: 'Active Users (7d)',
      value: stats.activeUsers,
      change: '+5.2%',
      Icon: Users,
      isUp: true,
      page: 'AdminDashboard'
    },
    {
      title: 'Recent Searches (7d)',
      value: stats.searches,
      change: '+12%',
      Icon: Search,
      isUp: true,
      page: 'Search'
    },
    {
      title: 'Total Shipments',
      value: stats.shipments.toLocaleString(),
      change: '',
      Icon: Ship,
      isUp: true,
      page: 'Search'
    },
    {
      title: 'Saved Companies',
      value: stats.companies.toLocaleString(),
      change: 'View list',
      Icon: Building2,
      isUp: true,
      page: 'Companies'
    }
  ];

  return (
    <>
      {kpis.map((kpi) => (
        <div key={kpi.title} className="col-span-12 md:col-span-6 lg:col-span-3">
           <Link to={createPageUrl(kpi.page)} className="block h-full">
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60 h-full hover:border-blue-500 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-gray-600">{kpi.title}</p>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100">
                    <kpi.Icon className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{kpi.value}</h2>
                <div className="flex items-center text-xs mt-1">
                  {kpi.change.includes('%') ? (
                    <Badge variant={kpi.isUp ? 'success' : 'destructive'} className="flex items-center gap-1">
                      {kpi.isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {kpi.change}
                    </Badge>
                  ) : (
                    <span className="text-blue-600">{kpi.change}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      ))}
    </>
  );
}