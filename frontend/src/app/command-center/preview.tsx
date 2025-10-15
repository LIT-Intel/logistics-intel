import React, { useEffect, useState } from "react";
import { 
    Package, Clock, Zap, Truck, Save, Share2, Download, Users, Plus, 
    ChevronRight, Search, Heart, MapPin, Mail, Phone, Briefcase, Archive, 
    FileText, Activity, Layers, Tag
} from 'lucide-react';
import {
  searchCompanies,
  getCompanyKpis,
  getCompanyShipments,
  listContacts,
  saveCompanyToCrm,
  saveCampaign,
  enrichCompany,
  createCompany,
  kpiFrom,
} from '@/lib/api';
import { loadSaved, upsertSaved, toggleArchive } from '@/components/command-center/storage';
import { exportCompanyPdf } from '@/components/pdf/exportCompanyPdf';

// --- Placeholder Data ---
const COMPANY_DATA = {
    name: "Dole Fresh Fruit Co.",
    initials: "DF", // Added initials for avatar
    domain: "dole.com",
    companyId: "CMP-48392",
    generated: "Generated via trade signals",
    isSaved: true,
};

const TAGS_DATA = ["Shipper", "Cold Chain Logistics", "Global Importer", "Fruit & Produce"];

const ACTIVITY_FEED_DATA = [
    { type: "Shipment", description: "New container shipment from Costa Rica (CR)", date: "2 hours ago" },
    { type: "Tariff Trend", description: "Tariff analysis completed; 2% projected rise in HS 0803", date: "yesterday" },
    { type: "Carrier Change", description: "Switched top carrier from CMA CGM to Maersk", date: "3 days ago" },
];

// --- Subcomponents ---

function CompanyAvatar({ initials }: { initials: string }) {
    return (
        <div className="w-16 h-16 bg-indigo-500 text-white rounded-full flex items-center justify-center text-2xl font-bold shadow-lg ring-4 ring-indigo-200">
            {initials}
        </div>
    );
}

/** A visually distinct KPI card */
function StatCard({ label, value, icon: Icon, colorClass = "text-indigo-600" }: { label: string; value: any; icon: any; colorClass?: string }) {
  const display = ((): string => {
    if (value == null) return '—';
    if (typeof value === 'object') {
      try { return String((value as any).toString ? (value as any).toString() : JSON.stringify(value)); } catch { return '—'; }
    }
    return String(value);
  })();
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-lg hover:shadow-xl transition">
      <div className="flex items-center gap-3 mb-1">
        <div className={`p-2 rounded-full ${colorClass} bg-opacity-10`}>
            {Icon && <Icon className="w-5 h-5" />}
        </div>
        <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
      </div>
      <p className="text-3xl font-extrabold mt-1 text-gray-900">{display}</p>
    </div>
  );
}

/** A standard container for a section */
function Section({ title, children, icon: Icon }: { title: string; children: any; icon?: any }) {
  return (
    <section className="mb-6 bg-white border border-gray-200 rounded-xl p-6 shadow-md">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800 border-b pb-2">
        {Icon && <Icon className="w-5 h-5 text-indigo-500" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function TagItem({ label }: { label: string }) {
    return (
        <span className="inline-flex items-center px-3 py-1 text-sm font-medium bg-gray-100 text-gray-700 rounded-full border border-gray-200 hover:bg-indigo-50 transition cursor-default">
            {label}
        </span>
    );
}

// --- Main Component ---
export default function CommandCenterPreview() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [showSaved, setShowSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [savedCompanies, setSavedCompanies] = useState<Array<{ company_id?: string|null; name: string; domain?: string|null; archived?: boolean }>>([]);
  const [selected, setSelected] = useState<{ company_id?: string|null; name: string; company_name?: string; domain?: string|null } | null>(null);
  const [kpi, setKpi] = useState<{ shipments12m: string; lastActivity: string; totalTeus: string; growthRate: string }>({ shipments12m: '—', lastActivity: '—', totalTeus: '—', growthRate: '—' });
  const [shipments, setShipments] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const isSaved = !!(selected && loadSaved().some(x => !x.archived && ((x.company_id ?? x.name) === ((selected.company_id ?? selected.name)))));
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<{ name: string; website?: string; street?: string; city?: string; state?: string; postal?: string; country?: string }>({ name: '' });

  const tabs = ["Overview", "Shipments", "Contacts"];
  
  // KPI Data aligned with request: Shipments (12m), Last Activity, Total TEUs, Growth Rate
  const KPI_DATA = [
      { label: "Shipments (12m)", value: kpi.shipments12m, icon: Package, color: "text-indigo-600" },
      { label: "Last Activity", value: kpi.lastActivity, icon: Clock, color: "text-amber-600" },
      { label: "Total TEUs", value: kpi.totalTeus, icon: Layers, color: "text-rose-600" },
      { label: "Growth Rate", value: kpi.growthRate, icon: Activity, color: "text-emerald-600" },
  ];

  // Init: load saved & selection
  useEffect(() => {
    try {
      setSavedCompanies(loadSaved());
      const s = JSON.parse(localStorage.getItem('lit:selectedCompany') ?? 'null');
      if (s && (s.company_id || s.name)) {
        setSelected({ company_id: s.company_id ?? null, name: s.name ?? s.company_name ?? '', company_name: s.name ?? s.company_name ?? '', domain: s.domain ?? null });
        setQuery(s.name ?? '');
        void hydrateForSelection({ company_id: s.company_id ?? null, name: s.name ?? s.company_name ?? '' });
      }
    } catch {}
  }, []);

  function persistSelection(sel: { company_id?: string|null; name: string; domain?: string|null }) {
    try { localStorage.setItem('lit:selectedCompany', JSON.stringify({ company_id: sel.company_id ?? null, name: sel.name, domain: sel.domain ?? null })); } catch {}
  }

  async function hydrateForSelection(sel: { company_id?: string|null; name: string }) {
    // KPIs
    try {
      const k = await getCompanyKpis({ company_id: sel.company_id ?? undefined, company_name: sel.name });
      if (k) {
        setKpi({
          shipments12m: k.shipments_12m != null ? String(k.shipments_12m) : '—',
          lastActivity: k.last_activity?.value || k.last_activity || '—',
          totalTeus: k.total_teus != null ? String(k.total_teus) : '—',
          growthRate: k.growth_rate != null ? `${k.growth_rate}` : '—',
        });
      } else {
        // Fallback via searchCompanies
        const res = await searchCompanies({ q: sel.name, pageSize: 1 });
        const item = Array.isArray(res.items) && res.items[0];
        const kk = item ? kpiFrom(item) : { shipments12m: 0, lastActivity: null } as any;
        setKpi({
          shipments12m: kk.shipments12m != null ? String(kk.shipments12m) : '—',
          lastActivity: kk.lastActivity || '—',
          totalTeus: (item && (item.total_teus != null) ? String(item.total_teus) : '—'),
          growthRate: (item && (item.growth_rate != null) ? `${item.growth_rate}` : '—'),
        });
      }
    } catch {}
    // Shipments
    try {
      const s = await getCompanyShipments({ company_id: String(sel.company_id || '') });
      const rows = Array.isArray(s?.rows) ? s.rows : [];
      setShipments(rows);
      try {
        if (rows.length > 0) {
          const latest = rows.reduce((acc: any, r: any) => {
            const d = r.shipped_on || r.depart_date || r.arrival_date || null;
            if (!d) return acc;
            return (!acc || new Date(d) > new Date(acc)) ? d : acc;
          }, null);
          setKpi(prev => ({
            shipments12m: prev.shipments12m !== '—' ? prev.shipments12m : String(rows.length),
            lastActivity: prev.lastActivity !== '—' ? prev.lastActivity : (latest || '—'),
            totalTeus: prev.totalTeus,
            growthRate: prev.growthRate,
          }));
        }
      } catch {}
    } catch { setShipments([]); }
    // Contacts
    try {
      if (sel.company_id) {
        const c = await listContacts(String(sel.company_id));
        setContacts(Array.isArray(c?.contacts) ? c.contacts : (Array.isArray(c) ? c : []));
      } else {
        setContacts([]);
      }
    } catch { setContacts([]); }
  }

  async function handleSearch() {
    if (!query.trim()) return;
    try {
      const res = await searchCompanies({ q: query, pageSize: 1 });
      const item: any = (Array.isArray(res.items) && res.items[0]) || null;
      if (!item) { alert('No match'); return; }
      const sel = { company_id: item.company_id ?? null, name: item.company_name || item.name || query, domain: item.domain || null };
      setSelected({ ...sel, company_name: sel.name });
      persistSelection(sel);
      try { upsertSaved({ company_id: sel.company_id ?? null, name: sel.name, domain: sel.domain ?? null, source: 'LIT', ts: Date.now(), archived: false }); } catch {}
      await hydrateForSelection(sel);
      setSavedCompanies(loadSaved());
    } catch (e: any) {
      alert(`Search failed: ${e?.message || e}`);
    }
  }

  // --- Tab Content Renderers ---

  const OverviewTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        
        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {KPI_DATA.map((stat, index) => (
              <StatCard key={index} label={stat.label} value={stat.value} icon={stat.icon} colorClass={stat.color} />
          ))}
        </div>
        
        {/* About (Text Card) */}
        <Section title="About" icon={FileText}>
            <p className="text-gray-700 text-base leading-relaxed">
                Dole Fresh Fruit Co. is a leading global producer, marketer, and distributor of fresh fruit,
                primarily bananas and pineapples. Their logistics profile is characterized by high-volume,
                time-sensitive refrigerated shipping (Reefer), predominantly operating on high-frequency, dedicated lanes
                from Central and South America to major US and European ports. The company leverages strategic partnerships
                with carriers and port operators to ensure cold chain integrity and timely delivery.
            </p>
        </Section>

        {/* Activity Feed */}
        <Section title="Activity Feed" icon={Activity}>
          <div className="space-y-3">
            {ACTIVITY_FEED_DATA.map((item, idx) => (
              <div key={idx} className="p-4 border border-gray-200 rounded-xl bg-white flex items-center gap-3">
                <Layers className="w-5 h-5 text-amber-500" />
                <div>
                  <div className="font-medium text-gray-800"><span className="text-indigo-600 font-bold mr-1">{item.type}:</span>{item.description}</div>
                  <div className="text-xs text-gray-500">{item.date}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Similar Companies */}
        <Section title="Similar Trade Profiles" icon={Users}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {["Chiquita Brands Intl","Fyffes Group","Del Monte Foods"].map((name, i)=> (
              <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50 hover:shadow transition">
                <div className="font-semibold text-gray-800">{name}</div>
                <div className="text-xs text-gray-500 mt-1 flex items-center justify-between"><span>Trade Profile Match: 88%</span><ChevronRight className="w-4 h-4 text-indigo-500"/></div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Right: actions */}
      <div className="space-y-6">
        <Section title="Shortcuts" icon={Save}>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <button className="flex items-center gap-2 p-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition border border-indigo-200"><Heart className="w-4 h-4"/>Save</button>
            <button className="flex items-center gap-2 p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition border border-gray-300"><Package className="w-4 h-4"/>Track Shipments</button>
            <button className="flex items-center gap-2 p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition border border-gray-300"><Download className="w-4 h-4"/>Export CSV</button>
            <button className="flex items-center gap-2 p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition border border-gray-300"><FileText className="w-4 h-4"/>Export PDF</button>
          </div>
        </Section>

        {/* Contacts */}
        <Section title="Contacts" icon={Users}>
          {contacts.length === 0 ? (
            <div className="text-sm text-gray-600">No contacts yet.</div>
          ) : (
            <div className="space-y-3">
              {contacts.slice(0,3).map((c, i)=> (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-200" />
                  <div>
                    <div className="text-sm font-medium">{c.name||'Contact'}</div>
                    <div className="text-xs text-gray-500">{c.title||'—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );

  const ShipmentsTab = () => (
    <div className="overflow-auto border border-gray-200 rounded-xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">Mode</th>
            <th className="p-2 text-left">Origin</th>
            <th className="p-2 text-left">Destination</th>
            <th className="p-2 text-left">Carrier</th>
            <th className="p-2 text-left">TEUs</th>
            <th className="p-2 text-left">Value</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{r.shipped_on || r.arrival_date || r.depart_date || '—'}</td>
              <td className="p-2">{r.mode || '—'}</td>
              <td className="p-2">{r.origin || r.origin_port || r.origin_country || '—'}</td>
              <td className="p-2">{r.destination || r.dest_port || r.dest_country || '—'}</td>
              <td className="p-2">{r.carrier || '—'}</td>
              <td className="p-2">{r.teus || r.container_count || '—'}</td>
              <td className="p-2">{r.value_usd || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const ContactsTab = () => (
    <div className="space-y-3">
      {contacts.length === 0 ? (
        <div className="text-sm text-gray-600">No contacts yet.</div>
      ) : (
        contacts.map((c, i)=> (
          <div key={i} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
            <div className="w-9 h-9 rounded-full bg-gray-200" />
            <div className="flex-1">
              <div className="text-sm font-medium">{c.name||'Contact'}</div>
              <div className="text-xs text-gray-500">{c.title||'—'}</div>
            </div>
            <button className="px-2 py-1 text-xs rounded border">Email</button>
          </div>
        ))
      )}
    </div>
  );

  let CurrentTabContent: any = null;
  if (activeTab === 'Overview') CurrentTabContent = <OverviewTab/>;
  if (activeTab === 'Shipments') CurrentTabContent = <ShipmentsTab/>;
  if (activeTab === 'Contacts') CurrentTabContent = <ContactsTab/>;

  return (
    <ErrorBoundary>
    <main className="min-h-screen bg-[#f7f8fb]">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600" />
          <div className="text-sm text-gray-500">Company Search</div>
          <ChevronRight className="h-4 w-4 text-gray-500" />
          <div className="text-sm font-medium">Command Center</div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <input className="hidden md:block w-[360px] border rounded-lg px-3 py-1.5 text-sm" placeholder="Search companies by name…" value={query} onChange={(e)=> setQuery(e.target.value)} onKeyDown={(e)=> { if (e.key==='Enter') void handleSearch(); }} />
            </div>
            <button className="px-3 py-1.5 text-sm rounded-lg border" onClick={()=> void handleSearch()}><Search className="w-4 h-4 mr-1 inline"/>Search</button>
            <button className="px-3 py-1.5 text-sm rounded-lg border" onClick={()=> setAddOpen(true)}>+ Add Company</button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        {/* Company header summary */}
        <div className="p-5 rounded-2xl shadow-sm mb-4 border bg-white">
          <div className="flex items-start gap-4">
            <CompanyAvatar initials={(selected?.name||'DF').slice(0,2).toUpperCase()} />
            <div className="flex-1 min-w-0">
              <div className="text-xl font-semibold truncate">{selected?.name || 'Select a company'}</div>
              <div className="mt-1 text-sm text-gray-500 flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-2"><span className="text-xs rounded bg-gray-100 px-2 py-0.5">ID</span><span>{selected?.company_id || '—'}</span></span>
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />{selected?.domain || '—'}</span>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              {selected?.domain && (
                <a className="text-sm rounded-xl border px-3 py-1.5 hover:bg-gray-50" href={`https://${selected.domain}`} target="_blank" rel="noreferrer">Open Website</a>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button className="px-4 py-2 text-sm rounded-lg border bg-white hover:bg-gray-50 transition flex items-center gap-1" onClick={()=> setShowSaved(v=>!v)}>
              <Heart className="w-4 h-4"/> Saved Companies
            </button>
            {showSaved && (
              <div className="relative">
                <div className="absolute mt-2 w-80 rounded-2xl border bg-white shadow-xl">
                  <div className="p-3 border-b text-sm font-semibold">Saved Companies</div>
                  <div className="max-h-64 overflow-auto">
                    {savedCompanies.filter(i=>!i.archived).length === 0 && (
                      <div className="p-3 text-sm text-gray-500">No saved companies yet.</div>
                    )}
                    {savedCompanies.filter(i=>!i.archived).map((c, idx) => (
                      <button key={idx} onClick={async () => {
                        const sel = { company_id: c.company_id ?? null, name: c.name, domain: c.domain ?? null };
                        setSelected({ ...sel, company_name: sel.name });
                        persistSelection(sel);
                        await hydrateForSelection(sel);
                        setShowSaved(false);
                      }} className="w-full text-left px-3 py-2 hover:bg-gray-50">
                        <div className="text-sm font-medium">{c.name}</div>
                        <div className="text-xs text-gray-500">{c.domain || '—'}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <button className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-semibold shadow-md hover:bg-indigo-700 transition flex items-center gap-1" onClick={async () => {
              try {
                if (!selected) return;
                await saveCampaign({ name: `${selected.company_name || selected.name} — Outreach`, channel: 'email', company_ids: [String(selected.company_id||'')] });
                alert('Added to Campaigns');
              } catch(e:any){ alert(`Add to Campaign failed: ${e?.message||e}`); }
            }}>
              <Plus className="w-4 h-4"/> Add to Campaign
            </button>
            <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition flex items-center gap-1" onClick={async () => {
              try {
                if (!selected?.company_id) { alert('No company selected'); return; }
                await enrichCompany({ company_id: String(selected.company_id) });
                alert('Enrichment queued');
              } catch(e:any){ alert(`Enrich failed: ${e?.message||e}`); }
            }}>
              <Zap className="w-4 h-4"/> Enrich Now
            </button>
            <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition flex items-center gap-1" onClick={async () => {
              try {
                await exportCompanyPdf('company-pdf-root', `${(selected?.company_name||selected?.name||'Company')}.pdf`);
              } catch(e:any){ alert(`Export PDF failed: ${e?.message||e}`); }
            }}>
              <FileText className="w-4 h-4"/> Export PDF
            </button>
            <button className="px-4 py-2 text-sm bg-gray-200 rounded-lg font-medium hover:bg-gray-300 transition flex items-center gap-1 disabled:opacity-60" disabled={isSaved} onClick={async () => {
              try {
                if (!selected) return;
                await saveCompanyToCrm({ company_id: String(selected.company_id||''), company_name: selected.company_name || selected.name });
                upsertSaved({ company_id: selected.company_id ?? null, name: selected.company_name || selected.name, domain: selected.domain ?? null, source: 'LIT', ts: Date.now(), archived: false });
                setSavedCompanies(loadSaved());
                alert('Saved to CRM and list');
              } catch(e:any){ alert(`Save failed: ${e?.message||e}`); }
            }}>
              <Heart className="w-4 h-4"/> 
              {isSaved ? "Saved" : "Save"}
            </button>
            <button className="px-4 py-2 text-sm rounded-lg border bg-white hover:bg-gray-50 transition flex items-center gap-1" onClick={() => {
              try {
                if (!selected) return;
                toggleArchive({ company_id: selected.company_id ?? null, name: selected.company_name || selected.name }, true);
                setSavedCompanies(loadSaved());
                alert('Archived');
              } catch(e:any){ alert(`Archive failed: ${e?.message||e}`); }
            }}>
              <Archive className="w-4 h-4"/> Archive
            </button>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="border-b border-gray-300 mb-6 bg-white rounded-t-xl p-1 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-6 text-base font-semibold transition ${
                activeTab === tab 
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-gray-50" 
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div id="company-pdf-root">
          {CurrentTabContent}
        </div>
        
      </div>

      {/* Add Company Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=> setAddOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-[min(560px,92vw)] p-5">
            <div className="text-lg font-semibold mb-3">Add Company</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="text-gray-600 mb-1">Name</div>
                <input className="w-full border rounded-lg px-3 py-2" value={addForm.name} onChange={(e)=> setAddForm(f=> ({ ...f, name: e.target.value }))} placeholder="Acme Robotics, Inc." />
              </label>
              <label className="text-sm">
                <div className="text-gray-600 mb-1">Website</div>
                <input className="w-full border rounded-lg px-3 py-2" value={addForm.website||''} onChange={(e)=> setAddForm(f=> ({ ...f, website: e.target.value }))} placeholder="acme.com" />
              </label>
              <label className="text-sm">
                <div className="text-gray-600 mb-1">Street</div>
                <input className="w-full border rounded-lg px-3 py-2" value={addForm.street||''} onChange={(e)=> setAddForm(f=> ({ ...f, street: e.target.value }))} placeholder="123 Market St" />
              </label>
              <label className="text-sm">
                <div className="text-gray-600 mb-1">City</div>
                <input className="w-full border rounded-lg px-3 py-2" value={addForm.city||''} onChange={(e)=> setAddForm(f=> ({ ...f, city: e.target.value }))} placeholder="San Francisco" />
              </label>
              <label className="text-sm">
                <div className="text-gray-600 mb-1">State</div>
                <input className="w-full border rounded-lg px-3 py-2" value={addForm.state||''} onChange={(e)=> setAddForm(f=> ({ ...f, state: e.target.value }))} placeholder="CA" />
              </label>
              <label className="text-sm">
                <div className="text-gray-600 mb-1">Postal</div>
                <input className="w-full border rounded-lg px-3 py-2" value={addForm.postal||''} onChange={(e)=> setAddForm(f=> ({ ...f, postal: e.target.value }))} placeholder="94103" />
              </label>
              <label className="text-sm sm:col-span-2">
                <div className="text-gray-600 mb-1">Country</div>
                <input className="w-full border rounded-lg px-3 py-2" value={addForm.country||''} onChange={(e)=> setAddForm(f=> ({ ...f, country: e.target.value }))} placeholder="USA" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 text-sm border rounded-lg" onClick={()=> setAddOpen(false)}>Cancel</button>
              <button className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white" onClick={async ()=>{
                try {
                  if (!addForm.name.trim()) { alert('Name is required'); return; }
                  const res = await createCompany({ name: addForm.name.trim(), domain: addForm.website?.trim() || undefined, street: addForm.street?.trim() || undefined, city: addForm.city?.trim() || undefined, state: addForm.state?.trim() || undefined, postal: addForm.postal?.trim() || undefined, country: addForm.country?.trim() || undefined });
                  const id = String(res?.id || res?.company_id || '').trim();
                  const sel = { company_id: id || null, name: addForm.name.trim(), domain: addForm.website?.trim() || null };
                  upsertSaved({ company_id: sel.company_id ?? null, name: sel.name, domain: sel.domain ?? null, source: 'LIT', ts: Date.now(), archived: false });
                  setSavedCompanies(loadSaved());
                  setSelected({ ...sel, company_name: sel.name });
                  persistSelection(sel);
                  setAddOpen(false);
                  if (id) { try { await enrichCompany({ company_id: id }); } catch {} }
                  await hydrateForSelection(sel);
                } catch(e:any){ alert(`Create failed: ${e?.message||e}`); }
              }}>Create & Enrich</button>
            </div>
          </div>
        </div>
      )}
    </main>
    </ErrorBoundary>
  );
}

// Simple error boundary to prevent blank page on render exceptions
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; detail?: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, detail: String(error?.message || error) };
  }
  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('[CommandCenter Error]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-gray-200 rounded-xl shadow p-6 text-center">
            <div className="text-lg font-semibold text-gray-900">Something went wrong</div>
            <div className="mt-2 text-sm text-gray-600">Reload the page or try another company. If this persists, share the console error.</div>
            <div className="mt-3 text-xs text-gray-400 break-all">{this.state.detail}</div>
            <button className="mt-4 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg" onClick={()=> window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}
