import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, MapPin, ArrowRight, Search } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';

export default function RecentCompanies({ companies = [], onNavigate }) {
  const navigate = useNavigate();
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
            <div className="text-center py-8 text-gray-500 flex flex-col items-center">
              <Building2 className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-800">No Saved Companies</h3>
              <p className="text-sm text-gray-600 mb-6">Start searching to find and save companies.</p>
              <Button onClick={() => navigate(createPageUrl("Search"))}>
                <Search className="w-4 h-4 mr-2" />
                Search for Companies
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}