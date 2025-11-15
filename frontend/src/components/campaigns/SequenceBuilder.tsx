'use client';

import { ClipboardList, Clock3, Mail, Linkedin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SequenceStep } from './types';

function StepBadge({ type }: { type: SequenceStep['type'] }) {
  if (type === 'email') {
    return (
      <Badge className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700">
        <Mail className="h-3.5 w-3.5" /> Email
      </Badge>
    );
  }
  if (type === 'linkedin') {
    return (
      <Badge className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700">
        <Linkedin className="h-3.5 w-3.5" /> LinkedIn
      </Badge>
    );
  }
  return (
    <Badge className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700">
      <Clock3 className="h-3.5 w-3.5" /> Wait
    </Badge>
  );
}

export type SequenceBuilderProps = {
  steps: SequenceStep[];
  selectedId?: string | null;
  onSelect?: (step: SequenceStep) => void;
  onAddStep?: () => void;
  onUpdateStep?: (step: SequenceStep) => void;
  onPickTemplate?: (step: SequenceStep) => void;
};

export function SequenceBuilder({
  steps,
  selectedId,
  onSelect,
  onAddStep,
  onUpdateStep,
  onPickTemplate,
}: SequenceBuilderProps) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const waitValue = Number.isFinite(step.waitDays) ? Number(step.waitDays) : 0;
        return (
          <Card
            key={step.id}
            className={cn(
              'cursor-pointer border-slate-200 bg-white p-4 transition hover:border-indigo-200 hover:bg-indigo-50',
              selectedId === step.id && 'border-indigo-400 bg-indigo-50 shadow-sm'
            )}
            onClick={() => onSelect?.(step)}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StepBadge type={step.type} />
                    <div className="text-sm font-semibold text-slate-800">
                      {step.title || `Step ${index + 1}`}
                    </div>
                  </div>
                  {step.type === 'email' && step.template?.subject ? (
                    <div className="text-xs text-slate-500 line-clamp-1">Subject: {step.template.subject}</div>
                  ) : null}
                  {step.type === 'linkedin' && step.message ? (
                    <div className="text-xs text-slate-500 line-clamp-1">{step.message}</div>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">#{index + 1}</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {step.type !== 'wait' ? (
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Send after
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={waitValue}
                        onChange={(event) =>
                          onUpdateStep?.({
                            ...step,
                            waitDays: Math.max(0, Number(event.target.value || 0)),
                          })
                        }
                        className="h-9 w-20 rounded-xl text-sm"
                      />
                      <span className="text-slate-500">day(s)</span>
                    </div>
                  </label>
                ) : (
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Wait
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={waitValue || 1}
                        onChange={(event) =>
                          onUpdateStep?.({
                            ...step,
                            waitDays: Math.max(1, Number(event.target.value || 1)),
                          })
                        }
                        className="h-9 w-20 rounded-xl text-sm"
                      />
                      <span className="text-slate-500">day(s)</span>
                    </div>
                  </label>
                )}

                {step.type === 'email' ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPickTemplate?.(step);
                      }}
                    >
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Choose template
                    </Button>
                  </div>
                ) : null}

                {step.type === 'linkedin' ? (
                  <div className="text-xs text-slate-500">
                    Action: {step.action === 'connect' ? 'Connect' : step.action === 'inmail' ? 'InMail' : 'Message'}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="w-full rounded-2xl border-dashed"
        onClick={onAddStep}
      >
        <Plus className="mr-2 h-4 w-4" /> Add Step
      </Button>
    </div>
  );
}

export default SequenceBuilder;
