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
      const rawA = localStorage.getItem(LS_KEY);
      const rawB = localStorage.getItem('manualCompanies');
      const a = rawA ? JSON.parse(rawA) : [];
      const b = rawB ? JSON.parse(rawB) : [];
      const map = new Map<string, any>();
      [...a, ...b].forEach((c: any) => {
        const id = String(c?.id || c?.company_id || '');
        if (!id) return;
        if (!map.has(id)) map.set(id, c);
      });
      const merged = Array.from(map.values());
      if (merged.length) setCompanies(merged);
    } catch {}
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY || e.key === 'manualCompanies') {
        try {
          const a = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
          const b = JSON.parse(localStorage.getItem('manualCompanies') || '[]');
          const map = new Map<string, any>();
          [...a, ...b].forEach((c: any) => { const id = String(c?.id || c?.company_id || ''); if (id && !map.has(id)) map.set(id, c); });
          setCompanies(Array.from(map.values()));
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
        <header className='mb-4 flex items-center gap-3'>
          <CommandIcon />
          <h1 className='text-4xl md:text-5xl font-extrabold tracking-tight uppercase'>LIT Command Center</h1>
        </header>
      </div>
      <main className='pl-4 pr-[10px] py-2'>
        <Workspace companies={companies} onAdd={() => setOpen(true)} />
      </main>
      <CreateCompanyModal open={open} onClose={() => setOpen(false)} onCreated={onCreated} />
    </div>
  );
}

