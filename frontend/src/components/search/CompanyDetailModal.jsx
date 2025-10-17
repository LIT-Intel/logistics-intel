import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2, Globe, Bookmark, BookmarkCheck, Mail, X, Ship, Plane, Truck, Train, Lock, Loader2, TrendingUp, Box
} from 'lucide-react';
import { BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

import { Contact, Note } from '@/api/entities';
import { createPageUrl } from '@/utils';
import { postSearchCompanies, getCompanyShipments, enrichCompany } from '@/lib/api';
import { hasFeature } from '@/lib/access';

// Replaced OverviewTab with inline Profile content per spec
import ShipmentsTab from './detail_tabs/ShipmentsTab';
import ContactsTab from './detail_tabs/ContactsTab';
// Removed KPI/AI enrichment and Notes per new spec
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
  const isWhitelisted = String(user?.email || '').toLowerCase() === 'vraymond@logisticintel.com' || String(user?.email || '').toLowerCase() === 'support@logisticintel.com';
  
  const companyId = company?.id;
  const canViewContacts = hasFeature('contacts') || isWhitelisted;

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
      const ovRaw = Array.isArray(overviewRes?.items) && overviewRes.items.length ? overviewRes.items[0] : null;
      if (ovRaw) {
        const mapped = {
          id: ovRaw.company_id,
          name: ovRaw.company_name || 'Unknown',
          shipments_12m: ovRaw.shipments_12m ?? ovRaw.shipments ?? 0,
          last_seen: (ovRaw.last_activity && ovRaw.last_activity.value) || ovRaw.lastShipmentDate || null,
          total_teus: ovRaw.total_teus ?? null,
          growth_rate: ovRaw.growth_rate ?? null,
          hq_city: ovRaw.hq_city || null,
          hq_state: ovRaw.hq_state || null,
          domain: ovRaw.domain || null,
          website: ovRaw.website || null,
          top_route: (Array.isArray(ovRaw.originsTop) && Array.isArray(ovRaw.destsTop))
            ? `${ovRaw.originsTop[0]?.v || ''} → ${ovRaw.destsTop[0]?.v || ''}`
            : undefined,
          top_carriers: Array.isArray(ovRaw.carriersTop) ? ovRaw.carriersTop.map(c => c.v) : [],
          mode_breakdown: Array.isArray(ovRaw.modes) ? ovRaw.modes.map(m => ({ mode: String(m).toLowerCase(), cnt: 0 })) : [],
        };
        setCurrentCompanyDetails(mapped);
      }
      const shp = Array.isArray(shipmentsRes?.rows) ? shipmentsRes.rows : [];
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
      await enrichCompany({ company_id: String(companyId) });
      // Refresh after queuing enrichment
      loadRelatedData();
    } catch (error) {
      console.error("Error enriching company:", error);
      alert("Enrichment failed: " + (error?.message || String(error)));
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

  // Build 12-month shipments bar series
  const monthlySeries = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: d.toLocaleString(undefined, { month: 'short' }), count: 0 });
    }
    const buckets = new Map(months.map((m) => [m.key, m]));
    for (const r of Array.isArray(shipments) ? shipments : []) {
      const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
      if (!raw) continue;
      const dt = new Date(String(raw));
      if (isNaN(dt.getTime())) continue;
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (buckets.has(k)) buckets.get(k).count += 1;
    }
    // Set bar colors: last month brand purple
    const result = months.map((m, idx) => ({ ...m, fill: idx === months.length - 1 ? '#7F3DFF' : '#A97EFF' }));
    return result;
  }, [shipments]);

  function KpiTile({ icon: Icon, label, value }) {
    return (
      <div className="p-4 text-center rounded-xl border border-gray-200 bg-white min-h-[128px] flex flex-col items-center justify-center overflow-hidden">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-500 truncate w-full max-w-full">
          <Icon className="w-3.5 h-3.5 text-[#7F3DFF]" />
          <span>{label}</span>
        </div>
        <div className="mt-1 text-3xl font-bold text-gray-900 truncate w-full max-w-full">{value}</div>
      </div>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
        <DialogContent className="max-w-4xl h-[95vh] flex flex-col p-0 md:rounded-2xl rounded-none md:inset-auto inset-0">
          <DialogHeader className="p-6 border-b">
            <div className="flex justify-between items-start gap-4">
              <div>
                <DialogTitle className="text-2xl font-bold" style={{ color: '#7F3DFF' }}>{displayCompany.name}</DialogTitle>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                  <div className="flex items-center gap-1.5"><Building2 className="w-4 h-4" /><span>ID: {companyId}</span></div>
                  {(displayCompany.hq_city || displayCompany.hq_state) && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 inline-block rounded-full bg-gray-200" />
                      <span>HQ: {[displayCompany.hq_city, displayCompany.hq_state].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  {(displayCompany.website || displayCompany.domain) && (
                    <div className="flex items-center gap-1.5"><Globe className="w-4 h-4" /><a className="text-blue-600 hover:underline" href={`https://${String((displayCompany.website || displayCompany.domain) || '').replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer">{String(displayCompany.website || displayCompany.domain)}</a></div>
                  )}
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
                <Button size="sm" onClick={handleSave} className="flex items-center gap-2 bg-[#7F3DFF] hover:bg-[#6d2fff] text-white" disabled={isSaving || isSavedByUser}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSavedByUser ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                  {isSavedByUser ? 'Saved' : 'Save to Command Center'}
                </Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleStartOutreach}>
                  <Mail className="w-4 h-4 mr-2" /> 
                  Start Outreach
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-grow overflow-hidden">
            {/* Tab order: Profile → Shipments → Contacts (KPI moved into Profile) */}
            <Tabs defaultValue="overview" className="h-full flex flex-col">
              <div className="px-6 border-b">
                <TabsList>
                  <TabsTrigger value="overview">Profile</TabsTrigger>
                  <TabsTrigger value="shipments">Shipments ({shipments.length})</TabsTrigger>
                  {companyDrawerPremium ? (
                    <TabsTrigger value="contacts" disabled={!isSavedByUser || !canViewContacts}>{(!isSavedByUser || !canViewContacts) && <Lock className="w-3 h-3 mr-1.5" />}Contacts</TabsTrigger>
                  ) : null}
                </TabsList>
              </div>
              <div className="flex-grow overflow-auto">
                <TabsContent value="overview" className="p-6">
                  {/* KPI grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <KpiTile icon={Ship} label="Shipments (12m)" value={Number(displayCompany.shipments_12m || 0).toLocaleString()} />
                    <KpiTile icon={TrendingUp} label="Last Activity" value={displayCompany.last_seen ? new Date(displayCompany.last_seen).toLocaleDateString() : '—'} />
                    <KpiTile icon={Box} label="Total TEUs" value={displayCompany.total_teus != null ? Number(displayCompany.total_teus).toLocaleString() : '—'} />
                    <KpiTile icon={TrendingUp} label="Growth Rate" value={displayCompany.growth_rate != null ? `${Math.round(Number(displayCompany.growth_rate) * 100)}%` : '—'} />
                  </div>

                  {/* 12-month shipments bar chart */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="h-[150px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RBarChart data={monthlySeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip formatter={(v) => [v, 'Shipments']} labelClassName="text-gray-700" />
                          <Bar dataKey="count" radius={[4,4,0,0]}>
                            {monthlySeries.map((entry, index) => (
                              <Bar key={`bar-${index}`} dataKey="count" fill={entry.fill} x={0} />
                            ))}
                          </Bar>
                        </RBarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="shipments" className="p-6">
                  <ShipmentsTab
                    shipments={shipments}
                    isLoading={isLoading}
                    onRowClick={(row) => alert(JSON.stringify(row, null, 2))}
                  />
                </TabsContent>
                <TabsContent value="contacts" className="p-6">
                  {isSavedByUser && canViewContacts ? (
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
                    <div className="rounded-2xl border p-6 bg-white">
                      <div className="text-sm text-gray-700">Save this company to Command Center and upgrade to Pro to unlock verified contacts.</div>
                      <div className="mt-3"><Button size="sm" variant="outline" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save & Enrich'}</Button></div>
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