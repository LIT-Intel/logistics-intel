import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronRight, Download, Link2, Settings2 } from 'lucide-react';

type LitSearchRow = {
  company_id: string | null;
  company_name: string;
  shipments_12m?: number | null;
  last_activity?: { value?: string | null } | null;
  top_routes?: { origin_country: string | null; dest_country: string | null; shipments: number | null }[] | null;
  top_carriers?: { name: string | null; share_pct: number | null }[] | null;
};

export default function CommandCenterPage() {
  // --- KPI state (live) ---
  const [kpi, setKpi] = useState({
    shipments12m: '—',
    lastActivity: '—',
    topLane: '—',
    topCarrier: '—',
  });
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LitSearchRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function runLitSearch(q: string) {
    setLoading(true);
    setResults(null);
    try {
      const r = await fetch('/api/lit/public/searchCompanies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: q || null, limit: 10, offset: 0 }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setResults((data?.rows as LitSearchRow[]) || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function loadSaved() { try { return JSON.parse(localStorage.getItem('lit:savedCompanies') || '[]'); } catch { return []; } }
  function saveSaved(list: any[]) { localStorage.setItem('lit:savedCompanies', JSON.stringify(list)); }
  function selectAndSave(row: LitSearchRow) {
    const entry = { company_id: row.company_id, name: row.company_name, domain: null, source: 'LIT', ts: Date.now() };
    const next = [entry, ...loadSaved().filter((x: any) => x.company_id !== row.company_id)];
    saveSaved(next);
    localStorage.setItem('lit:selectedCompany', JSON.stringify({ company_id: row.company_id, name: row.company_name, domain: null }));
    setAddOpen(false);
    window.location.reload();
  }

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
    <div className="min-h-screen bg-[#f7f8fb]">
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
            <Button size="xs" variant="outline" onClick={() => setAddOpen(true)}>+ Add Company</Button>
            <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />Export</Button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <KpiStrip kpi={kpi} />
        <Card className="p-4 rounded-2xl shadow-sm">
          <div className="text-sm text-muted-foreground mb-2">Sanity</div>
          <div className="text-xl font-semibold">Route sanity check OK.</div>
        </Card>
      </div>

      {addOpen && (
        <div style={{ position: 'fixed', inset: 0 as any, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '720px', maxWidth: '92vw', background: '#fff', borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', border: '1px solid #e5e7eb' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Add Company</div>
              <button onClick={() => setAddOpen(false)} style={{ fontSize: 14, color: '#6b7280' }}>Close</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>LIT Search</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  className="w-full"
                  placeholder="Search by name (e.g., Dole, Acme Robotics)…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runLitSearch(query)}
                />
                <Button onClick={() => runLitSearch(query)} disabled={loading}>{loading ? 'Searching…' : 'Search'}</Button>
              </div>
              <div style={{ marginTop: 16, maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results === null && <div style={{ fontSize: 14, color: '#6b7280' }}>Enter a query to search.</div>}
                {results?.length === 0 && <div style={{ fontSize: 14, color: '#6b7280' }}>No results.</div>}
                {results && results.map((row) => (
                  <div key={`${row.company_id}-${row.company_name}`} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{row.company_name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        Shipments(12m): {row.shipments_12m ?? '—'} • Top lane: {row.top_routes?.[0]?.origin_country ?? '—'} → {row.top_routes?.[0]?.dest_country ?? '—'}
                      </div>
                    </div>
                    <button onClick={() => selectAndSave(row)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}>Save</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
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

function KpiStrip({ kpi }: { kpi: { shipments12m: string; lastActivity: string; topLane: string; topCarrier: string } }) {
  const items = [
    { label: 'Shipments (12m)', value: kpi.shipments12m },
    { label: 'Last Activity', value: kpi.lastActivity },
    { label: 'Top Lane', value: kpi.topLane },
    { label: 'Top Carrier', value: kpi.topCarrier },
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
