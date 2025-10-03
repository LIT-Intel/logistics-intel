import React from 'react';

export default function LitPageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#23135b] to-[#6d28d9] bg-clip-text text-transparent">{title}</h1>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

