import { useEffect, useState } from 'react';
import CommandIcon from '@/components/common/CommandIcon';
import PreCallBriefing from '@/components/company/PreCallBriefing';
import { searchCompanies, getCompanyShipments, recallCompany, kpiFrom, CompanyItem } from '@/lib/api';
import { buildPreCallPrompt } from '@/lib/ai';

export default function CompanyPage() {
  const id = String((typeof window !== 'undefined' && (window as any).location?.pathname?.split?.('/').pop()) || '');
  const [company, setCompany] = useState<CompanyItem | null>(null);
  const [ship, setShip] = useState<any[]>([]);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);
      setErr(null);
      try {
        const res = await searchCompanies({ limit: 50, offset: 0 });
        const match = (res as any).items?.find((x: any) => x.company_id === id) || (res as any).items?.[0];
        setCompany(match || null);
        const s = await getCompanyShipments(id, 20, 0);
        setShip(s.rows || []);
        if (match) {
          const k = kpiFrom(match);
          const prompt = buildPreCallPrompt({
            company: {
              id,
              name: match.company_name || 'Unknown',
              shipments12m: k.shipments12m,
              lastActivity: k.lastActivity as any,
              originsTop: k.originsTop,
              destsTop: k.destsTop,
              carriersTop: k.carriersTop,
            },
            shipments: s.rows || [],
          });
          const ai = await recallCompany({ company_id: id, questions: [prompt] });
          const theme = (match.company_name || '').toLowerCase().includes('pride') ? 'pride' : ((match.company_name || '').toLowerCase().includes('wahoo') ? 'wahoo' : 'default');
          setData({
            name: match.company_name || 'Company',
            theme,
            kpis: k,
            charts: {
              growth: [{ y: 100, x: '2013' }, { y: 150, x: '2014' }, { y: 220, x: '2015' }, { y: 335, x: '2016' }],
              ecosystem: [{ label: 'Indoor', value: 35 }, { label: 'Outdoor', value: 30 }, { label: 'Monitoring', value: 15 }, { label: 'Software', value: 20 }],
              competition: [{ k: 'Hardware', [match.company_name || 'Co']: 8, Market: 7 }, { k: 'Software', [match.company_name || 'Co']: 7, Market: 8 }, { k: 'Pro Adoption', [match.company_name || 'Co']: 9, Market: 7 }, { k: 'Value', [match.company_name || 'Co']: 7, Market: 8 }, { k: 'Brand', [match.company_name || 'Co']: 8, Market: 8 }],
              sourcing: (k.originsTop?.length ? (k.originsTop as any[]).map((c: string, i: number) => ({ country: c, pct: [60, 25, 15, 10, 8][i] || 10 })) : [{ country: 'CN', pct: 50 }, { country: 'VN', pct: 35 }, { country: 'KR', pct: 15 }]),
            },
            ai: { summary: (ai as any)?.summary || '', bullets: Array.isArray((ai as any)?.bullets) ? (ai as any).bullets : [] },
          });
        }
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (err) return <div className='p-6 text-red-700'>Error: {err}</div>;
  if (loading || !company || !data) return <div className='p-6'>Loading…</div>;

  return (
    <div className='max-w-6xl mx-auto p-6 space-y-4'>
      <div className='flex items-center justify-between gap-4 flex-wrap'>
        <div>
          <h1 className='text-[22px] md:text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2'>
            <CommandIcon />
            <span>LIT Command Center</span>
          </h1>
          <div className='text-xs opacity-60'>ID: {id}</div>
        </div>
        <div className='flex gap-2'>
          <button className='rounded border px-3 py-1.5 text-sm' onClick={async () => {
            const base = (import.meta as any)?.env?.VITE_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
            await fetch(`${base}/crm/saveCompany`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ company_id: id, company_name: data.name, source: 'company' }) });
            alert('Saved to CRM');
          }}>Save to CRM</button>
          <button className='rounded border px-3 py-1.5 text-sm' onClick={async () => {
            const base = (import.meta as any)?.env?.VITE_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
            await fetch(`${base}/crm/enrich`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ company_id: id }) });
            alert('Enrichment queued');
          }}>Enrich Now</button>
          <button className='rounded border px-3 py-1.5 text-sm' onClick={async () => {
            const k = kpiFrom(company!);
            const s = await getCompanyShipments(id, 20, 0);
            const prompt = buildPreCallPrompt({ company: { id, name: data.name, shipments12m: k.shipments12m, lastActivity: k.lastActivity as any, originsTop: k.originsTop, destsTop: k.destsTop, carriersTop: k.carriersTop }, shipments: s.rows || [] });
            const ai = await recallCompany({ company_id: id, questions: [prompt] });
            setData((prev: any) => prev ? { ...prev, ai: { summary: (ai as any)?.summary || '', bullets: Array.isArray((ai as any)?.bullets) ? (ai as any).bullets : [] } } : prev);
          }}>Refresh Recall</button>
        </div>
      </div>
      <PreCallBriefing company={{ name: data.name, kpis: data.kpis, charts: data.charts, ai: data.ai }} />
    </div>
  );
}

