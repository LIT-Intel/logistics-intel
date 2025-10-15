import React from 'react';

export default function WatermarkGate({ onUpgrade, onLearnMore }: { onUpgrade?: ()=>void; onLearnMore?: ()=>void }){
  return (
    <div className="relative border rounded-2xl p-8 bg-white overflow-hidden">
      <div className="absolute -rotate-12 inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-6xl font-black text-neutral-200 select-none">LIT PRO</div>
      </div>
      <div className="relative">
        <div className="text-lg font-semibold text-neutral-900">Contacts are a Pro feature</div>
        <p className="text-sm text-neutral-600 mt-1">Detailed contacts & enrichment are available on the Pro plan.</p>
        <div className="mt-4 flex gap-2">
          <button className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700" onClick={onUpgrade}>Upgrade</button>
          <button className="px-3 py-1.5 rounded-xl border" onClick={onLearnMore}>Learn more</button>
        </div>
      </div>
    </div>
  );
}
