import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Linkedin, Star } from 'lucide-react';
import type { ContactCore } from '@/types/contacts';

const Dot = () => <span className="mx-1 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50 align-middle"/>;

function Avatar({ name }: { name: string }) {
  const initials = React.useMemo(() => name.split(' ').map((n)=>n[0]).slice(0,2).join('').toUpperCase(), [name]);
  return <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm"><span className="text-sm font-semibold">{initials}</span></div>;
}

export default function ContactsList({ rows, onSelect, onSetPrimary }: { rows: ContactCore[]; onSelect: (c: ContactCore)=>void; onSetPrimary: (id: string)=>void }) {
  return (
    <Card className="rounded-2xl border shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3 text-sm font-medium">Key Logistics Contacts</div>
        <div className="divide-y">
          {rows.map((c) => (
            <div key={c.id} className="flex cursor-pointer items-center justify-between gap-4 py-3 hover:bg-muted/30 rounded-lg px-2" onClick={() => onSelect(c)}>
              <div className="flex items-center gap-3">
                <Avatar name={c.fullName} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-medium">{c.fullName}</div>
                    {c.isPrimary && <Badge className="bg-indigo-600">Primary</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.title} <Dot/> {c.department || '—'} <Dot/> {c.location || '—'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline"><Linkedin className="h-4 w-4"/></a>}
                {!c.isPrimary && <Button size="sm" variant="outline" onClick={(e)=>{e.stopPropagation(); onSetPrimary(c.id);}}><Star className="mr-1 h-4 w-4"/>Primary</Button>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

