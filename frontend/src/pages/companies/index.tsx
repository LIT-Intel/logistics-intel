import React, { useEffect, useState } from 'react';
import CommandIcon from '@/components/common/CommandIcon';
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
      <div className='px-6 py-4'>
        <header className='mb-4 flex items-center gap-2'>
          <CommandIcon />
          <h1 className='text-2xl font-semibold tracking-tight'>LIT Command Center</h1>
        </header>
      </div>
      <main className='pl-4 pr-[10px] py-2'>
        <Workspace companies={companies} onAdd={() => setOpen(true)} />
      </main>
      <CreateCompanyModal open={open} onClose={() => setOpen(false)} onCreated={onCreated} />
    </div>
  );
}

