import { useEffect, useState } from 'react';
import CompanyShipmentsPanel from '@/components/company/CompanyShipmentsPanel';
import { getGatewayBase } from '@/lib/env';

type CompanySummary = {
  company_id?: string | null;
  company_name?: string;
  shipments_12m?: number | null;
  last_activity?: string | { value?: string } | null;
  top_routes?: Array<{ origin_country?: string; dest_country?: string }>;
};

function formatNumber(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return '?';
  return Number(value).toLocaleString();
}

function formatDate(value: CompanySummary['last_activity']) {
  if (!value) return '?';
  const raw = typeof value === 'object' && value !== null && 'value' in value ? value.value : value;
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CompanyPage() {
  const id = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() ?? '' : '';
  const [company, setCompany] = useState<CompanySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    const base = getGatewayBase();
    setLoading(true);
    setError(null);
    fetch(`${base}/public/searchCompanies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: id, limit: 5, offset: 0 })
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const found = rows.find((row: any) => String(row?.company_id || '').trim() === id.trim());
        setCompany(found ?? rows[0] ?? null);
      })
      .catch((err: any) => {
        if (!ac.signal.aborted) setError(err?.message || 'Failed to load company');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [id]);

  if (!id) {
    return <div className="p-6 text-sm text-slate-600">No company selected.</div>;
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading company?</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  if (!company) {
    return <div className="p-6 text-sm text-slate-600">Company not found.</div>;
  }

  const topRoutes = Array.isArray(company.top_routes) ? company.top_routes.slice(0, 5) : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-bold text-slate-900">{company.company_name || 'Company'}</h1>
        <div className="text-sm text-slate-600">ID: {id}</div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <span>Shipments (12m): {formatNumber(company.shipments_12m)}</span>
          <span>Last Activity: {formatDate(company.last_activity)}</span>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-800">Top Routes</h2>
        {topRoutes.length ? (
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {topRoutes.map((route, idx) => (
              <li key={`${route.origin_country || idx}-${idx}`}>
                {(route.origin_country || '?')} ? {(route.dest_country || '?')}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-slate-500">No route data available.</div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Recent Shipments</h2>
        <CompanyShipmentsPanel companyId={id} limit={50} />
      </section>
    </div>
  );
}
