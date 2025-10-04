import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Globe2, MapPin } from 'lucide-react';
import type { CompanyCore } from '@/types/company';

function LabelValue({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{children || '—'}</div>
    </div>
  );
}

export default function CompanyFirmographics({ company }: { company: CompanyCore }) {
  return (
    <Card className="rounded-2xl border shadow-sm">
      <CardContent className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">Company</div>
          {typeof company.confidence === 'number' && (
            <Badge variant="outline">Conf {(company.confidence * 100).toFixed(0)}%</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <LabelValue label="Name"><div className="flex items-center gap-2"><Building2 className="h-4 w-4"/> {company.name}</div></LabelValue>
          <LabelValue label="Domain"><div className="flex items-center gap-2"><Globe2 className="h-4 w-4"/> {company.domain}</div></LabelValue>
          <LabelValue label="Industry">{company.industry}</LabelValue>
          <LabelValue label="Employees">{company.size}</LabelValue>
          <LabelValue label="HQ"><div className="flex items-center gap-2"><MapPin className="h-4 w-4"/> {company.hqCity}, {company.hqCountry}</div></LabelValue>
          <LabelValue label="LinkedIn">{company.linkedin ? <a className="text-indigo-600 hover:underline" href={company.linkedin} target="_blank" rel="noreferrer">Company Profile</a> : '—'}</LabelValue>
        </div>
      </CardContent>
    </Card>
  );
}

