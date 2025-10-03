import React from 'react';

export default function LitSidebar({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="w-80 p-5 bg-white/75 border-r border-slate-200 shadow-xl backdrop-blur-md text-slate-900">
      <h2 className="text-xl font-extrabold tracking-wide mb-6 flex items-center gap-2 text-[#23135b]">
        <span className="w-3 h-3 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500" />{title}
      </h2>
      {children}
    </aside>
  );
}

