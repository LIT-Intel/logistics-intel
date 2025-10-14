import * as React from 'react';
import { Building2 } from 'lucide-react';
export default function CompanyAvatar({ name = '', domain, src, size=56 }: {name:string; domain?:string; src?:string; size?:number}){
  const letter = (name||'?').trim().charAt(0).toUpperCase();
  return (
    <div style={{width:size,height:size}} className="relative grid place-items-center rounded-xl bg-[var(--lit-panel-2)] ring-1 ring-[var(--lit-border)] overflow-hidden">
      {src ? (<img alt={name} src={src} className="w-full h-full object-cover" />) : (
        <div className="grid place-items-center text-[var(--lit-primary-light)]">
          <Building2 className="opacity-80" size={Math.max(22,Math.round(size*0.42))} />
          <span className="sr-only">{letter}</span>
        </div>
      )}
      <div className="absolute inset-0 pointer-events-none" style={{background:'var(--lit-grad-sheen)'}}/>
    </div>
  );
}
