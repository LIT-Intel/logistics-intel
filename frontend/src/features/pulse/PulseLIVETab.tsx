import { useState } from 'react';
import { usePulseLiveData } from '@/lib/pulse/usePulseLiveData';
import { DrayageOpportunityView } from './views/DrayageOpportunityView';
import { CarrierMixView } from './views/CarrierMixView';
import { BolPreviewTable, type BolColumn } from '@/components/bols/BolPreviewTable';
import { exportPulseLiveReportPdf } from '@/lib/pulse/exportPulseLiveReportPdf';
import { exportPulseLiveReportXlsx } from '@/lib/pulse/exportPulseLiveReportXlsx';

type View = 'all' | 'drayage' | 'carrier';

const ALL_SHIPMENTS_COLUMNS: BolColumn[] = [
  'date', 'bol_number', 'lane', 'carrier', 'supplier', 'container',
  'container_type', 'teu', 'fcl_lcl', 'hs', 'final_dest',
];

export function PulseLIVETab({ sourceCompanyKey, companyName }: { sourceCompanyKey: string | null; companyName?: string }) {
  const [view, setView] = useState<View>('all');
  const data = usePulseLiveData(sourceCompanyKey);

  function downloadPdf() {
    exportPulseLiveReportPdf({
      companyName: companyName || 'Saved Company',
      generatedAt: new Date(),
      shipments: data.shipments,
      drayage: data.drayage,
      carrierMix: data.carrierMix,
    });
  }

  function downloadXlsx() {
    exportPulseLiveReportXlsx({
      companyName: companyName || 'Saved Company',
      generatedAt: new Date(),
      shipments: data.shipments,
      drayage: data.drayage,
      carrierMix: data.carrierMix,
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        Live container tracking is currently available for Maersk and Hapag-Lloyd shipments. We're working on expanding coverage to additional carriers.
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-sm w-fit">
          <Btn active={view === 'all'} onClick={() => setView('all')}>All Shipments</Btn>
          <Btn active={view === 'drayage'} onClick={() => setView('drayage')}>Drayage Opportunity</Btn>
          <Btn active={view === 'carrier'} onClick={() => setView('carrier')}>Carrier Mix</Btn>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadPdf} className="text-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">Download PDF</button>
          <button onClick={downloadXlsx} className="text-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">Download Excel</button>
        </div>
      </div>
      {data.loading && <div className="py-8 text-center text-slate-500 text-sm">Loading…</div>}
      {!data.loading && view === 'all' && (
        <BolPreviewTable
          bols={data.allBols}
          columns={ALL_SHIPMENTS_COLUMNS}
          emptyMessage="No shipments yet."
        />
      )}
      {!data.loading && view === 'drayage' && <DrayageOpportunityView drayage={data.drayage} shipments={data.shipments} />}
      {!data.loading && view === 'carrier' && <CarrierMixView data={data} />}
    </div>
  );
}

function Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        active ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}
