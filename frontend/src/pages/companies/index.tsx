import React, { useEffect, useState } from 'react';
import CreateCompanyModal from '@/components/company/CreateCompanyModal';
import Workspace from '@/components/company/Workspace';

type CompanyLite = { id: string; name: string; kpis?: any; charts?: any; ai?: any };

const LS_KEY = 'lit_companies';

export default function Companies() {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyLite[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setCompanies(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(companies)); } catch {}
  }, [companies]);

  function onCreated(id: string, name: string) {
    const fresh: CompanyLite = {
      id,
      name,
      kpis: { shipments12m: 0, lastActivity: null, originsTop: [], destsTop: [], carriersTop: [] },
      charts: { growth: [], ecosystem: [], competition: [{ k: 'Scale', [name]: 7, Market: 7 }], sourcing: [] },
      ai: { summary: 'Pending enrichment…', bullets: ['—'] },
    } as any;
    setCompanies(prev => [fresh, ...prev]);
  }

  return (
    <div className='min-h-screen w-full bg-gradient-to-br from-gray-50 to-white'>
      <header className='sticky top-0 z-10 bg-white/70 backdrop-blur border-b'>
        <div className='max-w-7xl mx-auto px-4 py-3 flex items-center justify-between'>
          <div className='font-black text-xl tracking-tight'>LIT — Companies</div>
          <div className='text-xs text-gray-500'>Save from Search will appear here</div>
        </div>
      </header>
      <main className='px-4 py-6'>
        <Workspace companies={companies} onAdd={() => setOpen(true)} />
      </main>
      <CreateCompanyModal open={open} onClose={() => setOpen(false)} onCreated={onCreated} />
    </div>
  );
}

