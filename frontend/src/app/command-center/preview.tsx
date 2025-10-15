import { useState } from "react";
import { 
    Package, Clock, Zap, Truck, Save, Share2, Download, Users, Plus, 
    ChevronRight, Search, Heart, MapPin, Mail, Phone, Briefcase, Archive, 
    FileText, Activity, Layers, Tag
} from 'lucide-react';

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
function StatCard({ label, value, icon: Icon, colorClass = "text-indigo-600" }: { label: string; value: string; icon: any; colorClass?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-lg hover:shadow-xl transition">
      <div className="flex items-center gap-3 mb-1">
        <div className={`p-2 rounded-full ${colorClass} bg-opacity-10`}>
            {Icon && <Icon className="w-5 h-5" />}
        </div>
        <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
      </div>
      <p className="text-3xl font-extrabold mt-1 text-gray-900">{value}</p>
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
  const savedCompanies = ["Dole Fresh Fruit", "Acme Logistics", "Ocean Fresh", "Global Imports"];

  const tabs = ["Overview", "Shipments", "Contacts"];
  
  // KPI Data aligned with new request: Shipments (12m), Last Activity, Top Lane, Top Carrier
  const KPI_DATA = [
      { label: "Shipments (12m)", value: "3,120 TEU", icon: Package, color: "text-indigo-600" },
      { label: "Last Activity", value: "3 days ago", icon: Clock, color: "text-amber-600" },
      { label: "Top Lane", value: "CR - US (East)", icon: MapPin, color: "text-red-600" },
      { label: "Top Carrier", value: "Maersk", icon: Truck, color: "text-blue-600" },
  ];

  // --- Tab Content Renderers ---

  const OverviewTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        
        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {KPI_DATA.map((kpi, index) => (
              <StatCard key={index} label={kpi.label} value={kpi.value} icon={kpi.icon} colorClass={kpi.color} />
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
                    <Heart className="w-4 h-4" /> {COMPANY_DATA.isSaved ? "Saved" : "Save"}
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
          <p className="text-sm text-gray-600 p-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
              Placeholder for the interactive Shipments Table. Data would be loaded from <code className="font-mono text-indigo-600">GET /api/lit/public/getCompanyShipments</code>.
          </p>
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
                  email="jane.doe@dole.com" 
                  phone="(555) 123-4567"
              />
              <FullContactCard 
                  name="Luis Zhang" 
                  role="Director of Operations" 
                  email="luis.zhang@dole.com" 
                  phone="(555) 987-6543"
              />
              <FullContactCard 
                  name="Marcus Hill" 
                  role="Logistics Manager" 
                  email="marcus.hill@dole.com" 
                  phone="(555) 345-7890"
              />
              <FullContactCard 
                  name="Sarah Connor" 
                  role="Global Procurement Lead" 
                  email="sarah.connor@dole.com" 
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
    <main className="bg-gray-100 min-h-screen p-6 text-gray-800 relative font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Search + Saved (Always at top) */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 relative z-10">
          <div className="relative flex-grow max-w-lg w-full">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search company or contact..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
            />
          </div>
          
          <button
            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium p-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow transition flex items-center gap-1"
            onClick={() => setShowSaved(!showSaved)}
          >
            <Heart className="w-4 h-4" /> Saved Companies
          </button>
          
          {/* Saved Companies Dropdown */}
          {showSaved && (
            <div className="absolute top-[50px] right-0 bg-white border border-gray-300 rounded-xl shadow-2xl p-4 w-64 z-20">
              <h3 className="text-base font-bold mb-2 border-b pb-1 text-gray-800">Saved Companies</h3>
              <ul className="space-y-1">
                {savedCompanies.map((c) => (
                  <li 
                    key={c} 
                    className="p-2 hover:bg-indigo-50 rounded-lg cursor-pointer transition text-gray-700 hover:text-indigo-600 text-sm flex justify-between items-center"
                  >
                    {c} <ChevronRight className="w-3 h-3"/>
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
                    <CompanyAvatar initials={COMPANY_DATA.initials} />
                    <div>
                      <h1 className="text-4xl font-extrabold text-gray-900">{COMPANY_DATA.name}</h1>
                      <p className="text-sm text-gray-500 mt-1">{COMPANY_DATA.domain} • ID: {COMPANY_DATA.companyId} • {COMPANY_DATA.generated}</p>
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-3 sm:gap-2">
                  <button className="px-4 py-2 text-sm bg-gray-200 rounded-lg font-medium hover:bg-gray-300 transition flex items-center gap-1">
                    {COMPANY_DATA.isSaved ? <Archive className="w-4 h-4"/> : <Heart className="w-4 h-4"/>} 
                    {COMPANY_DATA.isSaved ? "Archive" : "Save"}
                  </button>
                  <button className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-semibold shadow-md hover:bg-indigo-700 transition flex items-center gap-1">
                    <Plus className="w-4 h-4"/> Add to Campaign
                  </button>
                  <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition flex items-center gap-1">
                    <Zap className="w-4 h-4"/> Enrich Now
                  </button>
                  <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition flex items-center gap-1">
                    <Download className="w-4 h-4"/> Export CSV
                  </button>
                  <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition flex items-center gap-1">
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
        {CurrentTabContent}
        
      </div>
    </main>
  );
}
