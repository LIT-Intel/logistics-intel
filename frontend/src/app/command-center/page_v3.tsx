import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SavedCompaniesPicker from '@/components/command-center/SavedCompaniesPicker';
import AddCompanyModal from '@/components/command-center/AddCompanyModal';
import ShipmentsTable from '@/components/command-center/ShipmentsTable';
import CampaignKpis from '@/components/command-center/CampaignKpis';
import ContactsPanel from '@/components/command-center/ContactsPanel';
import PreCallBriefing from '@/components/command-center/PreCallBriefing';
import CompanyAvatar from '@/components/command-center/CompanyAvatar';
import { Toaster, toast } from 'sonner';
import { exportCommandCenterPdf } from '@/lib/exportPdf';
import { enrichCompany } from '@/lib/litEnrich';
import { loadSaved, upsertSaved, toggleArchive } from '@/components/command-center/storage';
import { hasFeature } from '@/lib/access';
import {
  ChevronRight, Download, Link2, Settings2,
  Package as PackageIcon, Clock, Layers, TrendingUp, Save as SaveIcon, Users,
  Plus, FileText, Activity
} from 'lucide-react';

// Types for the KPIs and search response
type Kpi = {
  shipments12m: string;
  lastActivity: string;
  totalTeus: string;
  growthRate: string;
};

type SearchCompanyRow = {
  company_id: string | null;
  company_name: string;
  shipments_12m: number | null;
  last_activity?: { value?: string | null } | null;
  total_teus?: number | null;
  growth_rate?: number | string | null;
};

type SearchCompaniesResp = { meta?: { total: number }, rows?: SearchCompanyRow[], items?: SearchCompanyRow[] };

type Selected = { company_id: string | null; name: string; domain: string | null } | null;

export default function CommandCenterV3() {
  const [kpi, setKpi] = useState<Kpi>({ shipments12m: '—', lastActivity: '—', totalTeus: '—', growthRate: '—' });
  const [addOpen, setAddOpen] = useState(false);
  const [campOpen, setCampOpen] = useState(false);
  const [selected, setSelected] = useState<Selected>(null);
  const savedList = loadSaved();
  const isSaved = !!selected && savedList.some(x => (x.company_id ?? x.name) === ((selected?.company_id) ?? (selected?.name || '')));
  const isArchived = !!selected && savedList.find(x => (x.company_id ?? x.name) === ((selected?.company_id) ?? (selected?.name || '')))?.archived;
  const canViewContacts = hasFeature('contacts');

  // Seed selection + load KPIs
  useEffect(() => {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('lit:selectedCompany') ?? 'null'); } catch { return null; } })();
    if (saved) setSelected(saved);
    const body = saved?.company_id ? { company_id: saved.company_id, limit: 1, offset: 0 } : { q: saved?.name || null, limit: 1, offset: 0 };
    fetch('/api/lit/public/searchCompanies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as SearchCompaniesResp;
        const rows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data.items) ? data.items : []);
        const row = rows?.[0];
        if (!row) return;
        setKpi({
          shipments12m: row.shipments_12m != null ? String(row.shipments_12m) : '—',
          lastActivity: row.last_activity?.value || '—',
          totalTeus: row.total_teus != null ? String(row.total_teus) : '—',
          growthRate: row.growth_rate != null ? `${row.growth_rate}` : '—',
        });
      })
      .catch(() => { /* keep placeholders */ });
  }, []);

  return (
    <div id="cc-root" className="min-h-screen bg-[#f7f8fb]" data-cc-build="v3.0-2025-10-15">
      {/* Top App Bar */}
      <div className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600" />
          <div className="text-sm text-muted-foreground">Company Search</div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">Command Center</div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm"><Settings2 className="mr-2 h-4 w-4" />Tools</Button>
            <SavedCompaniesPicker onPicked={() => { /* picker reloads */ }} />
            <Button size="sm" onClick={()=>setCampOpen(true)}>Add to Campaign</Button>
            <Button size="sm" variant="outline" onClick={() => {
              if (!selected) { toast.error('No company selected'); return; }
              upsertSaved({ company_id: selected.company_id ?? null, name: selected.name, domain: selected.domain ?? null, source: selected.company_id ? 'LIT' : 'MANUAL', ts: Date.now(), archived: false });
              toast.success('Saved to list');
            }}>{isSaved ? 'Saved' : 'Save to List'}</Button>
            <Button size="sm" variant="ghost" onClick={() => {
              if (!selected) return;
              toggleArchive({ company_id: selected.company_id ?? null, name: selected.name }, !isArchived);
              toast.info(!isArchived ? 'Archived' : 'Unarchived');
              window.location.reload();
            }}>{isArchived ? 'Unarchive' : 'Archive'}</Button>
            {selected && !selected.company_id && (
              <Button size="sm" onClick={async ()=>{
                try {
                  toast.info('Enriching…');
                  const res = await enrichCompany({ name: selected?.name || '', domain: selected?.domain ?? null });
                  localStorage.setItem('lit:selectedCompany', JSON.stringify(res));
                  const list = JSON.parse(localStorage.getItem('lit:savedCompanies')||'[]');
                  const next = [{ ...res, source:'LIT', ts: Date.now() }, ...list.filter((x:any)=>x.name!==(selected?.name||''))];
                  localStorage.setItem('lit:savedCompanies', JSON.stringify(next));
                  toast.success('Enriched');
                  window.location.reload();
                } catch(e:any) { toast.error(`Enrich failed: ${e?.message||e}`); }
              }}>Enrich Now</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>+ Add Company</Button>
            <Button size="sm" variant="outline" onClick={async ()=>{
              try { toast.info('Generating PDF…'); await exportCommandCenterPdf(); toast.success('PDF downloaded'); } catch(e:any) { toast.error(`Export failed: ${e?.message||e}`); }
            }}><Download className="mr-2 h-4 w-4" />Export PDF</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {/* Search just above company header */}
        <div className="flex items-center gap-2 mb-4">
          <Input className="w-full max-w-xl" placeholder="Search companies or contacts..." />
        </div>

        {/* Company header */}
        <Card className="p-5 rounded-2xl shadow-sm mb-4">
          <div className="flex items-start gap-4">
            <CompanyAvatar name={selected?.name || undefined} domain={selected?.domain || undefined} />
            <div className="flex-1 min-w-0">
              <div className="text-xl font-semibold truncate">{selected?.name || 'Select a company'}</div>
              <div className="mt-1 text-sm text-muted-foreground flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-2"><span className="text-xs rounded bg-slate-100 px-2 py-0.5">ID</span><span>{selected?.company_id || '—'}</span></span>
                <span className="inline-flex items-center gap-2"><Link2 className="h-4 w-4" />{selected?.domain || '—'}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs first */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full grid grid-cols-3 gap-2 rounded-xl mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="shipments">Shipments</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
          </TabsList>

          {/* KPI strip below tabs */}
          <KpiStrip kpi={kpi} />

          {/* Overview content */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-6">
                <Card className="p-6 rounded-xl shadow-md border">
                  <div className="text-xl font-bold mb-2 flex items-center gap-2 text-slate-800 border-b pb-2"><FileText className="w-5 h-5 text-indigo-500"/>About</div>
                  <div className="text-sm text-slate-700 leading-relaxed">Company overview will appear here once connected to enrichment.</div>
                </Card>
                <Card className="p-6 rounded-xl shadow-md border">
                  <div className="text-xl font-bold mb-2 flex items-center gap-2 text-slate-800 border-b pb-2"><Activity className="w-5 h-5 text-indigo-500"/>Activity Feed</div>
                  <div className="text-sm text-slate-700">Recent activity will appear here.</div>
                </Card>
              </div>
              <div className="space-y-6">
                <Card className="p-6 rounded-xl shadow-md border">
                  <div className="text-xl font-bold mb-3 flex items-center gap-2 text-slate-800 border-b pb-2"><SaveIcon className="w-5 h-5 text-indigo-500"/>Shortcuts</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <button className="flex items-center gap-2 p-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition border border-indigo-200">Save</button>
                    <button className="flex items-center gap-2 p-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition border border-slate-300">Export</button>
                  </div>
                </Card>
                <Card className="p-4 rounded-2xl shadow-sm">
                  <div className="text-sm font-semibold mb-2">Campaign KPIs</div>
                  <CampaignKpis />
                </Card>
                <Card className="p-4 rounded-2xl shadow-sm">
                  <ContactsPanel />
                </Card>
                <PreCallBriefing />
              </div>
            </div>
          </TabsContent>

          {/* Shipments */}
          <TabsContent value="shipments">
            <Card className="p-4 rounded-2xl shadow-sm">
              <h2 className="text-sm font-semibold mb-3">Shipments</h2>
              <ShipmentsTable />
            </Card>
          </TabsContent>

          {/* Contacts */}
          <TabsContent value="contacts">
            <ContactsPanel />
          </TabsContent>
        </Tabs>
      </div>

      <AddCompanyModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { /* no-op */ }} />
      {/* Future: AddToCampaignModal wired on v3 full implementation */}
      <Toaster richColors position="top-center" />
    </div>
  );
}

function KpiStrip({ kpi }: { kpi: Kpi }) {
  const items = [
    { label: 'Shipments (12m)', value: kpi.shipments12m },
    { label: 'Last Activity', value: kpi.lastActivity },
    { label: 'Total TEUs', value: kpi.totalTeus },
    { label: 'Growth Rate', value: kpi.growthRate },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {items.map((k) => (
        <Card key={k.label} className="p-4 rounded-2xl shadow-sm">
          <div className="text-xs text-muted-foreground">{k.label}</div>
          <div className="text-xl font-semibold">{k.value}</div>
        </Card>
      ))}
    </div>
  );
}
