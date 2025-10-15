import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Ship, Plane, Truck, Mail, Building2, FileText, Download, Send, Save } from 'lucide-react';

// Mock API functions for companies and contacts
const mockCompanies = [
  { id: 'comp1', name: 'ABC Logistics Inc.', email_domain: 'abclogistics.com' },
  { id: 'comp2', name: 'Global Freight Solutions', email_domain: 'globalfreight.com' },
  { id: 'comp3', name: 'Oceanic Transport Co.', email_domain: 'oceanic.com' },
  { id: 'comp4', name: 'Rapid Cargo Solutions', email_domain: 'rapidcargo.com' },
];

const mockContacts = [
  { id: 'con1', company_id: 'comp1', full_name: 'John Smith', title: 'Logistics Manager', email: 'john.smith@abclogistics.com' },
  { id: 'con2', company_id: 'comp1', full_name: 'Jane Doe', title: 'Procurement Officer', email: 'jane.doe@abclogistics.com' },
  { id: 'con3', company_id: 'comp2', full_name: 'Peter Jones', title: 'Shipping Coordinator', email: 'peter.jones@globalfreight.com' },
  { id: 'con4', company_id: 'comp3', full_name: 'Alice Brown', title: 'Import Specialist', email: 'alice.brown@oceanic.com' },
  { id: 'con5', company_id: 'comp4', full_name: 'Bob Johnson', title: 'Supply Chain Director', email: 'bob.johnson@rapidcargo.com' },
];

export default function RFPBuilderForm({ 
  quote, 
  onQuoteChange, 
  onSave, 
  onGeneratePDF,
  onSendEmail, 
  isGeneratingPDF, 
  preSelectedCompany 
}) {
  const [companies, setCompanies] = React.useState([]);
  const [contacts, setContacts] = React.useState([]);
  const [filteredContacts, setFilteredContacts] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Effect to fetch companies and contacts data (simulated API call)
  React.useEffect(() => {
    const fetchCompanyData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 300));
        setCompanies(mockCompanies);
        setContacts(mockContacts);
      } catch (err) {
        setError("Failed to load company and contact data.");
        console.error("Error fetching company/contact data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCompanyData();
  }, []);

  // Memoized handleCompanyChange to prevent useEffect dependency issues
  const handleCompanyChange = React.useCallback((companyId) => {
    const selectedCompany = companies.find(c => c.id === companyId);
    const newFilteredContacts = contacts.filter(c => c.company_id === companyId);
    
    let newQuote = { 
      ...quote, 
      company_id: companyId,
      company_name: selectedCompany ? selectedCompany.name : '',
      contact_id: '', // Reset contact when company changes
      contact_name: '',
      contact_email: ''
    };

    // If there's only one contact for the company, pre-select it
    if (newFilteredContacts.length === 1) {
      const soleContact = newFilteredContacts[0];
      newQuote.contact_id = soleContact.id;
      newQuote.contact_name = soleContact.full_name;
      newQuote.contact_email = soleContact.email;
    }

    setFilteredContacts(newFilteredContacts);
    onQuoteChange(newQuote);
  }, [companies, contacts, quote, onQuoteChange]);

  // Effect to pre-select company if preSelectedCompany prop is provided and data is loaded
  React.useEffect(() => {
    if (preSelectedCompany && companies.length > 0) {
      const companyToSelect = companies.find(c => c.name === preSelectedCompany);
      if (companyToSelect && companyToSelect.id !== quote.company_id) {
        handleCompanyChange(companyToSelect.id);
      }
    }
  }, [preSelectedCompany, companies, quote.company_id, handleCompanyChange]);

  // Helper function to update nested mode data
  const updateModeData = React.useCallback((mode, field, value) => {
    const modeKey = `${mode}_json`;
    onQuoteChange({
      ...quote,
      [modeKey]: {
        ...quote[modeKey],
        [field]: value
      }
    });
  }, [quote, onQuoteChange]);

  // Memoized function to calculate total cost
  const calculateTotal = React.useCallback(() => {
    let total = 0;
    // Safely parse and sum rates from active modes
    if (quote.ocean_json?.rate) total += parseFloat(quote.ocean_json.rate) || 0;
    if (quote.air_json?.rate) total += parseFloat(quote.air_json.rate) || 0;
    if (quote.dray_json?.rate) total += parseFloat(quote.dray_json.rate) || 0;
    if (quote.ftl_json?.rate) total += parseFloat(quote.ftl_json.rate) || 0;
    
    // Update the total_cost in the quote object if it's different
    if (quote.total_cost !== total) {
      onQuoteChange({ ...quote, total_cost: total });
    }
  }, [quote, onQuoteChange]);

  // Recalculate total whenever relevant mode data changes
  React.useEffect(() => {
    calculateTotal();
  }, [calculateTotal]);

  // Memoized activeModes to prevent dependency issues
  const activeModes = React.useMemo(() => {
    return quote.mode_combo?.split('_') || ['ocean'];
  }, [quote.mode_combo]);

  const getModeIcon = React.useCallback((mode) => {
    const icons = {
      ocean: Ship,
      air: Plane,
      truck: Truck,
      dray: Truck,
      ftl: Truck
    };
    return icons[mode] || Ship;
  }, []);

  // Effect to filter contacts based on selected company_id
  React.useEffect(() => {
    if (quote.company_id && contacts.length > 0) {
      setFilteredContacts(contacts.filter(c => c.company_id === quote.company_id));
    } else {
      setFilteredContacts([]);
    }
  }, [quote.company_id, contacts]);

  // Validation logic for PDF generation and Email sending
  const canGeneratePDF = React.useMemo(() => {
    const hasContactInfo = !!quote.contact_name && !!quote.contact_email && !!quote.company_name;
    const hasBasicQuoteInfo = !!quote.origin && !!quote.destination && !!quote.commodity && !!quote.incoterm && !!quote.valid_until;
    
    const hasModeDataRates = activeModes.every(mode => {
        const modeData = quote[`${mode}_json`];
        return modeData && parseFloat(modeData.rate) > 0;
    });
    
    return hasContactInfo && hasBasicQuoteInfo && hasModeDataRates;
  }, [quote, activeModes]);

  const canSendEmail = React.useMemo(() => {
    return canGeneratePDF && (quote.total_cost > 0) && (quote.contact_email && quote.contact_email.includes('@'));
  }, [canGeneratePDF, quote.total_cost, quote.contact_email]);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-600">Loading company and contact data...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-8">
      {/* Company & Contact Selection */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Contact & Delivery Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company *</Label>
              <Select 
                value={quote.company_id || ''} 
                onValueChange={handleCompanyChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select company..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact">Contact Person</Label>
              <Select 
                value={quote.contact_id || ''} 
                onValueChange={(value) => {
                    const selectedContact = filteredContacts.find(c => c.id === value);
                    onQuoteChange({ 
                        ...quote, 
                        contact_id: value,
                        contact_name: selectedContact ? selectedContact.full_name : '',
                        contact_email: selectedContact ? selectedContact.email : ''
                    });
                }}
                disabled={filteredContacts.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contact..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.full_name} - {contact.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Manually editable contact fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">Contact Name *</Label>
              <Input
                id="contact_name"
                value={quote.contact_name || ''}
                onChange={(e) => onQuoteChange({ ...quote, contact_name: e.target.value })}
                placeholder="Enter contact name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact Email *</Label>
              <Input
                id="contact_email"
                type="email"
                value={quote.contact_email || ''}
                onChange={(e) => onQuoteChange({ ...quote, contact_email: e.target.value })}
                placeholder="Enter email address"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name *</Label>
            <Input
              id="company_name"
              value={quote.company_name || ''}
              onChange={(e) => onQuoteChange({ ...quote, company_name: e.target.value })}
              placeholder="Enter company name"
            />
          </div>
        </CardContent>
      </Card>

      {/* Basic Information */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <span>Quote Details</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="origin">Origin</Label>
              <Input
                id="origin"
                value={quote.origin || ''}
                onChange={(e) => onQuoteChange({ ...quote, origin: e.target.value })}
                placeholder="Shanghai, China"
              />
            </div>
            <div>
              <Label htmlFor="destination">Destination</Label>
              <Input
                id="destination"
                value={quote.destination || ''}
                onChange={(e) => onQuoteChange({ ...quote, destination: e.target.value })}
                placeholder="Long Beach, USA"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="commodity">Commodity</Label>
            <Input
              id="commodity"
              value={quote.commodity || ''}
              onChange={(e) => onQuoteChange({ ...quote, commodity: e.target.value })}
              placeholder="General Goods"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="incoterm">Incoterm</Label>
              <Select value={quote.incoterm || ''} onValueChange={(value) => onQuoteChange({ ...quote, incoterm: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Incoterm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXW">EXW - Ex Works</SelectItem>
                  <SelectItem value="FOB">FOB - Free on Board</SelectItem>
                  <SelectItem value="CIF">CIF - Cost, Insurance & Freight</SelectItem>
                  <SelectItem value="DDP">DDP - Delivered Duty Paid</SelectItem>
                  <SelectItem value="DDU">DDU - Delivered Duty Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="valid_until">Valid Until</Label>
              <Input
                id="valid_until"
                type="date"
                value={quote.valid_until || ''}
                onChange={(e) => onQuoteChange({ ...quote, valid_until: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mode Combination Selector */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
        <CardHeader>
          <CardTitle>Transportation Modes</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={quote.mode_combo || 'ocean'} onValueChange={(value) => onQuoteChange({ ...quote, mode_combo: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select mode combination" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ocean">Ocean Only</SelectItem>
              <SelectItem value="air">Air Only</SelectItem>
              <SelectItem value="ocean_dray">Ocean + Drayage</SelectItem>
              <SelectItem value="air_dray">Air + Drayage</SelectItem>
              <SelectItem value="ocean_air">Ocean + Air (Multimodal)</SelectItem>
              <SelectItem value="ocean_air_dray">Ocean + Air + Drayage</SelectItem>
              <SelectItem value="ftl">FTL Only</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex flex-wrap gap-2 mt-4">
            {activeModes.map(mode => {
              const Icon = getModeIcon(mode);
              return (
                <Badge key={mode} variant="secondary" className="flex items-center gap-1">
                  <Icon className="w-3 h-3" />
                  {mode.charAt(0).toUpperCase() + mode.slice(1).replace(/_/g, ' ')}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Dynamic Mode Pricing Forms */}
      {activeModes.map(mode => {
        const modeData = quote[`${mode}_json`] || {};
        const Icon = getModeIcon(mode);
        
        return (
          <Card key={mode} className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="w-5 h-5" />
                {mode.charAt(0).toUpperCase() + mode.slice(1).replace(/_/g, ' ')} Freight
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`${mode}_rate`}>Rate</Label>
                  <Input
                    id={`${mode}_rate`}
                    type="number"
                    value={modeData.rate || ''}
                    onChange={(e) => updateModeData(mode, 'rate', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor={`${mode}_currency`}>Currency</Label>
                  <Select 
                    value={modeData.currency || 'USD'} 
                    onValueChange={(value) => updateModeData(mode, 'currency', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="USD" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="CNY">CNY</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {mode === 'ocean' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="ocean_transit_time">Transit Time (days)</Label>
                    <Input
                      id="ocean_transit_time"
                      type="number"
                      value={modeData.transit_time || ''}
                      onChange={(e) => updateModeData('ocean', 'transit_time', e.target.value)}
                      placeholder="25"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ocean_container_type">Container Type</Label>
                    <Select 
                      value={modeData.container_type || '20GP'} 
                      onValueChange={(value) => updateModeData('ocean', 'container_type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="20GP" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20GP">20' GP</SelectItem>
                        <SelectItem value="40GP">40' GP</SelectItem>
                        <SelectItem value="40HQ">40' HQ</SelectItem>
                        <SelectItem value="45HQ">45' HQ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {mode === 'air' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="air_weight">Weight (kg)</Label>
                    <Input
                      id="air_weight"
                      type="number"
                      value={modeData.weight || ''}
                      onChange={(e) => updateModeData('air', 'weight', e.target.value)}
                      placeholder="1000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="air_dimensions">Dimensions (L×W×H cm)</Label>
                    <Input
                      id="air_dimensions"
                      value={modeData.dimensions || ''}
                      onChange={(e) => updateModeData('air', 'dimensions', e.target.value)}
                      placeholder="100×80×120"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor={`${mode}_notes`}>Additional Notes</Label>
                <Textarea
                  id={`${mode}_notes`}
                  value={modeData.notes || ''}
                  onChange={(e) => updateModeData(mode, 'notes', e.target.value)}
                  placeholder="Special handling, delivery requirements, etc."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Total Cost Summary */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-700">Total Quote Amount:</span>
            <span className="text-2xl font-bold text-blue-600">
              ${quote.total_cost?.toLocaleString() || '0'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 pt-6">
        <Button onClick={onSave} variant="outline" className="flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save Draft
        </Button>
        
        <div className="flex gap-2">
          <Button 
            onClick={onGeneratePDF} 
            variant="outline" 
            disabled={isGeneratingPDF || !canGeneratePDF}
            className="flex items-center gap-2"
          >
            {isGeneratingPDF ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Generate PDF
              </>
            )}
          </Button>
          
          <Button 
            onClick={() => onSendEmail(quote)} 
            disabled={!canSendEmail}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send Email
          </Button>
        </div>
      </div>
    </div>
  );
}