import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2, Globe, Bookmark, BookmarkCheck, Mail, X, Ship, Plane, Truck, Train, Lock, Loader2, Sparkles
} from 'lucide-react';

import { Contact, Note } from '@/api/entities';
import { createPageUrl } from '@/utils';
import { postSearchCompanies, getCompanyShipments } from '@/lib/api';
import { enrichCompany } from '@/api/functions';

import OverviewTab from './detail_tabs/OverviewTab';
import ShipmentsTab from './detail_tabs/ShipmentsTab';
import ContactsTab from './detail_tabs/ContactsTab';
import EnrichmentTab from './detail_tabs/EnrichmentTab';
import NotesTab from './detail_tabs/NotesTab';
import { useFeatureFlags } from '@/store/featureFlags';

export default function CompanyDetailModal({ company, isOpen, onClose, onSave, user, isSaved = false }) {
  const { companyDrawerPremium } = useFeatureFlags();
  const [currentCompanyDetails, setCurrentCompanyDetails] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  
  const companyId = company?.id;

  const loadRelatedData = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const overviewPromise = postSearchCompanies({ company_id: String(companyId), limit: 1, offset: 0 });
      const shipmentsPromise = getCompanyShipments({ company_id: String(companyId), limit: 50, offset: 0 });
      const contactPromise = Contact.filter({ company_id: companyId }, '-created_date', 50);
      const notesPromise = Note.filter({ company_id: companyId }, '-created_date', 50);

      const [overviewRes, shipmentsRes, contactData, noteData] = await Promise.all([
        overviewPromise,
        shipmentsPromise,
        contactPromise,
        notesPromise
      ]);
      const ovRaw = Array.isArray(overviewRes?.data) && overviewRes.data.length ? overviewRes.data[0] : null;
      if (ovRaw) {
        const mapped = {
          id: ovRaw.company_id,
          name: ovRaw.company_name || 'Unknown',
          shipments_12m: ovRaw.shipments_12m || 0,
          last_seen: ovRaw.last_activity || null,
          top_route: Array.isArray(ovRaw.top_routes) && ovRaw.top_routes.length
            ? (typeof ovRaw.top_routes[0] === 'string' ? ovRaw.top_routes[0] : `${ovRaw.top_routes[0]?.o || ''} → ${ovRaw.top_routes[0]?.d || ''}`)
            : undefined,
          top_carriers: Array.isArray(ovRaw.top_carriers) ? ovRaw.top_carriers : [],
          mode_breakdown: Array.isArray(ovRaw.mode_breakdown) ? ovRaw.mode_breakdown : [],
        };
        setCurrentCompanyDetails(mapped);
      }
      const shp = Array.isArray(shipmentsRes?.data) ? shipmentsRes.data : (shipmentsRes?.results || shipmentsRes?.rows || []);
      setShipments(Array.isArray(shp) ? shp : []);
      setContacts(contactData);
      setNotes(noteData);

    } catch (error) {
      console.error("Error loading related company data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (isOpen && companyId) {
      loadRelatedData();
    } else {
      setCurrentCompanyDetails(null);
      setShipments([]);
      setNotes([]);
      setContacts([]);
    }
  }, [isOpen, companyId, loadRelatedData]);

  const handleAddContact = async (contactData) => {
    await Contact.create({ ...contactData, company_id: companyId });
    loadRelatedData();
  };

  const handleAddNote = async (noteContent) => {
    await Note.create({ content: noteContent, company_id: companyId });
    loadRelatedData();
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(company);
    } catch (error) {
      console.error("Error saving company:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnrichCompany = async () => {
    setIsEnriching(true);
    try {
      const response = await enrichCompany({ company_id: companyId });
      if (response.data?.ok) {
        // Refresh the company details to show updated enrichment data
        loadRelatedData();
      } else {
        alert("Enrichment failed: " + (response.data?.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error enriching company:", error);
      alert("Enrichment failed: " + error.message);
    } finally {
      setIsEnriching(false);
    }
  };
  
  const handleStartOutreach = () => {
    const emailCenterUrl = createPageUrl('EmailCenter') + `?company_id=${companyId}`;
    window.location.href = emailCenterUrl;
    onClose();
  };

  const getModeIcons = (modeBreakdown) => {
    if (!modeBreakdown || modeBreakdown.length === 0) return [];
    
    const total = modeBreakdown.reduce((sum, item) => sum + item.cnt, 0);

    return modeBreakdown
      .map((item) => {
        let icon, color;
        switch (item.mode.toLowerCase()) {
          case 'ocean':
            icon = Ship;
            color = 'text-blue-500';
            break;
          case 'air':
            icon = Plane;
            color = 'text-purple-500';
            break;
          case 'truck':
            icon = Truck;
            color = 'text-green-500';
            break;
          case 'rail':
            icon = Train;
            color = 'text-purple-600';
            break;
          default:
            icon = Ship;
            color = 'text-gray-500';
        }
        return { type: item.mode, percentage: total > 0 ? Math.round((item.cnt / total) * 100) : 0, icon, color };
      })
      .sort((a, b) => b.percentage - a.percentage);
  };

  if (!isOpen || !company) return null;

  const isSavedByUser = !!isSaved;
  const modeIcons = getModeIcons(currentCompanyDetails?.mode_breakdown);
  const displayCompany = currentCompanyDetails || company;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 md:rounded-2xl rounded-none md:inset-auto inset-0">
          <DialogHeader className="p-6 border-b">
            <div className="flex justify-between items-start gap-4">
              <div>
                <DialogTitle className="text-2xl font-bold text-gray-900">{displayCompany.name}</DialogTitle>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  <div className="flex items-center gap-1.5"><Building2 className="w-4 h-4" /><span>ID: {companyId}</span></div>
                  <div className="flex items-center gap-1.5"><Globe className="w-4 h-4" /><span>Trade Data Available</span></div>
                </div>
                {modeIcons.length > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    {modeIcons.map((mode) => {
                      const IconComponent = mode.icon;
                      return (
                        <Badge key={mode.type} variant="outline" className="flex items-center gap-1.5 pl-2 pr-2.5 py-1">
                          <IconComponent className={`w-4 h-4 ${mode.color}`} />
                          <span className="font-medium text-gray-700">{mode.type.charAt(0).toUpperCase() + mode.type.slice(1)}</span>
                          <span className="text-gray-500">{mode.percentage}%</span>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" onClick={handleSave} variant="outline" className="flex items-center gap-2" disabled={isSaving || isSavedByUser}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSavedByUser ? <BookmarkCheck className="w-4 h-4 text-blue-600" /> : <Bookmark className="w-4 h-4" />}
                  {isSavedByUser ? 'Saved' : 'Save'}
                </Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleStartOutreach}>
                  <Mail className="w-4 h-4 mr-2" /> 
                  Start Outreach
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-grow overflow-hidden">
            <Tabs defaultValue="overview" className="h-full flex flex-col">
              <div className="px-6 border-b">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="shipments">Shipments ({shipments.length})</TabsTrigger>
                  {companyDrawerPremium ? (
                    <TabsTrigger value="contacts" disabled={!isSavedByUser}>{!isSavedByUser && <Lock className="w-3 h-3 mr-1.5" />}Contacts</TabsTrigger>
                  ) : null}
                  <TabsTrigger value="ai_insights">
                    <Sparkles className="w-3 h-3 mr-1.5" />AI Insights
                  </TabsTrigger>
                  <TabsTrigger value="notes" disabled={!isSavedByUser}>Notes ({notes.length})</TabsTrigger>
                </TabsList>
              </div>
              <div className="flex-grow overflow-auto">
                <TabsContent value="overview" className="p-6">
                  <OverviewTab company={currentCompanyDetails} shipments={shipments} isLoading={isLoading} />
                </TabsContent>
                <TabsContent value="shipments" className="p-6">
                  <ShipmentsTab
                    shipments={shipments}
                    isLoading={isLoading}
                    onRowClick={(row) => alert(JSON.stringify(row, null, 2))}
                  />
                </TabsContent>
                <TabsContent value="contacts" className="p-6">
                  {isSavedByUser ? (
                    <ContactsTab 
                      contacts={contacts} 
                      companyId={companyId} 
                      company={displayCompany}
                      onAddContact={handleAddContact} 
                      isGated={false}
                      onUnlock={handleSave} 
                      isLoading={isSaving} 
                    />
                  ) : (
                    <div className="text-sm text-gray-600">
                      Save this company to manage contacts.
                      <div className="mt-3">
                        <Button size="sm" variant="outline" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Company'}</Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="ai_insights" className="p-6">
                  <EnrichmentTab 
                    company={currentCompanyDetails || company}
                    onCompanyUpdate={setCurrentCompanyDetails}
                    user={user} 
                    isGated={false}
                    onUnlock={handleSave} 
                    isLoading={isSaving}
                    onEnrich={handleEnrichCompany}
                    isEnriching={isEnriching}
                  />
                </TabsContent>
                <TabsContent value="notes" className="p-6">
                  {isSavedByUser ? (
                    <NotesTab notes={notes} onAddNote={handleAddNote} isLoading={isLoading} />
                  ) : (
                    <div className="text-sm text-gray-600">
                      Save this company to add and view notes.
                      <div className="mt-3">
                        <Button size="sm" variant="outline" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Company'}</Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-4 right-4 rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}