'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight, Download, Link2, Settings2, Star, Tag, UploadCloud, Users2, MapPin, Phone, Mail } from 'lucide-react';

// ----- Types -----
type TabKey =
  | 'overview'
  | 'accountai'
  | 'employees'
  | 'orgchart'
  | 'technologies'
  | 'scoops'
  | 'intent'
  | 'g2'
  | 'websites'
  | 'news'
  | 'locations'
  | 'financials'
  | 'similar';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'accountai', label: 'Account AI' },
  { key: 'employees', label: 'Employees' },
  { key: 'orgchart', label: 'Org Chart' },
  { key: 'technologies', label: 'Technologies' },
  { key: 'scoops', label: 'Scoops' },
  { key: 'intent', label: 'Intent' },
  { key: 'g2', label: 'G2' },
  { key: 'websites', label: 'Websites' },
  { key: 'news', label: 'News' },
  { key: 'locations', label: 'Locations & Hierarchy' },
  { key: 'financials', label: 'Financials' },
  { key: 'similar', label: 'Similar Companies' },
];

export default function CommandCenterPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [companyName, setCompanyName] = useState('Company Name');
  const [companyMeta, setCompanyMeta] = useState({
    location: '—',
    industry: '—',
    employees: '—',
    revenue: '—',
    website: '—',
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lit:selectedCompany');
      if (saved) {
        const parsed = JSON.parse(saved);
        setCompanyName(parsed?.name || 'Company Name');
        setCompanyMeta({
          location: parsed?.location || '—',
          industry: parsed?.industry || '—',
          employees: parsed?.employees || '—',
          revenue: parsed?.revenue || '—',
          website: parsed?.website || '—',
        });
      }
    } catch {}
  }, []);

  const brandGradient = useMemo(() => 'from-indigo-600 via-violet-600 to-fuchsia-600', []);

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      {/* Top App Bar */}
      <div className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600" />
          <div className="text-sm text-muted-foreground">Company Search</div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">{companyName}</div>

          <div className="ml-auto flex items-center gap-2">
            <Input className="hidden md:block w-[360px]" placeholder="Search companies, contacts, industries, etc." />
            <Button variant="outline" size="sm"><Settings2 className="mr-2 h-4 w-4" />Tools</Button>
            <Button size="sm" className="bg-gradient-to-r text-white shadow-sm hover:opacity-90">
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Add to Command Center</span>
            </Button>
            <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />Export</Button>
          </div>
        </div>

        {/* Company header summary */}
        <div className="border-t bg-white">
          <div className="mx-auto max-w-[1400px] px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                  <span className="text-xl font-semibold text-indigo-700">{companyName?.[0] ?? 'C'}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold tracking-tight">{companyName}</h1>
                    <Button size="xs" variant="secondary"><Star className="mr-1 h-3 w-3" /> Add Capsule</Button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {companyMeta.location}</span>
                    <span className="inline-flex items-center gap-1">{companyMeta.industry}</span>
                    <span>{companyMeta.employees}</span>
                    <span>Revenue: {companyMeta.revenue}</span>
                    <a className="inline-flex items-center gap-1 underline decoration-dotted" href="#" onClick={(e)=>e.preventDefault()}>
                      <Link2 className="h-3 w-3" /> {companyMeta.website}
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline"><Tag className="mr-2 h-4 w-4" /> Tag</Button>
                <Button size="sm" variant="outline"><UploadCloud className="mr-2 h-4 w-4" /> Import RFP</Button>
              </div>
            </div>

            {/* Tab row */}
            <div className="mt-5 flex flex-wrap gap-1">
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-2 text-sm rounded-t-lg border-b-2 -mb-[1px] ${
                    tab === key
                      ? 'border-indigo-600 text-indigo-700 font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* LEFT COLUMN (xl:5) */}
          <div className="xl:col-span-5 space-y-4">
            <KpiStrip />

            <Card className="p-4 rounded-2xl shadow-sm">
              <SectionTitle title="Company Details" />
              <div className="text-sm text-muted-foreground">
                Company description, stock tickers, hierarchy, NAICS/HS overlap, parent/ultimate parent.
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <InfoItem icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value="—" />
                  <InfoItem icon={<Mail className="h-3.5 w-3.5" />} label="Email" value="—" />
                </div>
              </div>
            </Card>

            <Card className="p-4 rounded-2xl shadow-sm">
              <SectionTitle title="Similar Companies" />
              <div className="space-y-2 text-sm">
                <SimilarItem name="Example Co A" />
                <SimilarItem name="Example Co B" />
                <SimilarItem name="Example Co C" />
              </div>
            </Card>

            <Card className="p-4 rounded-2xl shadow-sm">
              <SectionTitle title="Employees location" />
              <div className="text-sm text-muted-foreground">US map heat (placeholder). Wire later.</div>
              <div className="mt-3 h-40 w-full rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border" />
            </Card>

            <Card className="p-4 rounded-2xl shadow-sm">
              <SectionTitle title="Industries" />
              <TagRow tags={['Logistics', 'Manufacturing', 'Retail']} />
              <div className="mt-3" />
              <SectionTitle title="Products & Services" compact />
              <TagRow tags={['sensors', 'fitness', 'wearables', 'supply chain', 'NAICS-339920']} />
            </Card>
          </div>

          {/* MIDDLE COLUMN (xl:5) */}
          <div className="xl:col-span-5 space-y-4">
            <Card className="p-4 rounded-2xl shadow-sm">
              <SectionTitle title="Important to know" />
              <p className="text-sm text-muted-foreground">
                Strategy notes, opportunities, blockers. (We’ll auto-summarize from BTS/Census + CRM soon.)
              </p>
            </Card>

            <Card className="p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between">
                <SectionTitle title="Signals" />
                <Button size="sm" variant="outline">Generate Signals</Button>
              </div>
              <div className="mt-3 h-28 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border flex items-center justify-center text-xs text-muted-foreground">
                Funding / Hiring / Trade spikes (placeholder)
              </div>
            </Card>

            <Card className="p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between">
                <SectionTitle title="Intelligence Feed" />
                <Button size="sm" variant="outline">Add to Target Accounts</Button>
              </div>
              <div className="mt-3 space-y-3">
                <FeedItem title="Partnership news example headline" meta="Sep 9, 2025 • News" />
                <FeedItem title="Port congestion impacts lane ATL → SZX" meta="Sep 15, 2025 • Scoops" />
              </div>
            </Card>
          </div>

          {/* RIGHT COLUMN (xl:2) */}
          <div className="xl:col-span-2 space-y-4">
            <Card className="p-0 overflow-hidden rounded-2xl shadow-sm relative">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-purple-50 opacity-80" />
              <div className="relative p-4">
                <SectionTitle title="Recommended Contacts" />
                <div className="mt-2 text-xs text-muted-foreground">
                  Upgrade to see decision-makers, emails & LinkedIn profiles (Lusha AI / Apollo CRM).
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm">Upgrade</Button>
                  <Button size="sm" variant="outline">Learn more</Button>
                </div>
                <div className="mt-4 space-y-2">
                  <GhostContact name="Marie How" title="Global Manager, Logistics" />
                  <GhostContact name="Ryan Williams" title="VP, Supply Chain" />
                  <GhostContact name="Knox E. Masila" title="Manager, Finance" />
                </div>
              </div>
            </Card>

            <Card className="p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between">
                <SectionTitle title="Activity Feed" />
                <Button size="icon" variant="ghost"><Settings2 className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Connect to view email and calendar engagement history.
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline">Google</Button>
                <Button size="sm" variant="outline">Microsoft</Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Subcomponents ----------

function SectionTitle({ title, compact }: { title: string; compact?: boolean }) {
  return (
    <div className={`text-sm font-semibold ${compact ? '' : 'mb-2'}`}>{title}</div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1">{icon}{value}</div>
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

function KpiStrip() {
  const items = [
    { label: 'Shipments (12m)', value: '—' },
    { label: 'Last Activity', value: '—' },
    { label: 'Top Lane', value: '—' },
    { label: 'Top Carrier', value: '—' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(k => (
        <Card key={k.label} className="p-4 rounded-2xl shadow-sm">
          <div className="text-xs text-muted-foreground">{k.label}</div>
          <div className="text-xl font-semibold">{k.value}</div>
        </Card>
      ))}
    </div>
  );
}
