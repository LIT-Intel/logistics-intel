import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Company, Contact } from '@/api/entities';
import { Search, Building2, Users, Mail, Download, Plus, Filter, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { searchLeads } from '@/api/functions';
import LitPageHeader from '../components/ui/LitPageHeader';
import LitPanel from '../components/ui/LitPanel';
import LitWatermark from '../components/ui/LitWatermark';

export default function LeadProspecting() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [searchCriteria, setSearchCriteria] = useState({
    industry: '',
    employee_count_min: '',
    employee_count_max: '',
    revenue_min: '',
    revenue_max: '',
    location: '',
    keywords: '',
    job_titles: 'CEO,President,VP Sales,Sales Manager,Logistics Manager,Operations Manager',
    company_size: '',
    technology_used: ''
  });
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);

  React.useEffect(() => {
    const checkAccess = async () => {
      try {
        const userData = await User.me();
        if (userData.role !== 'admin') {
          navigate(createPageUrl('Dashboard'));
          return;
        }
        setUser(userData);
      } catch (error) {
        navigate(createPageUrl('Dashboard'));
      }
    };
    checkAccess();
  }, [navigate]);

  const industries = [
    'Freight Forwarding', 'Logistics', '3PL', 'Shipping', 'Transportation',
    'Supply Chain', 'Warehousing', 'Manufacturing', 'Import/Export',
    'Trucking', 'Ocean Freight', 'Air Freight', 'Rail Transport'
  ];

  const companySizes = [
    { label: '1-10 employees', value: '1,10' },
    { label: '11-50 employees', value: '11,50' },
    { label: '51-200 employees', value: '51,200' },
    { label: '201-1000 employees', value: '201,1000' },
    { label: '1000+ employees', value: '1000,10000' }
  ];

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const response = await searchLeads(searchCriteria);
      
      if (response.status === 200) {
        setSearchResults(response.data.results || []);
        setSearchPerformed(true);
      } else {
        alert('Search failed. Please try again.');
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('Search failed. Please check your criteria and try again.');
    }
    setIsSearching(false);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedCompanies(searchResults.map(company => company.id));
    } else {
      setSelectedCompanies([]);
    }
  };

  const handleSelectCompany = (companyId, checked) => {
    if (checked) {
      setSelectedCompanies([...selectedCompanies, companyId]);
    } else {
      setSelectedCompanies(selectedCompanies.filter(id => id !== companyId));
    }
  };

  const handleImportSelected = async () => {
    if (selectedCompanies.length === 0) {
      alert('Please select companies to import.');
      return;
    }

    setIsImporting(true);
    try {
      const selectedResults = searchResults.filter(company => 
        selectedCompanies.includes(company.id)
      );

      // Import companies and contacts
      for (const result of selectedResults) {
        // Create company record
        const companyData = {
          name: result.name,
          domain: result.domain,
          hq_city: result.city,
          hq_country: result.country,
          industry: result.industry,
          employee_count: result.employee_count,
          annual_revenue: result.annual_revenue,
          enrichment_status: 'enriched',
          enrichment_data: {
            source: 'apollo_prospecting',
            imported_date: new Date().toISOString(),
            ...result
          }
        };

        const company = await Company.create(companyData);

        // Import contacts if available
        if (result.contacts && result.contacts.length > 0) {
          for (const contactData of result.contacts) {
            await Contact.create({
              company_id: company.id,
              full_name: contactData.name,
              title: contactData.title,
              dept: contactData.department,
              email: contactData.email,
              phone: contactData.phone,
              linkedin: contactData.linkedin_url,
              source: 'apollo',
              verified: contactData.email_verified || false
            });
          }
        }
      }

      alert(`Successfully imported ${selectedCompanies.length} companies and their contacts.`);
      setSelectedCompanies([]);
      
    } catch (error) {
      console.error('Import error:', error);
      alert('Import failed. Some companies may have been imported successfully.');
    }
    setIsImporting(false);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="relative p-4 md:p-6 lg:p-8 min-h-screen">
      <LitWatermark />
      <div className="max-w-7xl mx-auto">
        <LitPageHeader title="Lead Prospecting" />

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Search Criteria */}
          <div className="lg:col-span-1">
            <LitPanel title="Search Criteria">
                <div>
                  <label className="block text-sm font-medium mb-1">Industry</label>
                  <Select value={searchCriteria.industry} onValueChange={(value) => setSearchCriteria({...searchCriteria, industry: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map((industry) => (
                        <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Company Size</label>
                  <Select value={searchCriteria.company_size} onValueChange={(value) => setSearchCriteria({...searchCriteria, company_size: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select company size" />
                    </SelectTrigger>
                    <SelectContent>
                      {companySizes.map((size) => (
                        <SelectItem key={size.value} value={size.value}>{size.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Location</label>
                  <Input
                    placeholder="e.g., United States, New York"
                    value={searchCriteria.location}
                    onChange={(e) => setSearchCriteria({...searchCriteria, location: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Keywords</label>
                  <Input
                    placeholder="e.g., freight, logistics, shipping"
                    value={searchCriteria.keywords}
                    onChange={(e) => setSearchCriteria({...searchCriteria, keywords: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Target Job Titles</label>
                  <Input
                    placeholder="Comma-separated titles"
                    value={searchCriteria.job_titles}
                    onChange={(e) => setSearchCriteria({...searchCriteria, job_titles: e.target.value})}
                  />
                  <p className="text-xs text-gray-500 mt-1">Default includes decision makers</p>
                </div>

                <Button onClick={handleSearch} disabled={isSearching} className="w-full">
                  {isSearching ? (
                    <>Searching...</>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Search Leads
                    </>
                  )}
                </Button>
            </LitPanel>
          </div>

          {/* Results */}
          <div className="lg:col-span-2">
            {!searchPerformed ? (
              <LitPanel>
                <div className="text-center">
                  <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Search for Leads</h3>
                  <p className="text-gray-500">Configure your search criteria and find potential LIT subscribers</p>
                </div>
              </LitPanel>
            ) : searchResults.length === 0 ? (
              <LitPanel>
                <div className="text-center">
                  <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
                  <p className="text-gray-500">Try adjusting your search criteria</p>
                </div>
              </LitPanel>
            ) : (
              <div className="space-y-4">
                {/* Results Header */}
                <LitPanel>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Checkbox 
                          checked={selectedCompanies.length === searchResults.length}
                          onCheckedChange={handleSelectAll}
                        />
                        <span className="font-medium">
                          {searchResults.length} companies found
                        </span>
                        {selectedCompanies.length > 0 && (
                          <Badge variant="secondary">
                            {selectedCompanies.length} selected
                          </Badge>
                        )}
                      </div>
                      
                      <Button 
                        onClick={handleImportSelected}
                        disabled={selectedCompanies.length === 0 || isImporting}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {isImporting ? (
                          <>Importing...</>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            Import Selected
                          </>
                        )}
                      </Button>
                    </div>
                </LitPanel>

                {/* Results List */}
                <div className="space-y-3">
                  {searchResults.map((company) => (
                    <LitPanel key={company.id}>
                        <div className="flex items-start gap-4">
                          <Checkbox 
                            checked={selectedCompanies.includes(company.id)}
                            onCheckedChange={(checked) => handleSelectCompany(company.id, checked)}
                          />
                          
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-semibold text-lg">{company.name}</h3>
                              <div className="flex items-center gap-2">
                                {company.domain && (
                                  <Badge variant="outline">{company.domain}</Badge>
                                )}
                              </div>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
                              <div>
                                <p><strong>Industry:</strong> {company.industry || 'Unknown'}</p>
                                <p><strong>Location:</strong> {company.city}, {company.country}</p>
                                <p><strong>Employees:</strong> {company.employee_count || 'Unknown'}</p>
                              </div>
                              <div>
                                <p><strong>Revenue:</strong> {company.annual_revenue ? `$${company.annual_revenue.toLocaleString()}` : 'Unknown'}</p>
                                {company.contacts && (
                                  <p><strong>Contacts:</strong> {company.contacts.length} found</p>
                                )}
                              </div>
                            </div>

                            {/* Contact Preview */}
                            {company.contacts && company.contacts.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <p className="text-xs text-gray-500 mb-2">Key Contacts:</p>
                                <div className="flex flex-wrap gap-2">
                                  {company.contacts.slice(0, 3).map((contact, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {contact.name} • {contact.title}
                                    </Badge>
                                  ))}
                                  {company.contacts.length > 3 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{company.contacts.length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                    </LitPanel>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}