import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { CompanyCore } from '@/types/company';

export default function PreCallPanel({ company }: { company: CompanyCore }){
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="p-5">
          <div className="mb-2 text-sm font-medium">Shipments (12M)</div>
          <div className="text-3xl font-semibold">0</div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="p-5">
          <div className="mb-2 text-sm font-medium">Last Activity</div>
          <div className="text-3xl font-semibold">—</div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="p-5">
          <div className="mb-2 text-sm font-medium">Top Origins / Carriers</div>
          <div className="text-sm text-muted-foreground">Pending enrichment…</div>
        </CardContent>
      </Card>
      <Card className="md:col-span-2 rounded-2xl border shadow-sm">
        <CardContent className="p-5">
          <div className="mb-2 text-sm font-medium">Historic Growth Trajectory</div>
          <div className="h-48 rounded-lg bg-muted" />
        </CardContent>
      </Card>
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="p-5">
          <div className="mb-2 text-sm font-medium">Product Ecosystem</div>
          <div className="h-48 rounded-lg bg-muted" />
        </CardContent>
      </Card>
      <Card className="md:col-span-2 rounded-2xl border shadow-sm">
        <CardContent className="p-5">
          <div className="mb-2 text-sm font-medium">Analyst Take</div>
          <div className="text-sm text-muted-foreground">Pending enrichment…</div>
        </CardContent>
      </Card>
    </div>
  );
}

