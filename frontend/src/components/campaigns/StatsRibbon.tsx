'use client';

import type { CampaignMetrics } from './types';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type StatKey = keyof Pick<CampaignMetrics, 'sent' | 'opens' | 'replies'>;

const LABELS: Record<StatKey, { label: string }> = {
  sent: { label: 'Sends' },
  opens: { label: 'Opens' },
  replies: { label: 'Replies' },
};

export type StatsRibbonProps = {
  metrics: CampaignMetrics;
  className?: string;
};

export function StatsRibbon({ metrics, className }: StatsRibbonProps) {
  return (
    <div
      className={cn(
        'grid gap-3 rounded-3xl bg-gradient-to-r from-indigo-50 via-white to-slate-50 p-5 transition shadow-sm',
        'md:grid-cols-3',
        className
      )}
    >
      {(Object.keys(LABELS) as StatKey[]).map((key) => (
        <Card
          key={key}
          className="border-slate-200 bg-white/80 p-4 shadow-sm ring-1 ring-inset ring-white/50"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {LABELS[key].label}
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-800">
            {metrics[key].toLocaleString()}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default StatsRibbon;
