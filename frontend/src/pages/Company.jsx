import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Contact, Note } from "@/api/entities";
import { postSearchCompanies, getCompanyShipments, recallCompany } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import LitPanel from "../components/ui/LitPanel";
import LitWatermark from "../components/ui/LitWatermark";
import { ingestWorkbook } from "@/lib/rfp/ingest";
import CompanyHeader from "@/components/company/CompanyHeader";
import CompanyFirmographics from "@/components/company/CompanyFirmographics";
import FeaturedContact from "@/components/company/FeaturedContact";
import ContactsList from "@/components/company/ContactsList";
import RfpPanel from "@/components/company/RfpPanel";
import PreCallPanel from "@/components/company/PreCallPanel";

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
  const [enrichWhich, setEnrichWhich] = useState(null); // 'company' | 'contacts' | null
  const { toast } = useToast();
  const [recall, setRecall] = useState(null);

  // RFP (lanes) payload persisted locally per company
  const [rfpPayload, setRfpPayload] = useState(null);
  const rfpKey = `lit_rfp_payload_${companyId}`;

  function deriveKpisFromPayload(payload) {
    if (!payload || !Array.isArray(payload.lanes)) return null;
    const shipments12m = payload.lanes.reduce((s, ln) => s + (Number(ln?.demand?.shipments_per_year || 0)), 0);
    const origins = new Map(); const dests = new Map();
    for (const ln of payload.lanes) {
      const o = ln?.origin?.port || ln?.origin?.country; if (o) origins.set(o, (origins.get(o) || 0) + 1);
      const d = ln?.destination?.port || ln?.destination?.country; if (d) dests.set(d, (dests.get(d) || 0) + 1);
    }
    const originsTop = Array.from(origins.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    const destsTop = Array.from(dests.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    return { shipments12m, originsTop, destsTop };
  }

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
        // fallback: singular param
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

  // Load saved lanes (RFP) for this company and derive KPIs for Overview
  useEffect(() => {
    try {
      const raw = localStorage.getItem(rfpKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setRfpPayload(saved);
        const k = deriveKpisFromPayload(saved);
        if (k) {
          setCompany(prev => ({
            ...(prev || {}),
            shipments_12m: k.shipments12m,
            top_route: (k.originsTop && k.destsTop && k.originsTop.length && k.destsTop.length) ? `${k.originsTop[0]} → ${k.destsTop[0]}` : undefined,
            top_carriers: [],
          }));
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleAddContact = async (contactData) => {
    await Contact.create({ ...contactData, company_id: companyId });
    load();
  };

  const handleAddNote = async (noteContent) => {
    await Note.create({ content: noteContent, company_id: companyId });
    load();
  };

  const handleEnrichCompany = async () => {
    if (!companyId) return;
    setEnrichWhich('company');
    setIsEnriching(true);
    try {
      const res = await fetch('/api/lit/crm/lusha/enrichCompany', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ company_id: String(companyId) })
      });
      if (!res.ok) throw new Error(`enrichCompany ${res.status}`);
      const data = await res.json();
      // Update firmographics and contacts in UI
      if (data && data.company) {
        setSummary((prev) => prev ? { ...prev, company_name: data.company.name } : prev);
        setCompany((prev) => ({ ...(prev || {}), 
          industry: data.company.industry || (prev && prev.industry) || null,
          hq_city: data.company.hqCity || (prev && prev.hq_city) || null,
          hq_country: data.company.hqCountry || (prev && prev.hq_country) || null,
          domain: data.company.domain || (prev && prev.domain) || null,
          employee_count: data.company.size || (prev && prev.employee_count) || null,
          confidence: data.company.confidence ?? (prev && prev.confidence)
        }));
      }
      if (Array.isArray(data?.contacts)) {
        setContacts(data.contacts.map(c => ({
          id: c.id || c.fullName,
          full_name: c.fullName || c.name,
          title: c.title || '',
          email: c.email || '',
          phone: c.phone || '',
          linkedin: c.linkedin || '',
          confidence: c.confidence,
          isPrimary: !!c.isPrimary,
        })));
      }
    } catch (e) {
      console.error('Enrich company failed', e);
      toast({ title: 'Enrichment failed. Please try again.' });
    } finally {
      setIsEnriching(false);
      setEnrichWhich(null);
    }
  };

  const handleEnrichContacts = async () => {
    if (!companyId) return;
    setEnrichWhich('contacts');
    setIsEnriching(true);
    try {
      const res = await fetch('/api/lit/crm/lusha/enrichContacts', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ company_id: String(companyId) })
      });
      if (!res.ok) throw new Error(`enrichContacts ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data?.contacts)) {
        setContacts(data.contacts.map(c => ({
          id: c.id || c.fullName,
          full_name: c.fullName || c.name,
          title: c.title || '',
          email: c.email || '',
          phone: c.phone || '',
          linkedin: c.linkedin || '',
          confidence: c.confidence,
          isPrimary: !!c.isPrimary,
        })));
      }
      if (data && data.company) {
        setCompany((prev) => ({ ...(prev || {}), 
          industry: data.company.industry || (prev && prev.industry) || null,
          hq_city: data.company.hqCity || (prev && prev.hq_city) || null,
          hq_country: data.company.hqCountry || (prev && prev.hq_country) || null,
          domain: data.company.domain || (prev && prev.domain) || null,
          employee_count: data.company.size || (prev && prev.employee_count) || null,
          confidence: data.company.confidence ?? (prev && prev.confidence)
        }));
      }
    } catch (e) {
      console.error('Enrich contacts failed', e);
      toast({ title: 'Enrichment failed. Please try again.' });
    } finally {
      setIsEnriching(false);
      setEnrichWhich(null);
    }
  };

  const handleRecall = async () => {
    if (!companyId) return;
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
      {summary && (
        <CompanyHeader
          company={{ id: String(companyId), name: summary?.company_name || 'Company', confidence: (company && company.confidence) || undefined }}
          onEnrichCompany={handleEnrichCompany}
          onEnrichContacts={handleEnrichContacts}
          loading={enrichWhich}
        />
      )}

      <LitPanel>
        <Tabs defaultValue="overview" className="w-full">
          <div className="px-4 pt-4 border-b">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="precall">Pre-Call</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="shipments">Shipments</TabsTrigger>
              <TabsTrigger value="rfp">RFP</TabsTrigger>
            </TabsList>
          </div>
          <div className="p-4">
            <TabsContent value="overview" className="space-y-4">
              {Array.isArray(contacts) && contacts.find(c => c.isPrimary) && (
                <FeaturedContact c={contacts.find(c => c.isPrimary)} onSetPrimary={(id)=> setContacts(prev=> prev.map(c=> ({...c, isPrimary: c.id===id})))} />
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <CompanyFirmographics company={{ id: String(companyId), name: summary?.company_name || 'Company', domain: company?.domain, size: company?.employee_count, linkedin: company?.linkedin, confidence: company?.confidence, industry: company?.industry, hqCity: company?.hq_city, hqCountry: company?.hq_country }} />
                <RfpPanel primary={(Array.isArray(contacts) && contacts.find(c => c.isPrimary)) || undefined} />
              </div>
              <ContactsList rows={contacts} onSelect={()=>{}} onSetPrimary={(id)=> setContacts(prev=> prev.map(c=> ({...c, isPrimary: c.id===id})))} />
            </TabsContent>

            <TabsContent value="precall" className="space-y-4">
              <PreCallPanel company={{ id: String(companyId), name: summary?.company_name || 'Company' }} />
            </TabsContent>

            <TabsContent value="contacts" className="space-y-4">
              <ContactsList rows={contacts} onSelect={()=>{}} onSetPrimary={(id)=> setContacts(prev=> prev.map(c=> ({...c, isPrimary: c.id===id})))} />
              <CompanyFirmographics company={{ id: String(companyId), name: summary?.company_name || 'Company', domain: company?.domain, size: company?.employee_count, linkedin: company?.linkedin, confidence: company?.confidence, industry: company?.industry, hqCity: company?.hq_city, hqCountry: company?.hq_country }} />
            </TabsContent>

            <TabsContent value="shipments" className="space-y-4">
              <Card className="rounded-2xl border shadow-sm">
                <CardContent className="p-6 text-sm text-muted-foreground">Shipments table placeholder. (Wire to /public/getCompanyShipments)</CardContent>
              </Card>

              <LitPanel title="Upload Lanes (RFP Data)">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    id="company-lanes-file"
                    type="file"
                    accept=".xlsx,.xls,.csv,application/json"
                    className="hidden"
                    onChange={async (e) => {
                      try {
                        const f = e.target.files && e.target.files[0]; if (!f) return;
                        const payload = await ingestWorkbook(f);
                        setRfpPayload(payload);
                        try { localStorage.setItem(rfpKey, JSON.stringify(payload)); } catch {}
                        const k = deriveKpisFromPayload(payload);
                        if (k) {
                          setCompany(prev => ({
                            ...(prev || {}),
                            shipments_12m: k.shipments12m,
                            top_route: (k.originsTop && k.destsTop && k.originsTop.length && k.destsTop.length) ? `${k.originsTop[0]} → ${k.destsTop[0]}` : undefined,
                            top_carriers: [],
                          }));
                        }
                        const el = document.getElementById('company-lanes-file'); if (el) el.value = '';
                      } catch { alert('Import failed'); }
                    }}
                  />
                  <Button variant="outline" onClick={() => { const el = document.getElementById('company-lanes-file'); if (el) el.click(); }}>Import</Button>
                  <Button variant="outline" onClick={() => { try { localStorage.setItem(rfpKey, JSON.stringify(rfpPayload || {})); alert('Saved'); } catch { alert('Save failed'); } }}>Save</Button>
                  <Button variant="outline" className="text-red-600" onClick={() => { try { localStorage.removeItem(rfpKey); } catch {} setRfpPayload(null); alert('Reset'); }}>Reset</Button>
                </div>

                {rfpPayload && Array.isArray(rfpPayload.lanes) && rfpPayload.lanes.length > 0 ? (
                  <div className="overflow-auto">
                    <table className="w-full text-sm border border-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="p-2 border">Service</th>
                          <th className="p-2 border">Equipment</th>
                          <th className="p-2 border">POL</th>
                          <th className="p-2 border">POD</th>
                          <th className="p-2 border">Origin Country</th>
                          <th className="p-2 border">Dest Country</th>
                          <th className="p-2 border">Shpts/Year</th>
                          <th className="p-2 border">Avg Kg</th>
                          <th className="p-2 border">Avg CBM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rfpPayload.lanes.map((ln, i) => (
                          <tr key={i}>
                            <td className="p-2 border">{ln.mode || '—'}</td>
                            <td className="p-2 border">{ln.equipment || '—'}</td>
                            <td className="p-2 border">{ln.origin?.port || '—'}</td>
                            <td className="p-2 border">{ln.destination?.port || '—'}</td>
                            <td className="p-2 border">{ln.origin?.country || '—'}</td>
                            <td className="p-2 border">{ln.destination?.country || '—'}</td>
                            <td className="p-2 border">{ln.demand?.shipments_per_year || 0}</td>
                            <td className="p-2 border">{ln.demand?.avg_weight_kg || 0}</td>
                            <td className="p-2 border">{ln.demand?.avg_volume_cbm || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">No uploaded lanes.</div>
                )}
              </LitPanel>

              {shipmentsTotal > SHIP_PAGE_SIZE && (
                <div className="flex items-center justify_between mt-4">
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

            <TabsContent value="rfp" className="space-y-4">
              <RfpPanel primary={(Array.isArray(contacts) && contacts.find(c => c.isPrimary)) || undefined} />
              <div className="text-sm text-muted-foreground">Assign this contact to the active campaign or RFP. Add sequencing later.</div>
            </TabsContent>
          </div>
        </Tabs>
      </LitPanel>
    </div>
  );
}