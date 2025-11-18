import React from 'react';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

export type FiltersState = {
  origin: string[];
  dest: string[];
  hs: string[];
};

export function InlineFilters({ filters, onRemove }: { filters: FiltersState; onRemove: (type: 'origin'|'dest'|'hs', value: string) => void; }) {
  const chips: Array<{type:'origin'|'dest'|'hs'; value:string; label:string}> = [];
  filters.origin.forEach(v=>chips.push({type:'origin', value:v, label:`Origin: ${v}`}));
  filters.dest.forEach(v=>chips.push({type:'dest', value:v, label:`Dest: ${v}`}));
  filters.hs.forEach(v=>chips.push({type:'hs', value:v, label:`HS: ${v}`}));

  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <Badge key={`${c.type}-${c.value}-${i}`} variant="secondary" className="rounded-full bg-indigo-50 border border-indigo-100 text-slate-700">
          {c.label}
          <button className="ml-2 inline-flex" onClick={()=>onRemove(c.type, c.value)} aria-label={`Remove ${c.label}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

