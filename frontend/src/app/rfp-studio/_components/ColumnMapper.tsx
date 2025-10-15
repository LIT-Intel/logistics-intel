import React from 'react';

export default function ColumnMapper({ headers, detected, onMap }: { headers: string[]; detected: Record<string,string>; onMap: (k:string,v:string)=>void }) {
  const keys = Object.keys(detected || {});
  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white/90">
      <div className="text-sm font-semibold text-slate-900 mb-3">Low confidence mapping — verify fields</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {keys.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <div className="w-40 text-sm text-slate-700">{k}</div>
            <select className="flex-1 text-sm border rounded-lg p-2 bg-white/90" value={detected[k] || ''} onChange={(e)=> onMap(k, e.target.value)}>
              <option value="">— Select column —</option>
              {headers.map((h: string) => (<option key={h} value={h}>{h}</option>))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
