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
          {/* --- Featured icon + title (Command Center) */}
          {(() => {
            const CommandIcon = () => (
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" className="drop-shadow-sm">
                <defs>
                  <linearGradient id="litGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6EE7F9"/>
                    <stop offset="50%" stopColor="#60A5FA"/>
                    <stop offset="100%" stopColor="#A78BFA"/>
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#litGrad)"/>
                <path d="M7 12h10M12 7v10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            );
            return (
              <h1 className="text-[22px] md:text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                <CommandIcon />
                <span>LIT Command Center</span>
              </h1>
            );
          })()}
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

