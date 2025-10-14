import { useEffect, useState } from 'react';

type LitSearchRow = {
  company_id: string | null;
  company_name: string;
  shipments_12m?: number | null;
  last_activity?: { value?: string | null } | null;
  top_routes?: { origin_country: string | null; dest_country: string | null; shipments: number | null }[] | null;
  top_carriers?: { name: string | null; share_pct: number | null }[] | null;
};

export default function CommandCenterPage() {
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

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Command Center</h1>
      <p style={{ marginBottom: 12 }}>Route sanity check OK.</p>
      <button onClick={() => setAddOpen(true)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}>+ Add Company</button>

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
                <input
                  style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
                  placeholder="Search by name (e.g., Dole, Acme Robotics)…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runLitSearch(query)}
                />
                <button onClick={() => runLitSearch(query)} disabled={loading} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}>{loading ? 'Searching…' : 'Search'}</button>
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
