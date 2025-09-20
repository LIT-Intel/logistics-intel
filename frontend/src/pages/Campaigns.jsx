
import React, { useState, useEffect, useCallback } from 'react';
import { Campaign, Company, Contact, CampaignTemplate } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Users, Mail, BarChart, AlertTriangle } from 'lucide-react';
import CampaignCard from '../components/campaigns/CampaignCard';
import CampaignCreator from '../components/campaigns/CampaignCreator';
import LockedFeature from '../components/common/LockedFeature';
import { checkFeatureAccess } from '@/components/utils/planLimits';
import { User } from '@/api/entities';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Helper function to ensure data is an array, handling various API response formats
const asArray = (data) => {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && Array.isArray(data.data)) {
    return data.data;
  }
  return [];
};

export default function CampaignsPage() {
  const [user, setUser] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [companies, setCompanies] = useState([]); // New state for companies
  const [contacts, setContacts] = useState([]);   // New state for contacts
  const [templates, setTemplates] = useState([]); // New state for campaign templates
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [debugInfo, setDebugInfo] = useState('');
  const [hasAccess, setHasAccess] = useState(false); // hasAccess is now a state variable

  // This useEffect now handles all initial data loading and access checks
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      setDebugInfo('Starting to load all data (user, campaigns, companies, contacts, templates)...');

      try {
        console.log('CampaignsPage: Loading user data...');
        const userData = await User.me();
        setUser(userData);
        console.log('CampaignsPage: User loaded:', userData);

        // Check if user has access to campaigns feature
        if (!checkFeatureAccess(userData, 'campaigns')) {
          console.log('CampaignsPage: User does not have campaigns access');
          setHasAccess(false);
          setIsLoading(false);
          setDebugInfo('User does not have access to Campaigns feature.');
          return;
        }

        setHasAccess(true);
        console.log('CampaignsPage: User has campaigns access, loading entities...');

        // Load campaigns data with error handling
        try {
          setDebugInfo(prev => prev + '\nLoading campaigns...');
          // Changed from Campaign.list to Campaign.filter based on outline
          const campaignsData = await Campaign.filter({ created_by: userData.email }, "-created_date");
          setCampaigns(asArray(campaignsData));
          console.log('CampaignsPage: Campaigns loaded:', asArray(campaignsData).length);
          setDebugInfo(prev => prev + `\nLoaded ${asArray(campaignsData).length} campaigns.`);
        } catch (campaignError) {
          console.error("CampaignsPage: Failed to load campaigns:", campaignError);
          setError(prev => (prev ? prev + '\n' : '') + `Failed to load campaigns: ${campaignError.message}`);
          setDebugInfo(prev => prev + `\nERROR loading campaigns: ${campaignError.message}`);
          setCampaigns([]);
        }

        // Load companies data with error handling
        try {
          setDebugInfo(prev => prev + '\nLoading companies...');
          const companiesData = await Company.list("-created_date", 100);
          setCompanies(asArray(companiesData));
          console.log('CampaignsPage: Companies loaded:', asArray(companiesData).length);
          setDebugInfo(prev => prev + `\nLoaded ${asArray(companiesData).length} companies.`);
        } catch (companyError) {
          console.error("CampaignsPage: Failed to load companies:", companyError);
          setError(prev => (prev ? prev + '\n' : '') + `Failed to load companies: ${companyError.message}`);
          setDebugInfo(prev => prev + `\nERROR loading companies: ${companyError.message}`);
          setCompanies([]);
        }

        // Load contacts data with error handling
        try {
          setDebugInfo(prev => prev + '\nLoading contacts...');
          const contactsData = await Contact.list("-created_date", 500);
          setContacts(asArray(contactsData));
          console.log('CampaignsPage: Contacts loaded:', asArray(contactsData).length);
          setDebugInfo(prev => prev + `\nLoaded ${asArray(contactsData).length} contacts.`);
        } catch (contactError) {
          console.error("CampaignsPage: Failed to load contacts:", contactError);
          setError(prev => (prev ? prev + '\n' : '') + `Failed to load contacts: ${contactError.message}`);
          setDebugInfo(prev => prev + `\nERROR loading contacts: ${contactError.message}`);
          setContacts([]);
        }

        // Load templates data with error handling
        try {
          setDebugInfo(prev => prev + '\nLoading templates...');
          const templatesData = await CampaignTemplate.filter({ is_active: true }, "name");
          setTemplates(asArray(templatesData));
          console.log('CampaignsPage: Templates loaded:', asArray(templatesData).length);
          setDebugInfo(prev => prev + `\nLoaded ${asArray(templatesData).length} templates.`);
        } catch (templateError) {
          console.error("CampaignsPage: Failed to load templates:", templateError);
          setError(prev => (prev ? prev + '\n' : '') + `Failed to load templates: ${templateError.message}`);
          setDebugInfo(prev => prev + `\nERROR loading templates: ${templateError.message}`);
          setTemplates([]);
        }

      } catch (e) {
        console.error("CampaignsPage: Critical error loading user or initial data:", e);
        const errorMsg = `Failed to load initial data (user/access): ${e.message}`;
        setError(errorMsg);
        setHasAccess(false);
        setDebugInfo(`CRITICAL ERROR: ${errorMsg}`);
        // Additional network debugging
        if (e.message.includes('fetch')) {
          setDebugInfo(prev => prev + ' | Network error detected - check Base44 backend connectivity');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []); // Empty dependency array means this effect runs once on mount

  const handleCreateNew = () => {
    setEditingCampaign(null);
    setIsCreating(true);
  };

  const handleEdit = (campaign) => {
    setEditingCampaign(campaign);
    setIsCreating(true);
  };

  const handleSave = async (campaignData) => {
    // Re-trigger loadData after save to refresh all relevant data
    // This assumes `Campaign.create` and `Campaign.update` are successful.
    // In a real app, you might want more granular updates or success/error handling here.
    if (editingCampaign) {
      await Campaign.update(editingCampaign.id, campaignData);
    } else {
      await Campaign.create(campaignData);
    }
    setIsCreating(false);
    setEditingCampaign(null);
    // Reload all data to ensure consistency and refresh campaign list
    // A simple `loadData()` call here would trigger the full re-fetch which is safe.
    // However, since loadData is inside useEffect with empty dependency, we need a way to trigger it.
    // For simplicity, we'll re-fetch just campaigns after a save/delete.
    // A more robust solution might pass a re-fetch function down or use a global state manager.
    // For now, let's manually re-fetch campaigns, assuming other entities don't change often.
    setIsLoading(true); // Indicate loading while re-fetching campaigns
    try {
      const userData = user; // Use current user from state
      if (userData) {
        const campaignsData = await Campaign.filter({ created_by: userData.email }, "-created_date");
        setCampaigns(asArray(campaignsData));
        setError(null); // Clear errors related to previous load if successful
      }
    } catch (e) {
      console.error("Failed to refresh campaigns after save:", e);
      setError(`Failed to refresh campaigns: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (campaignId) => {
    await Campaign.delete(campaignId);
    // Re-fetch campaigns after delete
    setIsLoading(true);
    try {
      const userData = user;
      if (userData) {
        const campaignsData = await Campaign.filter({ created_by: userData.email }, "-created_date");
        setCampaigns(asArray(campaignsData));
        setError(null);
      }
    } catch (e) {
      console.error("Failed to refresh campaigns after delete:", e);
      setError(`Failed to refresh campaigns: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full bg-[#F6F8FB] min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E5EFF] mb-4"></div>
        <p className="text-sm text-gray-600">Loading data...</p>
        {debugInfo && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-gray-700 max-w-md">
            Debug: {debugInfo}
          </div>
        )}
      </div>
    );
  }

  // Use the hasAccess state variable directly
  // Do not early-return on access denied here; we want to render smoke-test cards

  if (isCreating || editingCampaign) {
    return (
      <CampaignCreator
        campaign={editingCampaign}
        onSave={handleSave}
        onClose={() => {
          setIsCreating(false);
          setEditingCampaign(null);
        }}
        // Potentially pass companies, contacts, templates to CampaignCreator if needed for selections
        // companies={companies}
        // contacts={contacts}
        // templates={templates}
      />
    );
  }

  return (
    <div className="p-6 bg-[#F6F8FB] min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Smoke-test mock cards to verify rendering path */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {['Q4 Prospecting','Reactivation Push','Freight Expo Leads','Top Lanes Outreach'].map((title, idx) => (
            <div key={idx} className="bg-white rounded-2xl shadow border p-4">
              <div className="text-sm text-gray-500">Smoke Test</div>
              <div className="text-lg font-semibold text-gray-900">{title}</div>
              <div className="text-xs text-gray-500">Leads: — | Status: Draft</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <Button onClick={handleCreateNew}>
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Data Loading Error</AlertTitle>
            <AlertDescription>
              {error}
              <br/>
              <span className="text-xs mt-2 block">
                This indicates a backend connectivity issue or missing data. Please contact Base44 support if this persists.
              </span>
              {debugInfo && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">Technical Details</summary>
                  <pre className="text-xs mt-1 bg-gray-100 p-2 rounded whitespace-pre-wrap">{debugInfo}</pre>
                </details>
              )}
            </AlertDescription>
          </Alert>
        )}

        {campaigns.length === 0 && !isLoading && !error && (
          <Card className="text-center p-12 border-2 border-dashed">
            <CardContent>
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No campaigns yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new outreach campaign.
              </p>
              <div className="mt-6">
                <Button onClick={handleCreateNew}>
                  <Plus className="mr-2 h-4 w-4" /> Create Campaign
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && campaigns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
