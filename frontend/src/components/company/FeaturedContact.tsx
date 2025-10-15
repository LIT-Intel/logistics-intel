import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Phone, Linkedin, Star } from 'lucide-react';
import type { ContactCore } from '@/types/contacts';

function Avatar({ name }: { name: string }) {
  const initials = React.useMemo(() => name.split(' ').map((n)=>n[0]).slice(0,2).join('').toUpperCase(), [name]);
  return <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm"><span className="text-lg font-semibold">{initials}</span></div>;
}

export default function FeaturedContact({ c, onSetPrimary }: { c: ContactCore; onSetPrimary: (id: string)=>void }) {
  return (
    <Card className="rounded-2xl border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <Avatar name={c.fullName} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-xl font-semibold">{c.fullName}</h3>
              {c.isPrimary && <Badge className="bg-indigo-600">Primary</Badge>}
              {typeof c.confidence === 'number' && <Badge variant="outline">Conf {(c.confidence*100).toFixed(0)}%</Badge>}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">{c.title}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {c.email && <div className="flex items-center gap-1"><Mail className="h-4 w-4"/> <span className="truncate">{c.email}</span></div>}
              {c.phone && <div className="flex items-center gap-1"><Phone className="h-4 w-4"/> <span>{c.phone}</span></div>}
              {c.linkedin && <a className="inline-flex items-center gap-1 text-indigo-600 hover:underline" href={c.linkedin} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4"/> LinkedIn</a>}
            </div>
          </div>
          {!c.isPrimary && (
            <Button onClick={() => onSetPrimary(c.id)}><Star className="mr-2 h-4 w-4"/> Set Primary</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

