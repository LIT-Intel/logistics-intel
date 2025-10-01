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
import { postSearchCompanies, getCompanyShipments, enrichCompany, recallCompany } from "@/lib/api";
import LitPageHeader from "../components/ui/LitPageHeader";
import LitPanel from "../components/ui/LitPanel";
import LitWatermark from "../components/ui/LitWatermark";

export default function Company() {
  const { id } = useParams();
  const companyId = id;

  const [company, setCompany] = useState(null);
  const [summary, setSummary] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [shipmentsTotal, setShipmentsTotal] = useState(0);
  const [shipmentsPage, setShipmentsPage] = useState(1);
  const SHIP_PAGE_SIZE = 50;
  const [contacts, setContacts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnriching, setIsEnriching] = useState(false);
  const [recall, setRecall] = useState(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const [summaryRes, shipmentsRes, contactsRes, notesRes] = await Promise.all([
        postSearchCompanies({ company_ids: [String(companyId)], limit: 1, offset: 0 }),
        getCompanyShipments({ company_id: companyId, limit: SHIP_PAGE_SIZE, offset: (shipmentsPage - 1) * SHIP_PAGE_SIZE }),
        Contact.filter({ company_id: companyId }, '-created_date', 50),
        Note.filter({ company_id: companyId }, '-created_date', 50),
      ]);
      let sum = Array.isArray(summaryRes?.data) && summaryRes.data.length ? summaryRes.data[0] : null;
      if (!sum) {
        // fallback to singular param
        const fallback = await postSearchCompanies({ company_id: String(companyId), limit: 1, offset: 0 });
        sum = Array.isArray(fallback?.data) && fallback.data.length ? fallback.data[0] : null;
      }
      if (sum) {
        setSummary(sum);
        setCompany({
          shipments_12m: sum.shipments_12m,
          last_seen: sum.last_activity,
          top_route: Array.isArray(sum.top_routes) && sum.top_routes.length ? sum.top_routes[0] : undefined,
          top_carriers: Array.isArray(sum.top_carriers) ? sum.top_carriers : [],
          industry: null,
          hq_city: null,
          hq_country: null,
          domain: null,
          employee_count: null,
        });
      }
      const shp = Array.isArray(shipmentsRes?.data) ? shipmentsRes.data : [];
      setShipments(shp);
      setShipmentsTotal(typeof shipmentsRes?.total === 'number' ? shipmentsRes.total : shp.length);
      setContacts(contactsRes || []);
      setNotes(notesRes || []);
    } catch (e) {
      console.error('Company load error', e);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, shipmentsPage]);

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
      await enrichCompany({ company_id: String(companyId) });
      await load();
    } catch (e) {
      console.error('Enrich error', e);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleRecall = async () => {
    if (!companyId) return;
    const vendor = (import.meta?.env?.VITE_AI_VENDOR || process?.env?.NEXT_PUBLIC_AI_VENDOR || 'gemini');
    try {
      const r = await recallCompany({ company_id: String(companyId) });
      setRecall({ summary: r?.summary || '', bullets: Array.isArray(r?.bullets) ? r.bullets : [] });
    } catch (e) {
      console.error('Recall error', e);
      setRecall({ summary: '', bullets: [] });
      alert('Recall failed');
    }
  };

  if (!company && !isLoading) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Company not found</h2>
        <p className="text-gray-600">This company may not be saved yet. Go back to Search to discover and save companies.</p>
        <div className="mt-4"><Button variant="outline" onClick={() => window.location.href = '/app/search'}>Back to Search</Button></div>
      </div>
    );
  }

  return (
    <div className="relative px-2 md:px-5 py-3">
      <LitWatermark />
      <LitPageHeader title={summary?.company_name || 'Company'}>
        <div className="flex items-center gap-2">
          <Button
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
            onClick={() => { window.location.href = `/app/pre-call?company_id=${companyId}`; }}
          >
            Pre-Call Briefing
          </Button>
          <Button size="sm" onClick={handleEnrich} disabled={isEnriching} className="bg-purple-600 hover:bg-purple-700 text-white">
            {isEnriching ? 'Enriching…' : 'Enrich Now'}
          </Button>
          <Button size="sm" onClick={handleRecall} className="bg-indigo-600 hover:bg-indigo-700 text-white">Recall</Button>
        </div>
      </LitPageHeader>

      <LitPanel>
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
              {shipmentsTotal > SHIP_PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600">
                    Showing {Math.min(shipmentsTotal, shipmentsPage * SHIP_PAGE_SIZE) - SHIP_PAGE_SIZE + 1}-{Math.min(shipmentsTotal, shipmentsPage * SHIP_PAGE_SIZE)} of {shipmentsTotal}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={shipmentsPage <= 1 || isLoading} onClick={() => setShipmentsPage((p) => Math.max(1, p - 1))}>Prev</Button>
                    <Button variant="outline" size="sm" disabled={shipmentsPage * SHIP_PAGE_SIZE >= shipmentsTotal || isLoading} onClick={() => setShipmentsPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="contacts">
              <ContactsTab contacts={contacts} companyId={companyId} company={company} onAddContact={handleAddContact} isGated={false} onUnlock={() => {}} isLoading={false} />
            </TabsContent>
            <TabsContent value="ai_insights">
              <EnrichmentTab company={company || { id: companyId }} onCompanyUpdate={setCompany} user={null} isGated={false} onUnlock={() => {}} isLoading={false} onEnrich={handleEnrich} isEnriching={isEnriching} />
              {recall && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold">AI Recall</h3>
                  <p className="mt-2 text-sm whitespace-pre-wrap">{recall.summary}</p>
                  <ul className="list-disc pl-5 mt-2">
                    {(recall.bullets || []).map((b, i) => (
                      <li key={i} className="text-sm">{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>
            <TabsContent value="notes">
              <NotesTab notes={notes} onAddNote={handleAddNote} isLoading={isLoading} />
            </TabsContent>
          </div>
        </Tabs>
      </LitPanel>
    </div>
  );
}

