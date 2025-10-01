import React, { useMemo, useState } from 'react';

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className='px-2 py-0.5 rounded-full text-xs bg-white/70 border border-white/60 shadow-sm'>{children}</span>
);

function CompanyCard({ c, active, onClick }: { c: any; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full text-left rounded-2xl p-4 mb-3 transition shadow hover:shadow-lg border ${active ? 'border-slate-300 bg-white' : 'border-white/40 bg-gradient-to-br from-white/80 to-white/60 backdrop-blur'}`}>
      <div className='font-semibold'>{c.name}</div>
      <div className='text-xs text-slate-500'>Shipments 12M</div>
      <div className='text-lg font-extrabold'>{(c.kpis?.shipments12m ?? 0).toLocaleString()}</div>
      <div className='mt-1 text-[11px] text-slate-500'>Last: {c.kpis?.lastActivity || '—'}</div>
      <div className='mt-2 flex gap-1 flex-wrap'>{(c.kpis?.originsTop || []).slice(0, 3).map((x: string) => (<Pill key={x}>{x}</Pill>))}</div>
    </button>
  );
}

function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className='flex gap-2 border-b border-white/60 mb-4'>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} className={`px-3 py-2 text-sm ${value === t ? 'border-b-2 border-slate-900 font-semibold' : 'text-slate-500'}`}>{t}</button>
      ))}
    </div>
  );
}

export default function Workspace({ companies, onAdd }: { companies: any[]; onAdd: () => void }) {
  const [activeId, setActiveId] = useState(companies[0]?.id);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(c => String(c.name || '').toLowerCase().includes(q));
  }, [companies, query]);
  const active = useMemo(() => companies.find(c => c.id === activeId), [companies, activeId]);
  const [tab, setTab] = useState('Overview');

  return (
    <div className='max-w-7xl mx-auto flex flex-col lg:flex-row gap-4 px-5 md:px-5'>
      <aside className='w-full lg:w-[320px] xl:w-[360px] shrink-0'>
        <div className='rounded-3xl p-4 bg-white/80 backdrop-blur border border-white/50 shadow-xl'>
          <div className='mb-3 flex items-center justify-between gap-2'>
            <h2 className='text-sm font-semibold text-slate-700'>Companies</h2>
            <button onClick={onAdd} className='text-xs px-2 py-1 rounded-lg border bg-gradient-to-r from-blue-600 to-blue-500 text-white'>Add</button>
          </div>
          <div className='mb-3'>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder='Search companies…' className='w-full text-sm border rounded-lg px-3 py-2 bg-white/70' />
          </div>
          <div className='max-h-[70vh] overflow-auto pr-1'>
            {filtered.map(c => (
              <CompanyCard key={c.id} c={c} active={c.id === activeId} onClick={() => { setActiveId(c.id); setTab('Overview'); }} />
            ))}
            {filtered.length === 0 && (
              <div className='text-xs text-slate-500 py-6 text-center'>No companies match “{query}”.</div>
            )}
          </div>
        </div>
      </aside>
      <main className='min-w-0 flex-1'>
        <div className='rounded-3xl p-5 md:p-6 bg-white/80 backdrop-blur border border-white/50 shadow-2xl' style={{ marginLeft: 20, marginRight: 20 }}>
          {active ? (
            <>
              <div className='flex items-center justify-between gap-4 flex-wrap'>
                <div>
                  <h1 className='text-2xl font-black text-slate-900'>{active.name}</h1>
                  <div className='text-xs text-slate-500'>ID: {active.id}</div>
                </div>
                <div className='flex gap-2 text-xs'>
                  {(active.kpis?.destsTop || []).map((d: string) => (<Pill key={d}>Dest {d}</Pill>))}
                </div>
              </div>
              <div className='mt-4'>
                <Tabs tabs={["Overview", "Shipments", "Contacts", "Activity", "Campaigns", "Settings"]} value={tab} onChange={setTab} />
                <div className='text-sm text-slate-600'>Select Overview to see the Pre-Call demo once wired.</div>
              </div>
            </>
          ) : (
            <div className='text-slate-500'>Select a company…</div>
          )}
        </div>
      </main>
    </div>
  );
}

