import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { CompanyCore } from '@/types/company';

export default function CompanyHeader({ company, onEnrichCompany, onEnrichContacts, loading }: { company: CompanyCore; onEnrichCompany: () => void; onEnrichContacts: () => void; loading: 'company'|'contacts'|null }) {
  return (
    <Card className="mb-5 rounded-2xl border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Company</div>
            <div className="flex items-center gap-3">
              <h1 className="truncate text-2xl font-bold">{company.name}</h1>
              {typeof company.confidence === 'number' && (
                <Badge variant="outline">Conf {(company.confidence * 100).toFixed(0)}%</Badge>
              )}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">ID: {company.id}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onEnrichCompany} disabled={loading==='company'}>
              {loading==='company' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              Enrich Company
            </Button>
            <Button onClick={onEnrichContacts} disabled={loading==='contacts'}>
              {loading==='contacts' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              Enrich Contacts
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

