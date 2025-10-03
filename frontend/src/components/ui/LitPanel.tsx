import React from 'react';

export default function LitPanel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="p-6 rounded-3xl bg-white/90 border border-slate-200 shadow-xl backdrop-blur">
      {title ? <h3 className="text-lg font-bold text-[#23135b] mb-3">{title}</h3> : null}
      {children}
    </div>
  );
}

