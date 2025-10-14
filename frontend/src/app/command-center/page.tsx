import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ContactsGate from '@/components/search/ContactsGate';
import AddCompanyModal from '@/components/command-center/AddCompanyModal';
import ShipmentsTable from '@/components/command-center/ShipmentsTable';
import SavedCompaniesPicker from '@/components/command-center/SavedCompaniesPicker';
import AddToCampaignModal from '@/components/command-center/AddToCampaignModal';
import CampaignKpis from '@/components/command-center/CampaignKpis';
import ContactsPanel from '@/components/command-center/ContactsPanel';
import PreCallBriefing from '@/components/command-center/PreCallBriefing';
import { Toaster } from 'sonner';
import { exportCommandCenterPdf } from '@/lib/exportPdf';
import { enrichCompany } from '@/lib/litEnrich';
import { toast } from 'sonner';
import { loadSaved, upsertSaved, toggleArchive } from '@/components/command-center/storage';
import { ChevronRight, Download, Link2, Settings2 } from 'lucide-react';
import CompanyAvatar from '@/components/command-center/CompanyAvatar';

// inline LitSearchRow type removed; AddCompanyModal owns its search types

export default function CommandCenterPage() {
  // --- KPI state (live) ---
  const [kpi, setKpi] = useState({
    shipments12m: '—',
    lastActivity: '—',
    topLane: '—',
    topCarrier: '—',
  });
  const [addOpen, setAddOpen] = useState(false);
  const [campOpen, setCampOpen] = useState(false);
  const [selected, setSelected] = useState<{ company_id: string | null; name: string; domain: string | null } | null>(null);
  const needsEnrich = !!selected && !selected?.company_id;
  const savedList = loadSaved();
  const isSaved = !!selected && savedList.some(x => (x.company_id ?? x.name) === ((selected?.company_id) ?? (selected?.name || '')));
  const isArchived = !!selected && savedList.find(x => (x.company_id ?? x.name) === ((selected?.company_id) ?? (selected?.name || '')))?.archived;

  // inline modal/search removed in favor of AddCompanyModal

  // --- Fetch KPI seed from proxy searchCompanies (1 row), prefer saved company ---
  type SearchCompanyRow = {
    company_id: string | null;
    company_name: string;
    shipments_12m: number | null;
    last_activity?: { value?: string | null } | null;
    top_routes?: { origin_country: string | null; dest_country: string | null; shipments: number | null }[] | null;
    top_carriers?: { name: string | null; share_pct: number | null }[] | null;
  };
  type SearchCompaniesResp = { meta?: { total: number }, rows?: SearchCompanyRow[], items?: SearchCompanyRow[] };
  function fmtLane(row: SearchCompanyRow) {
    const r = row.top_routes?.[0];
    if (!r || !r.origin_country || !r.dest_country) return '—';
    return `${r.origin_country} → ${r.dest_country}`;
  }
  function fmtCarrier(row: SearchCompanyRow) {
    const c = row.top_carriers?.[0];
    return c?.name ?? '—';
  }
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
          topLane: fmtLane(row),
          topCarrier: fmtCarrier(row),
        });
      })
      .catch(() => { /* keep placeholders */ });
  }, []);

  return (
    <div id="cc-root" className="min-h-screen bg-[#f7f8fb]">
      {/* Top App Bar */}
      <div className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600" />
          <div className="text-sm text-muted-foreground">Company Search</div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">Command Center</div>

          <div className="ml-auto flex items-center gap-2">
            <Input className="hidden md:block w-[360px]" placeholder="Search companies, contacts, industries, etc." />
            <Button variant="outline" size="sm"><Settings2 className="mr-2 h-4 w-4" />Tools</Button>
            <SavedCompaniesPicker onPicked={() => { /* no-op */ }} />
            <Button size="sm" onClick={()=>setCampOpen(true)}>Add to Campaign</Button>
            <Button size="sm" variant="outline" onClick={()=>{
              if(!selected){ toast.error('No company selected'); return; }
              upsertSaved({ company_id: selected.company_id ?? null, name: selected.name, domain: selected.domain ?? null, source: selected.company_id ? 'LIT' : 'MANUAL', ts: Date.now(), archived:false });
              toast.success('Saved to list');
            }}>{isSaved ? 'Saved' : 'Save to List'}</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              if(!selected){ return; }
              toggleArchive({ company_id: selected.company_id ?? null, name: selected.name }, !isArchived);
              toast.info(!isArchived ? 'Archived' : 'Unarchived');
              window.location.reload();
            }}>{isArchived ? 'Unarchive' : 'Archive'}</Button>
            {needsEnrich && (
              <Button size="sm" onClick={async ()=>{
                try{
                  toast.info('Enriching…');
                  const res = await enrichCompany({ name: selected?.name || '', domain: selected?.domain ?? null });
                  localStorage.setItem('lit:selectedCompany', JSON.stringify(res));
                  const list = JSON.parse(localStorage.getItem('lit:savedCompanies')||'[]');
                  const next = [{ ...res, source:'LIT', ts: Date.now() }, ...list.filter((x:any)=>x.name!==(selected?.name||''))];
                  localStorage.setItem('lit:savedCompanies', JSON.stringify(next));
                  toast.success('Enriched');
                  window.location.reload();
                }catch(e:any){ toast.error(`Enrich failed: ${e?.message||e}`); }
              }}>Enrich Now</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>+ Add Company</Button>
            <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />Export</Button>
            <Button size="sm" variant="outline" onClick={async ()=>{
              try { 
                toast.info('Generating PDF…');
                await exportCommandCenterPdf();
                toast.success('PDF downloaded');
              } catch(e:any) {
                toast.error(`Export failed: ${e?.message||e}`);
              }
            }}>Export PDF</Button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {/* Company header summary */}
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
            <div className="hidden sm:flex items-center gap-2">
              {selected?.domain && (
                <a className="text-sm rounded-xl border px-3 py-1.5 hover:bg-slate-50" href={`https://${selected.domain}`} target="_blank" rel="noreferrer">Open Website</a>
              )}
            </div>
          </div>
        </Card>

        {/* KPI strip */}
        <KpiStrip kpi={kpi} />

        {/* Tabs + Main content */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full grid grid-cols-3 gap-2 rounded-xl mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="shipments">Shipments</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: overview content */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="p-4 rounded-2xl shadow-sm">
                  <SectionTitle title="About" />
                  <div className="text-sm text-muted-foreground">This profile is automatically generated from recent shipment signals and public sources.</div>
                </Card>
                <Card className="p-4 rounded-2xl shadow-sm">
                  <SectionTitle title="Tags" />
                  <TagRow tags={["Shipper", "Importer", "Cold Chain"]} />
                </Card>
                <Card className="p-4 rounded-2xl shadow-sm">
                  <SectionTitle title="Similar Companies" />
                  <div className="mt-2 space-y-2">
                    <SimilarItem name="Acme Logistics" />
                    <SimilarItem name="Dole Food Company" />
                    <SimilarItem name="Ocean Fresh Imports" />
                  </div>
                </Card>
                <Card className="p-4 rounded-2xl shadow-sm">
                  <SectionTitle title="Activity" />
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <FeedItem title="Shipment arrived at LAX" meta="3 days ago • 1x40’ refrigerated" />
                    <FeedItem title="New carrier observed: Maersk" meta="7 days ago • 18% share" />
                    <FeedItem title="New route emerging" meta="CN → US • +4 shipments" />
                    <FeedItem title="Tariff code trend: 0803" meta="Bananas • 12 shipments this month" />
                  </div>
                </Card>
              </div>

              {/* Right: contacts / actions */}
              <div className="space-y-4">
                <ContactsGate companyName={selected?.name || 'this company'} />
                <Card className="p-4 rounded-2xl shadow-sm">
                  <SectionTitle title="Shortcuts" />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline">Save to List</Button>
                    <Button size="sm" variant="outline">Track Signals</Button>
                    <Button size="sm" variant="outline">Export</Button>
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

          <TabsContent value="shipments">
            <Card className="p-4 rounded-2xl shadow-sm">
              <h2 className="text-sm font-semibold mb-3">Shipments</h2>
              <ShipmentsTable />
            </Card>
          </TabsContent>

          <TabsContent value="contacts">
            <ContactsGate companyName={selected?.name || 'this company'} />
          </TabsContent>
        </Tabs>
      </div>

      <AddCompanyModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { /* no-op; reload handles */ }} />
      <AddToCampaignModal open={campOpen} onClose={()=>setCampOpen(false)} company={{ company_id: selected?.company_id ?? null, name: selected?.name || '' }} />
      <Toaster richColors position="top-center" />
    </div>
  );
}

// ---------- Subcomponents ----------

function SectionTitle({ title, compact }: { title: string; compact?: boolean }) {
  return (
    <div className={`text-sm font-semibold ${compact ? '' : 'mb-2'}`}>{title}</div>
  );
}

// Modal UI (render at root below content)
// NOTE: This JSX should be placed at the bottom of the component tree in the return statement above.

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1">{icon}{value}</div>
    </div>
  );
}

function KpiStrip({ kpi }: { kpi: { shipments12m: string; lastActivity: string; topLane: string; topCarrier: string } }) {
  const items = [
    { label: 'Shipments (12m)', value: kpi.shipments12m },
    { label: 'Last Activity', value: kpi.lastActivity },
    { label: 'Top Lane', value: kpi.topLane },
    { label: 'Top Carrier', value: kpi.topCarrier },
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

function TagRow({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(t => (
        <span key={t} className="px-2 py-1 rounded-full bg-slate-100 text-xs">{t}</span>
      ))}
    </div>
  );
}

function SimilarItem({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
      <div className="text-sm">{name}</div>
      <Button size="sm" variant="ghost" className="text-indigo-700">View</Button>
    </div>
  );
}

function FeedItem({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-xl border p-3 hover:bg-slate-50 transition">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{meta}</div>
    </div>
  );
}

function GhostContact({ name, title }: { name: string; title: string }) {
  return (
    <div className="rounded-xl border p-3 bg-white/50">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-slate-200" />
        <div>
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{title}</div>
        </div>
      </div>
      <div className="mt-2 flex gap-1">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100">email hidden</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100">LinkedIn hidden</span>
      </div>
    </div>
  );
}

// duplicate KpiStrip removed
