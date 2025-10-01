import React, { useState, useEffect } from 'react';
import { RFPQuote, Company, Contact } from '@/api/entities';
import { User } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, Eye, Mail, Download, Settings, Upload, Users, BarChart3, CalendarDays } from 'lucide-react';
import LitSidebar from '../components/ui/LitSidebar';
import LitPageHeader from '../components/ui/LitPageHeader';
import LitPanel from '../components/ui/LitPanel';
import LitWatermark from '../components/ui/LitWatermark';

// existing builder/preview kept for future wiring

export default function RFPStudio() {
  const [activeTab, setActiveTab] = useState('overview');
  const rfps = [
    { id: 'rfp_001', name: 'Pride Mobility — Ocean 2026', client: 'Pride Mobility', status: 'Draft', due: 'Dec 12' },
    { id: 'rfp_002', name: 'Shaw Industries — LCL Program', client: 'Shaw Industries', status: 'Active', due: 'Jan 08' },
    { id: 'rfp_003', name: 'Wahoo Fitness — Q1 Air', client: 'Wahoo Fitness', status: 'Outreach', due: 'Nov 30' }
  ];
  const [activeId, setActiveId] = useState(rfps[0].id);
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

  const hasAccess = true;

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

  // keep page accessible; gating can be added later

  return (
    <div className="relative px-2 md:px-5 py-3 min-h-screen">
      <LitWatermark />
      <div className="max-w-7xl mx-auto">
        <LitPageHeader title="RFP Studio">
          <Button className="bg-gradient-to-r from-blue-600 to-blue-500 text-white"><Plus className="w-4 h-4 mr-1"/> New RFP</Button>
          <Button variant="outline" className="border-slate-200"><Upload className="w-4 h-4 mr-1"/> Import</Button>
          <Button variant="outline" className="border-slate-200"><FileText className="w-4 h-4 mr-1"/> Templates</Button>
        </LitPageHeader>

        <div className="w-full flex gap-[5px]">
          <aside className="hidden md:block w-[300px] shrink-0">
            <LitSidebar title="RFPs">
              <div className="space-y-3">
                {rfps.map(r => (
                  <button key={r.id} onClick={()=>setActiveId(r.id)} className={`w-full text-left p-3 rounded-xl border ${activeId===r.id? 'bg-white ring-2 ring-violet-300 border-slate-200':'bg-white/90 border-slate-200 hover:bg-white'}`}>
                    <div className="text-sm font-semibold text-[#23135b] truncate">{r.name}</div>
                    <div className="mt-1 text-xs text-slate-600 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">{r.status}</span>
                      <span className="text-slate-500">Due {r.due}</span>
                    </div>
                  </button>
                ))}
              </div>
            </LitSidebar>
          </aside>

          <main className="flex-1 min-w-0 relative">
            <LitWatermark />
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="proposal">Proposal</TabsTrigger>
                <TabsTrigger value="financials">Financials</TabsTrigger>
                <TabsTrigger value="vendors">Vendors</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="export">Export & Outreach</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <LitPanel title="Active RFPs"><div className="text-3xl font-black text-slate-900">3</div><p className="text-xs text-slate-500 mt-1">+1 this week</p></LitPanel>
                  <LitPanel title="Avg Response Time"><div className="text-3xl font-black text-slate-900">2.4d</div><p className="text-xs text-slate-500 mt-1">-0.3d vs prev</p></LitPanel>
                  <LitPanel title="# Vendors Invited"><div className="text-3xl font-black text-slate-900">12</div><p className="text-xs text-slate-500 mt-1">+2 new</p></LitPanel>
                  <LitPanel title="On-Time Milestones"><div className="text-3xl font-black text-slate-900">92%</div><p className="text-xs text-slate-500 mt-1">green status</p></LitPanel>
                </div>
                <LitPanel title="Timeline">
                  <div className="h-40 flex items-center justify-center text-slate-500 text-sm">Timeline chart placeholder</div>
                </LitPanel>
              </TabsContent>

              <TabsContent value="proposal" className="mt-6 space-y-6">
                <LitPanel title="Executive Summary">
                  <textarea className="w-full h-40 p-3 border rounded-lg" placeholder="Draft your executive summary here..."/>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" className="bg-violet-600 text-white"><BarChart3 className="w-4 h-4 mr-1"/> AI Assist</Button>
                    <Button size="sm" variant="outline">Refine with AI</Button>
                    <Button size="sm" variant="outline">Generate Talk Tracks</Button>
                  </div>
                </LitPanel>
                <LitPanel title="Solution Offering">
                  <textarea className="w-full h-32 p-3 border rounded-lg" placeholder="Describe your solution..."/>
                </LitPanel>
              </TabsContent>

              <TabsContent value="financials" className="mt-6 space-y-6">
                <LitPanel title="Savings Model">
                  <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Baseline vs Proposed bar chart</div>
                </LitPanel>
              </TabsContent>

              <TabsContent value="vendors" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {["MSC","MAERSK","CMA","HAPAG","ONE","HMM"].map((v)=>(
                    <LitPanel key={v} title={v}>
                      <div className="text-sm text-slate-600">Contacts: 2</div>
                      <div className="mt-2"><Button size="sm" className="bg-blue-600 text-white"><Mail className="w-4 h-4 mr-1"/> Invite</Button></div>
                    </LitPanel>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="mt-6">
                <LitPanel title="Milestones">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {['Kickoff','Vendor Q&A','Proposal Draft','Submission'].map((m)=>(<div key={m} className="p-3 rounded-lg border">{m}</div>))}
                  </div>
                </LitPanel>
              </TabsContent>

              <TabsContent value="export" className="mt-6 space-y-4">
                <div className="flex gap-2">
                  <Button className="bg-blue-600 text-white">Export PDF</Button>
                  <Button variant="outline">Export HTML</Button>
                  <Button variant="outline">Add to Campaign</Button>
                </div>
                <LitPanel title="Preview">
                  <div className="h-56 flex items-center justify-center text-slate-500 text-sm">Proposal preview placeholder</div>
                </LitPanel>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </div>
  );
}
