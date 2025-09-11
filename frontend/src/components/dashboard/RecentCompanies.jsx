import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, MapPin, ArrowRight } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function RecentCompanies({ companies = [], onNavigate }) {
  // Ensure companies is always an array
  const companiesArray = Array.isArray(companies) ? companies : [];
  
  const handleClick = (companyId) => {
    onNavigate(createPageUrl(`Search?company_id=${companyId}`));
  };

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
      <CardHeader>
        <CardTitle>Recently Saved Companies</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {companiesArray.slice(0, 5).map(company => (
            <div key={company.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Building2 className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{company.name}</p>
                  <div className="flex items-center text-xs text-gray-500 gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{[company.hq_city, company.hq_country].filter(Boolean).join(', ')}</span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleClick(company.id)}>
                View <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ))}
          {companiesArray.length === 0 && (
            <div className="text-center py-8 text-gray-500">No companies saved yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}