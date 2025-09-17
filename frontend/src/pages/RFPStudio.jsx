import React, { useState, useEffect } from 'react';
import { RFPQuote, Company, Contact } from '@/api/entities';
import { User } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, Eye, Mail, Download, Settings } from 'lucide-react';
import LockedFeature from '../components/common/LockedFeature';
import { checkFeatureAccess } from '../components/utils/planLimits';

import RFPBuilderForm from '../components/rfp/RFPBuilderForm';
import RFPPreview from '../components/rfp/RFPPreview';
import { generateRfpPdf } from '@/api/functions';
import { sendEmail } from '@/api/functions';

export default function RFPStudio() {
  const [activeTab, setActiveTab] = useState('create');
  const [quoteData, setQuoteData] = useState({
    quote_name: '',
    mode_combo: 'ocean',
    origin: '',
    destination: '',
    commodity: '',
    contact_email: '',
    contact_name: '',
    company_name: '',
    incoterm: 'FOB',
    valid_until: '',
    total_cost: 0,
    ocean_json: { rate: '', transit_time: '', notes: '' },
    air_json: { rate: '', transit_time: '', notes: '' },
    dray_json: { rate: '', transit_time: '', notes: '' },
    ftl_json: { rate: '', transit_time: '', notes: '' },
    notes: ''
  });
  
  const [savedQuotes, setSavedQuotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState(null);

  const hasAccess = user ? checkFeatureAccess(user, 'rfp_generation') : false;

  useEffect(() => {
    const checkUserAndLoad = async () => {
      try {
        const userData = await User.me();
        setUser(userData);
        const access = checkFeatureAccess(userData, 'rfp_generation');
        if (access) {
          loadSavedQuotes();
        }
      } catch (error) {
        console.error('Error loading user:', error);
      }
      setIsLoading(false);
    };
    checkUserAndLoad();
  }, []);

  const loadSavedQuotes = async () => {
    try {
      const quotes = await RFPQuote.list('-updated_date');
      setSavedQuotes(quotes);
    } catch (error) {
      console.error('Error loading quotes:', error);
    }
  };

  const handleSave = async () => {
    if (!quoteData.quote_name || !quoteData.origin || !quoteData.destination) {
      alert('Please fill in the required fields (Quote Name, Origin, Destination)');
      return;
    }

    setIsSaving(true);
    try {
      await RFPQuote.create(quoteData);
      alert('Quote saved successfully!');
      loadSavedQuotes();
      setActiveTab('preview');
    } catch (error) {
      console.error('Error saving quote:', error);
      alert('Failed to save quote. Please try again.');
    }
    setIsSaving(false);
  };

  const handleSendEmail = async () => {
    if (!quoteData.contact_email) {
      alert('Please specify a contact email to send the quote');
      return;
    }

    setIsLoading(true);
    try {
      // Generate email content
      const emailSubject = `${quoteData.quote_name} - Freight Quote`;
      const emailBody = generateQuoteEmailHTML(quoteData);

      const response = await sendEmail({
        to: quoteData.contact_email,
        subject: emailSubject,
        body_html: emailBody,
        from_name: undefined // Use default sender name
      });

      if (response.data.success) {
        alert('Quote sent successfully via email!');
      } else {
        throw new Error(response.data.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Please check the console for details.');
    }
    setIsLoading(false);
  };

  const handleDownloadPDF = async () => {
    setIsLoading(true);
    try {
      // Pass the payload in the expected { quoteData, user } structure.
      const response = await generateRfpPdf({ quoteData, user });
      
      // The backend returns a direct PDF file (blob), not a JSON object with a URL.
      // This code correctly handles the blob response to trigger a download.
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `${quoteData.quote_name || 'Quote'}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      
      // Clean up by removing the link and revoking the object URL.
      document.body.removeChild(link);
      window.URL.revokeObjectURL(link.href);

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again or contact support.');
    }
    setIsLoading(false);
  };

  const generateQuoteEmailHTML = (quote) => {
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount || 0);
    };

    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px;">
              ${quote.quote_name}
            </h2>
            
            <p>Dear ${quote.contact_name || 'Valued Customer'},</p>
            
            <p>Thank you for your inquiry. Please find our freight quote details below:</p>
            
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1e40af;">Shipment Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Origin:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${quote.origin}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Destination:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${quote.destination}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Commodity:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${quote.commodity}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Incoterm:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${quote.incoterm}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Total Cost:</strong></td>
                  <td style="padding: 8px 0; font-size: 18px; font-weight: bold; color: #1e40af;">${formatCurrency(quote.total_cost)}</td>
                </tr>
              </table>
            </div>
            
            ${quote.notes ? `
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #92400e;">Additional Notes:</h4>
              <p style="margin-bottom: 0;">${quote.notes}</p>
            </div>
            ` : ''}
            
            <p>This quote is valid until ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : 'further notice'}.</p>
            
            <p>If you have any questions or would like to proceed with this shipment, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br>
            The LIT Team</p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            <p style="font-size: 12px; color: #6b7280;">
              This quote was generated using Logistic Intel. 
              <a href="https://logisticintel.com" style="color: #1e40af;">Learn more</a>
            </p>
          </div>
        </body>
      </html>
    `;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return <LockedFeature featureName="RFP Studio" />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 lg:mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">RFP Studio</h1>
            <p className="text-gray-600 mt-2 text-sm md:text-base">
              Create professional freight quotes and proposals
            </p>
          </div>
          
          <div className="flex gap-2">
            {activeTab === 'create' && (
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
              >
                {isSaving ? 'Saving...' : 'Save Quote'}
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="saved" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Saved ({savedQuotes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-6 mt-6">
            <RFPBuilderForm 
              quote={quoteData}
              onQuoteChange={setQuoteData}
              onSave={handleSave}
              onGeneratePDF={handleDownloadPDF}
              onSendEmail={handleSendEmail}
              isGeneratingPDF={isLoading}
            />
          </TabsContent>

          <TabsContent value="preview" className="space-y-6 mt-6">
            <RFPPreview 
              quoteData={quoteData}
              onSendEmail={handleSendEmail}
              onDownloadPDF={handleDownloadPDF}
            />
          </TabsContent>

          <TabsContent value="saved" className="space-y-6 mt-6">
            {savedQuotes.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-block p-6 bg-white/80 rounded-full shadow-lg mb-6">
                  <FileText className="w-16 h-16 text-blue-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">No Saved Quotes</h2>
                <p className="text-gray-600 mb-6">
                  Create your first quote to get started with professional proposals.
                </p>
                <Button
                  onClick={() => setActiveTab('create')}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Quote
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {savedQuotes.map((quote) => (
                  <Card key={quote.id} className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60 hover:shadow-xl transition-shadow">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold truncate">
                        {quote.quote_name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 mb-4">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Route:</span> {quote.origin} → {quote.destination}
                        </p>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Total:</span> {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(quote.total_cost || 0)}
                        </p>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Status:</span> {quote.status || 'Draft'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setQuoteData(quote);
                            setActiveTab('preview');
                          }}
                          className="flex-1"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setQuoteData(quote);
                            setActiveTab('create');
                          }}
                          className="flex-1"
                        >
                          <Settings className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
