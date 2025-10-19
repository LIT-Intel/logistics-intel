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
import ShipmentsTable from '@/components/command-center/ShipmentsTable';
import { loadSaved, upsertSaved, toggleArchive } from '@/components/command-center/storage';
import { exportCompanyPdf } from '@/components/pdf/exportCompanyPdf';

// --- Placeholder Data (blank defaults; selected company drives display) ---
const COMPANY_DATA = {
    name: "",
    initials: "",
    domain: "",
    companyId: "",
    generated: "",
    isSaved: false,
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

  function deriveInitials(name?: string|null) {
    const n = (name||'').trim();
    if (!n) return '';
    const parts = n.split(/\s+/).filter(Boolean);
    const letters = (parts[0]?.[0]||'') + (parts[1]?.[0]||'');
    return letters.toUpperCase();
  }

  function readLegacyKpis(key: { company_id?: string|null; name: string }) {
    try {
      const raw = localStorage.getItem('lit_companies');
      const arr = raw ? JSON.parse(raw) : [];
      const idKey = String(key.company_id || '').trim();
      const nameKey = String(key.name || '').toLowerCase();
      const rec = Array.isArray(arr) ? arr.find((c:any)=> String(c?.id||'')===idKey || String(c?.name||'').toLowerCase()===nameKey) : null;
      return rec?.kpis || null;
    } catch { return null; }
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
    // Overlay with locally saved KPIs from Search (if any)
    try {
      const loc = readLegacyKpis({ company_id: sel.company_id ?? null, name: sel.name });
      if (loc) {
        setKpi(prev => ({
          shipments12m: loc.shipments12m != null ? String(loc.shipments12m) : prev.shipments12m,
          lastActivity: loc.lastActivity || prev.lastActivity,
          totalTeus: prev.totalTeus,
          growthRate: prev.growthRate,
        }));
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
                time-sensitive refrigerated shipping (Reefer), predominantly operating on high-frequency,
                dedicated lanes from Central and South America to major US and European ports. They are a
                key target for cold chain and ocean freight providers.
            </p>
        </Section>
        
        {/* Tags Section */}
        <Section title="Tags & Categories" icon={Tag}>
            <div className="flex flex-wrap gap-2">
                {TAGS_DATA.map((tag) => <TagItem key={tag} label={tag} />)}
            </div>
        </Section>

        {/* Similar Companies */}
        <Section title="Similar Trade Profiles" icon={Users}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {["Chiquita Brands Intl", "Fyffes Group", "Del Monte Foods"].map((name) => (
              <div
                key={name}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow transition cursor-pointer"
              >
                <div className="font-semibold text-gray-800">{name}</div>
                <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                    <span>Trade Profile Match: 88%</span>
                    <ChevronRight className="w-4 h-4 text-indigo-500"/>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Activity Feed */}
        <Section title="Activity Feed" icon={Activity}>
            <ul className="space-y-3">
                {ACTIVITY_FEED_DATA.map((activity, index) => (
                    <li key={index} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <Layers className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        <div>
                            <p className="font-medium text-gray-800">
                                <span className="font-bold text-indigo-600 mr-1">{activity.type}:</span>
                                {activity.description}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{activity.date}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </Section>
      </div>

      {/* Sidebar Content (Right Column) - Now containing Shortcuts, Campaign, Contacts, Briefing */}
      <div className="space-y-6">
        
        {/* Shortcuts */}
        <Section title="Shortcuts" icon={Save}>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <button className="flex items-center gap-2 p-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition border border-indigo-200">
                    <Heart className="w-4 h-4" /> {isSaved ? 'Saved' : 'Save'}
                </button>
                <button className="flex items-center gap-2 p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition border border-gray-300">
                    <Package className="w-4 h-4" /> Track Shipments
                </button>
                <button className="flex items-center gap-2 p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition border border-gray-300">
                    <Download className="w-4 h-4" /> Export CSV
                </button>
                <button className="flex items-center gap-2 p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition border border-gray-300">
                    <FileText className="w-4 h-4" /> Export PDF
                </button>
            </div>
        </Section>
        
        {/* Campaign KPIs (Matches old Campaign Snapshot) */}
        <Section title="Campaign KPIs" icon={Share2}>
          <div className="text-sm space-y-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
            <div className="flex justify-between">
              <strong>Active Campaigns:</strong> <span className="text-indigo-600 font-bold">3</span>
            </div>
            <div className="flex justify-between">
              <strong>Last Activity:</strong> <span>Oct 12, 2025</span>
            </div>
            <div className="flex justify-between">
              <strong>Open Rate:</strong> <span className="text-green-600 font-bold">42%</span>
            </div>
            <div className="flex justify-between">
              <strong>Reply Rate:</strong> <span className="text-green-600 font-bold">9%</span>
            </div>
          </div>
        </Section>
        
        {/* Quick Contacts Preview */}
        <Section title="Key Contacts (3)" icon={Users}>
            <ul className="text-sm space-y-2">
                <li className="flex justify-between items-center text-gray-700 border-b pb-1">
                    <span>Jane Doe, VP Supply</span>
                    <Mail className="w-4 h-4 text-indigo-500 cursor-pointer hover:text-indigo-700"/>
                </li>
                 <li className="flex justify-between items-center text-gray-700 border-b pb-1">
                    <span>Luis Zhang, Dir Ops</span>
                    <Mail className="w-4 h-4 text-indigo-500 cursor-pointer hover:text-indigo-700"/>
                </li>
                 <li className="flex justify-between items-center text-gray-700">
                    <span>Marcus Hill, Log Mgr</span>
                    <Mail className="w-4 h-4 text-indigo-500 cursor-pointer hover:text-indigo-700"/>
                </li>
            </ul>
            <button className="mt-3 text-xs text-indigo-600 hover:underline font-medium w-full text-center">
                View All Contacts in "Contacts" tab
            </button>
        </Section>

        {/* Pre-call Briefing */}
        <Section title="Pre‑call Briefing" icon={Briefcase}>
          <p className="text-sm text-gray-700 p-3 rounded-md border border-gray-200 mb-3">
            Based on recent shipments from China to U.S., increased volume in HS code 0803,
            suggest initiating RFP around port arrival strategy.
          </p>
          <button className="w-full text-indigo-600 text-sm hover:bg-indigo-50 p-2 rounded-lg font-medium border border-indigo-300">
            Regenerate Summary (POST /api/lit/public/briefing)
          </button>
        </Section>
      </div>
    </div>
  );

  const ShipmentsTab = () => (
    <Section title="Company Shipments" icon={Truck}>
      <ShipmentsTable />
    </Section>
  );
  
  // Refactored Contact Card for use in the dedicated tab
  function FullContactCard({ name, role, email, phone }: { name: string; role: string; email: string; phone: string }) {
    return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition mb-3">
            <div className="flex justify-between items-center">
                <div>
                    <p className="font-semibold text-gray-900">{name}</p>
                    <p className="text-sm text-indigo-600 font-medium">{role}</p>
                </div>
                <button className="text-sm text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-1 hover:bg-indigo-100 transition">
                    <Plus className="w-3 h-3 inline mr-1" /> Campaign
                </button>
            </div>
            <div className="mt-3 text-sm space-y-1">
                <p className="flex items-center gap-2 text-gray-600"><Mail className="w-4 h-4 text-indigo-500" /> {email}</p>
                <p className="flex items-center gap-2 text-gray-600"><Phone className="w-4 h-4 text-indigo-500" /> {phone}</p>
            </div>
        </div>
    );
  }

  const ContactsTab = () => (
      <Section title="Key Decision Makers" icon={Users}>
          <p className="text-xs text-gray-500 mb-4">Contacts loaded from <code className="font-mono text-indigo-600">GET /api/lit/public/contacts?q=...</code></p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FullContactCard 
                  name="Jane Doe" 
                  role="VP Supply Chain" 
                  email={selected?.domain ? `contact@${selected.domain}` : '—'} 
                  phone="(555) 123-4567"
              />
              <FullContactCard 
                  name="Luis Zhang" 
                  role="Director of Operations" 
                  email={selected?.domain ? `ops@${selected.domain}` : '—'} 
                  phone="(555) 987-6543"
              />
              <FullContactCard 
                  name="Marcus Hill" 
                  role="Logistics Manager" 
                  email={selected?.domain ? `logistics@${selected.domain}` : '—'} 
                  phone="(555) 345-7890"
              />
              <FullContactCard 
                  name="Sarah Connor" 
                  role="Global Procurement Lead" 
                  email={selected?.domain ? `procurement@${selected.domain}` : '—'} 
                  phone="(555) 678-1234"
              />
          </div>
          <button className="mt-4 text-sm text-indigo-600 hover:underline font-medium">
              View All 12 Contacts
          </button>
      </Section>
  );
  
  let CurrentTabContent: any;
  switch (activeTab) {
      case "Overview":
          CurrentTabContent = <OverviewTab />;
          break;
      case "Shipments":
          CurrentTabContent = <ShipmentsTab />;
          break;
      case "Contacts":
          CurrentTabContent = <ContactsTab />;
          break;
      default:
          CurrentTabContent = <OverviewTab />;
  }


  return (
    <ErrorBoundary>
    <main data-cc-build="preview-v2.6-2025-10-15-16:05" className="bg-gray-100 min-h-screen p-6 text-gray-800 relative font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Search + Saved (Always at top) */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 relative z-10">
          <div className="relative flex-grow max-w-lg w-full flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search company or contact..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                value={query}
                onChange={(e)=> setQuery(e.target.value)}
                onKeyDown={(e)=> { if (e.key === 'Enter') handleSearch(); }}
              />
            </div>
            <button className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-semibold shadow hover:bg-indigo-700" onClick={handleSearch}>Search</button>
          </div>
          
          <button
            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium p-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow transition flex items-center gap-1"
            onClick={() => setShowSaved(!showSaved)}
          >
            <Heart className="w-4 h-4" /> Saved Companies
          </button>
          <button
            className="text-white bg-indigo-600 hover:bg-indigo-700 text-sm font-medium px-3 py-2 rounded-xl shadow-sm transition"
            onClick={() => { setAddForm({ name: '', website: '', street: '', city: '', state: '', postal: '', country: '' }); setAddOpen(true); }}
          >
            Add Company
          </button>
          
          {/* Saved Companies Dropdown */}
          {showSaved && (
            <div className="absolute top-[50px] right-0 bg-white border border-gray-300 rounded-xl shadow-2xl p-4 w-64 z-20">
              <h3 className="text-base font-bold mb-2 border-b pb-1 text-gray-800">Saved Companies</h3>
              <ul className="space-y-1">
                {(savedCompanies.filter(x=>!x.archived)).map((c) => (
                  <li 
                    key={(c.company_id ?? c.name) as any}
                    className="p-2 hover:bg-indigo-50 rounded-lg cursor-pointer transition text-gray-700 hover:text-indigo-600 text-sm flex justify-between items-center"
                    onClick={()=> { setSelected({ company_id: c.company_id ?? null, name: c.name, company_name: c.name, domain: c.domain ?? null }); persistSelection({ company_id: c.company_id ?? null, name: c.name, domain: c.domain ?? null }); setShowSaved(false); void hydrateForSelection({ company_id: c.company_id ?? null, name: c.name }); }}
                  >
                    {c.name} <ChevronRight className="w-3 h-3"/>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Header & Actions */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div className="flex items-center gap-4 mb-4 sm:mb-0">
                    <CompanyAvatar initials={deriveInitials(selected?.company_name || selected?.name || '')} />
                    <div>
                      <h1 className="text-4xl font-extrabold text-gray-900">{selected?.company_name || selected?.name || 'Select a company'}</h1>
                      <p className="text-sm text-gray-500 mt-1">{selected?.domain || '—'} • ID: {selected?.company_id || '—'}</p>
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-3 sm:gap-2">
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
                </div>
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
