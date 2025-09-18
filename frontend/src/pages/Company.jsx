import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OverviewTab from "@/components/search/detail_tabs/OverviewTab";
import ShipmentsTab from "@/components/search/detail_tabs/ShipmentsTab";
import ContactsTab from "@/components/search/detail_tabs/ContactsTab";
import EnrichmentTab from "@/components/search/detail_tabs/EnrichmentTab";
import NotesTab from "@/components/search/detail_tabs/NotesTab";
import { Contact, Note } from "@/api/entities";
import { getCompanyOverview, getCompanyShipments, enrichCompany } from "@/api/functions";

export default function Company() {
  const { id } = useParams();
  const companyId = id;

  const [company, setCompany] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnriching, setIsEnriching] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const [overviewRes, shipmentsRes, contactsRes, notesRes] = await Promise.all([
        getCompanyOverview({ company_id: companyId }),
        getCompanyShipments({ company_id: companyId, limit: 50 }),
        Contact.filter({ company_id: companyId }, '-created_date', 50),
        Note.filter({ company_id: companyId }, '-created_date', 50),
      ]);
      if (overviewRes?.data?.ok) setCompany(overviewRes.data.result);
      if (shipmentsRes?.data?.ok) setShipments(shipmentsRes.data.results);
      setContacts(contactsRes || []);
      setNotes(notesRes || []);
    } catch (e) {
      console.error('Company load error', e);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleAddContact = async (contactData) => {
    await Contact.create({ ...contactData, company_id: companyId });
    load();
  };
  const handleAddNote = async (noteContent) => {
    await Note.create({ content: noteContent, company_id: companyId });
    load();
  };
  const handleEnrich = async () => {
    setIsEnriching(true);
    try {
      await enrichCompany({ company_id: companyId });
      await load();
    } catch (e) {
      console.error('Enrich error', e);
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company</h1>
          <p className="text-sm text-gray-600">ID: {companyId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { window.location.href = `/app/pre-call?company_id=${companyId}`; }}>
            Pre-Call Briefing
          </Button>
          <Button size="sm" onClick={handleEnrich} disabled={isEnriching} className="bg-purple-600 hover:bg-purple-700 text-white">
            {isEnriching ? 'Enriching…' : 'Enrich Now'}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm">
        <Tabs defaultValue="overview" className="w-full">
          <div className="px-4 pt-4 border-b">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="shipments">Shipments</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="ai_insights">AI Insights</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
          </div>
          <div className="p-4">
            <TabsContent value="overview">
              <OverviewTab company={company} shipments={shipments} isLoading={isLoading} />
            </TabsContent>
            <TabsContent value="shipments">
              <ShipmentsTab shipments={shipments} isLoading={isLoading} />
            </TabsContent>
            <TabsContent value="contacts">
              <ContactsTab contacts={contacts} companyId={companyId} company={company} onAddContact={handleAddContact} isGated={false} onUnlock={() => {}} isLoading={false} />
            </TabsContent>
            <TabsContent value="ai_insights">
              <EnrichmentTab company={company || { id: companyId }} onCompanyUpdate={setCompany} user={null} isGated={false} onUnlock={() => {}} isLoading={false} onEnrich={handleEnrich} isEnriching={isEnriching} />
            </TabsContent>
            <TabsContent value="notes">
              <NotesTab notes={notes} onAddNote={handleAddNote} isLoading={isLoading} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

