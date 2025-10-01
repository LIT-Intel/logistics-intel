import React from 'react';

export default function LitKpi({ label, value, accentClass }: { label: string; value: string | number; accentClass: string }) {
  return (
    <div className="relative p-6 rounded-2xl bg-white border border-slate-200 shadow-lg hover:shadow-xl transition">
      <div className={`absolute -top-3 left-6 h-6 w-6 rounded-full bg-gradient-to-r ${accentClass} opacity-80`} />
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-900">{String(value)}</p>
    </div>
  );
}

