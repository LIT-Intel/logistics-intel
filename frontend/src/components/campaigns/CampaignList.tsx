'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { Search, Plus, Pause, Play, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CampaignSummary } from './types';

const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline'; icon: ReactElement }> = {
  running: { label: 'Running', variant: 'default', icon: <Play className="h-4 w-4" /> },
  paused: { label: 'Paused', variant: 'secondary', icon: <Pause className="h-4 w-4" /> },
  draft: { label: 'Draft', variant: 'outline', icon: <Circle className="h-4 w-4" /> },
};

export type CampaignListProps = {
  items: CampaignSummary[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onCreate?: () => void;
};

export function CampaignList({ items, selectedId, onSelect, onCreate }: CampaignListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const term = search.trim().toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(term));
  }, [items, search]);

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-slate-700">Campaigns</div>
          <Button size="sm" className="rounded-2xl" onClick={onCreate}>
            <Plus className="h-4 w-4" /> New Campaign
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search campaigns"
            className="pl-9"
          />
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No campaigns yet. Create one to get started.
            </div>
          ) : (
            filtered.map((campaign) => {
              const meta = STATUS_META[(campaign.status || '').toLowerCase()] ?? {
                label: campaign.status || 'Unknown',
                variant: 'outline' as const,
                icon: <Circle className="h-4 w-4" />,
              };

              return (
                <button
                  key={campaign.id}
                  onClick={() => onSelect?.(campaign.id)}
                  className={cn(
                    'w-full rounded-2xl border px-4 py-3 text-left transition',
                    'hover:border-indigo-200 hover:bg-indigo-50',
                    selectedId === campaign.id ? 'border-indigo-400 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800">{campaign.name}</div>
                        <Badge variant={meta.variant} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 capitalize">
                          {meta.icon}
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Updated {campaign.updatedAt}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-xs text-slate-500">
                      <span>Enrolled</span>
                      <span className="font-semibold text-slate-700">{campaign.stats.enrolled}</span>
                      <span>Sent</span>
                      <span className="font-semibold text-slate-700">{campaign.stats.sent}</span>
                      <span>Opens</span>
                      <span className="font-semibold text-slate-700">{campaign.stats.opens}</span>
                      <span>Replies</span>
                      <span className="font-semibold text-slate-700">{campaign.stats.replies}</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CampaignList;
