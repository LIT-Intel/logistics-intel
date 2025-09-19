import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

export default function CompanyDrawer({ id, open, onOpenChange }) {
  const details = useQuery({
    queryKey: ['companyDetails', id],
    queryFn: () => api.get(`/public/getCompanyDetails?company_id=${id}`),
    enabled: open && !!id,
  });

  const shipments = useQuery({
    queryKey: ['companyShipments', id, '12m'],
    queryFn: () => api.get(`/public/getCompanyShipments?company_id=${id}&range=12m`),
    enabled: open && !!id,
  });

  const kpis = details.data?.kpis || { shipments_12m: 0, last_activity: '—', top_route: undefined, top_carrier: undefined };

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'hidden'}`}>
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="absolute right-0 top-0 h-full w-full md:w-[720px] bg-white rounded-l-2xl shadow-xl overflow-auto">
        <div className="p-4 border-b">
          <div className="text-lg font-semibold truncate">{details.data?.name || id}</div>
          <div className="text-xs text-gray-500">Last activity {kpis.last_activity || '—'}</div>
        </div>
        <div className="p-4">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="shipments">Shipments</TabsTrigger>
              <TabsTrigger value="ai">AI Insights</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card><CardContent className="p-4"><div className="text-xs text-gray-500">Shipments (12m)</div><div className="text-xl font-bold">{kpis.shipments_12m?.toLocaleString?.() || 0}</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-xs text-gray-500">Top Route</div><div className="text-sm font-medium">{kpis.top_route || '—'}</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-xs text-gray-500">Top Carrier</div><div className="text-sm font-medium">{kpis.top_carrier || '—'}</div></CardContent></Card>
              </div>
            </TabsContent>
            <TabsContent value="shipments">
              <div className="overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="[&>th]:py-2 [&>th]:text-left">
                      <th>Date</th><th>Mode</th><th>Origin</th><th>Destination</th><th>Carrier</th><th>Value (USD)</th><th>Weight (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.data?.rows?.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td>{r.shipped_on}</td>
                        <td className="capitalize">{r.mode}</td>
                        <td>{r.origin}</td>
                        <td>{r.destination}</td>
                        <td>{r.carrier || '—'}</td>
                        <td>{typeof r.value_usd === 'number' ? r.value_usd.toLocaleString() : '—'}</td>
                        <td>{typeof r.weight_kg === 'number' ? r.weight_kg.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                    {!shipments.data?.rows?.length && (
                      <tr><td colSpan={7} className="py-8 text-center text-gray-500">No shipments for this range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            <TabsContent value="ai">
              <div className="text-sm text-gray-600">Generate briefing coming soon.</div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

