import { useState } from 'react';
import { usePulseLiveData } from '@/lib/pulse/usePulseLiveData';
import { ArrivalScheduleView } from './views/ArrivalScheduleView';

type View = 'arrival' | 'drayage' | 'carrier';

export function PulseLIVETab({ sourceCompanyKey }: { sourceCompanyKey: string | null }) {
  const [view, setView] = useState<View>('arrival');
  const data = usePulseLiveData(sourceCompanyKey);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        Live container tracking is currently available for Maersk and Hapag-Lloyd shipments. We're working on expanding coverage to additional carriers.
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-sm w-fit">
        <Btn active={view === 'arrival'} onClick={() => setView('arrival')}>Arrival Schedule</Btn>
        <Btn active={view === 'drayage'} onClick={() => setView('drayage')}>Drayage Opportunity</Btn>
        <Btn active={view === 'carrier'} onClick={() => setView('carrier')}>Carrier Mix</Btn>
      </div>
      {data.loading && <div className="py-8 text-center text-slate-500 text-sm">Loading…</div>}
      {!data.loading && view === 'arrival' && <ArrivalScheduleView shipments={data.shipments} />}
      {/* DrayageOpportunityView + CarrierMixView wired in next task */}
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
