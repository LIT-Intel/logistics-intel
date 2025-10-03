import React, { useEffect, useState } from 'react';
import CommandIcon from '../../components/common/CommandIcon';
import CreateCompanyModal from '../../components/company/CreateCompanyModal';
import Workspace from '../../components/company/Workspace';
import LitPageHeader from '../../components/ui/LitPageHeader';

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
      // Migrate any RFP Studio payloads into Command Center if missing
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) as string;
          if (!key) continue;
          if (!key.startsWith('lit_rfp_payload_')) continue;
          const cid = key.replace('lit_rfp_payload_', '');
          if (cid && !map.has(cid)) {
            const payload = JSON.parse(localStorage.getItem(key) || 'null');
            const name = (payload && payload.meta && (payload.meta.customer || payload.meta.bid_name)) || 'Company';
            map.set(cid, { id: cid, name, kpis: { shipments12m: 0, lastActivity: null, originsTop: [], destsTop: [], carriersTop: [] } });
          }
        }
      } catch {}
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
      <div className='pl-[5px] pr-[5px] pt-[5px]'>
        <LitPageHeader title="LIT Command Center" />
      </div>
      <div className='w-full pl-[5px] pr-[5px]'>
        {/* Render Workspace once (includes left rail + main) */}
        <Workspace companies={companies} onAdd={() => setOpen(true)} />
      </div>
      <CreateCompanyModal open={open} onClose={() => setOpen(false)} onCreated={onCreated} />
    </div>
  );
}

