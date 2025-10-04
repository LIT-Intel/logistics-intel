import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Phone, Linkedin, UserPlus } from 'lucide-react';
import type { ContactCore } from '@/types/contacts';

function Avatar({ name }: { name: string }) {
  const initials = React.useMemo(() => name.split(' ').map((n)=>n[0]).slice(0,2).join('').toUpperCase(), [name]);
  return <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm"><span className="text-base font-semibold">{initials}</span></div>;
}

export default function RfpPanel({ primary }: { primary?: ContactCore }){
  return (
    <Card className="rounded-2xl border shadow-sm">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">RFP Contact</div>
          <Button variant="outline"><UserPlus className="mr-2 h-4 w-4"/>Add to Campaign</Button>
        </div>
        {primary ? (
          <div className="flex items-center gap-4">
            <Avatar name={primary.fullName}/>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate font-medium">{primary.fullName}</div>
                <Badge>Primary</Badge>
              </div>
              <div className="text-sm text-muted-foreground">{primary.title}</div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                {primary.email && <div className="flex items-center gap-1"><Mail className="h-4 w-4"/> {primary.email}</div>}
                {primary.phone && <div className="flex items-center gap-1"><Phone className="h-4 w-4"/> {primary.phone}</div>}
                {primary.linkedin && <a href={primary.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><Linkedin className="h-4 w-4"/> LinkedIn</a>}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No primary contact selected.</div>
        )}
      </CardContent>
    </Card>
  );
}

