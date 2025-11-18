'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { CampaignTemplate } from './types';
import { cn } from '@/lib/utils';

export type TemplatePickerProps = {
  templates: CampaignTemplate[];
  onSelect: (template: CampaignTemplate) => void;
};

const ALL = 'All';

export function TemplatePicker({ templates, onSelect }: TemplatePickerProps) {
  const categories = useMemo(() => {
    const unique = new Set<string>();
    templates.forEach((tpl) => unique.add(tpl.category));
    return [ALL, ...Array.from(unique)];
  }, [templates]);

  const [selectedCategory, setSelectedCategory] = useState<string>(ALL);

  const filtered = useMemo(() => {
    if (selectedCategory === ALL) return templates;
    return templates.filter((template) => template.category === selectedCategory);
  }, [templates, selectedCategory]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={cn(
              'rounded-full px-3 py-1 text-sm transition',
              selectedCategory === category ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            )}
            type="button"
          >
            {category}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((template) => (
          <Card
            key={template.id}
            className="group cursor-pointer border-slate-200 bg-white transition hover:border-indigo-200 hover:bg-indigo-50"
            onClick={() => onSelect(template)}
          >
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-800">{template.name}</CardTitle>
              <div className="text-xs uppercase tracking-wide text-indigo-500">{template.category}</div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              {template.description ? (
                <p>{template.description}</p>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-500">
                <div className="font-medium text-slate-700">Subject</div>
                <div>{template.subject}</div>
                <div className="mt-2 font-medium text-slate-700">Body</div>
                <div className="line-clamp-4 whitespace-pre-line">{template.body}</div>
              </div>
              <Button size="sm" className="rounded-xl" variant="outline" onClick={() => onSelect(template)}>
                Use Template
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default TemplatePicker;
