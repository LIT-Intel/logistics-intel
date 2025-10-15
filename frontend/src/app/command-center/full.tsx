import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import SavedCompaniesPicker from '@/components/command-center/SavedCompaniesPicker';
import { Package as PackageIcon, Clock, Layers, TrendingUp, ChevronRight } from 'lucide-react';

// Types for KPI and search response
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

export default function CommandCenterFull() {
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [kpi, setKpi] = useState<Kpi>({ shipments12m: '—', lastActivity: '—', totalTeus: '—', growthRate: '—' });

  useEffect(() => {
    // Seed from saved selection if available
    try {
      const saved = JSON.parse(localStorage.getItem('lit:selectedCompany') ?? 'null');
      if (saved?.name) setQuery(String(saved.name));
      if (saved) void run(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(saved?: { company_id?: string | null; name?: string | null }) {
    setLoading(true);
    try {
      const body = saved?.company_id ? { company_id: saved.company_id, limit: 1, offset: 0 } : { q: (saved?.name || query || null), limit: 1, offset: 0 };
      const r = await fetch('/api/lit/public/searchCompanies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
    } catch {
      setKpi({ shipments12m: '—', lastActivity: '—', totalTeus: '—', growthRate: '—' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="cc-root" className="min-h-screen bg-gray-50" data-cc-build="v2.4-full-2025-10-15">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600" />
          <div className="text-sm text-gray-500">Company Search</div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
          <div className="text-sm font-medium text-gray-800">Command Center</div>
          <div className="ml-auto flex items-center gap-2">
            <SavedCompaniesPicker onPicked={() => { /* page reload in picker */ }} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6">
        {/* Search Bar */}
        <div className="flex items-center gap-2 mb-6">
          <Input
            value={query}
            onChange={(e)=> setQuery(e.target.value)}
            placeholder="Search companies or contacts..."
            className="w-full max-w-xl h-10 rounded-lg border border-gray-300 placeholder:text-gray-400"
          />
          <Button size="sm" disabled={loading} onClick={()=> run()} className="h-10">Load</Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="p-5 rounded-xl shadow-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-3 mb-1">
              <PackageIcon className="w-4 h-4 text-indigo-500" />
              <div className="text-xs uppercase text-gray-500 font-medium">Shipments (12m)</div>
            </div>
            <div className="text-3xl font-extrabold text-gray-900">{kpi.shipments12m}</div>
          </Card>
          <Card className="p-5 rounded-xl shadow-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-3 mb-1">
              <Clock className="w-4 h-4 text-amber-600" />
              <div className="text-xs uppercase text-gray-500 font-medium">Last Activity</div>
            </div>
            <div className="text-3xl font-extrabold text-gray-900">{kpi.lastActivity}</div>
          </Card>
          <Card className="p-5 rounded-xl shadow-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-3 mb-1">
              <Layers className="w-4 h-4 text-rose-600" />
              <div className="text-xs uppercase text-gray-500 font-medium">Total TEUs</div>
            </div>
            <div className="text-3xl font-extrabold text-gray-900">{kpi.totalTeus}</div>
          </Card>
          <Card className="p-5 rounded-xl shadow-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-3 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <div className="text-xs uppercase text-gray-500 font-medium">Growth Rate</div>
            </div>
            <div className="text-3xl font-extrabold text-gray-900">{kpi.growthRate}</div>
          </Card>
        </div>

        {/* Placeholder sections to be built next */}
        <div className="space-y-8">
          <Card className="p-6 rounded-xl shadow-sm border border-gray-200 bg-white">
            <div className="text-lg font-semibold text-gray-900 mb-2">Company Overview</div>
            <div className="text-sm text-gray-600">Add company header, actions, and description here.</div>
          </Card>
          <Card className="p-6 rounded-xl shadow-sm border border-gray-200 bg-white">
            <div className="text-lg font-semibold text-gray-900 mb-2">Shipments</div>
            <div className="text-sm text-gray-600">Add shipments table and charts here.</div>
          </Card>
          <Card className="p-6 rounded-xl shadow-sm border border-gray-200 bg-white">
            <div className="text-lg font-semibold text-gray-900 mb-2">Contacts</div>
            <div className="text-sm text-gray-600">Add contact cards with actions here.</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
