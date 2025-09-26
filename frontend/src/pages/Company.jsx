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
import { enrichCompany } from "@/api/functions";
import { postSearchCompanies, getCompanyShipments } from "@/lib/api";

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
      await enrichCompany({ company_id: companyId });
      await load();
    } catch (e) {
      console.error('Enrich error', e);
    } finally {
      setIsEnriching(false);
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{summary?.company_name || 'Company'}</h1>
          <p className="text-sm text-gray-600">ID: {companyId}</p>
          {summary && (
            <div className="mt-2 text-sm text-gray-700 space-y-1">
              <div><span className="text-gray-500">Shipments (12M):</span> <span className="font-semibold">{new Intl.NumberFormat().format(summary.shipments_12m || 0)}</span></div>
              <div><span className="text-gray-500">Last Activity:</span> <span className="font-semibold">{summary.last_activity ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(summary.last_activity)) : 'N/A'}</span></div>
              <div><span className="text-gray-500">Top Route:</span> <span className="font-semibold">{(summary.top_routes && summary.top_routes[0]) || '—'}</span></div>
              <div><span className="text-gray-500">Top Carrier:</span> <span className="font-semibold">{(summary.top_carriers && summary.top_carriers[0]) || '—'}</span></div>
            </div>
          )}
        </div>
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

