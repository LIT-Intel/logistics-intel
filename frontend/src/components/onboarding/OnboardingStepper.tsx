import React from 'react';
import { Check } from 'lucide-react';

export interface Step {
  id: number;
  label: string;
  description: string;
}

export const ONBOARDING_STEPS: Step[] = [
  { id: 1, label: 'Basic Info',    description: 'Your details' },
  { id: 2, label: 'Organization',  description: 'Company setup' },
  { id: 3, label: 'Plan',          description: 'Choose your plan' },
  { id: 4, label: 'Payment',       description: 'Payment method' },
  { id: 5, label: 'Team',          description: 'Invite members' },
  { id: 6, label: 'Complete',      description: 'All set!' },
];

interface OnboardingStepperProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export function OnboardingStepper({ currentStep, onStepClick }: OnboardingStepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-start w-full">
        {ONBOARDING_STEPS.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent   = currentStep === step.id;
          const isClickable = currentStep >= step.id && Boolean(onStepClick);

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <button
                  onClick={() => isClickable && onStepClick!(step.id)}
                  disabled={!isClickable}
                  className={[
                    'flex h-10 w-10 items-center justify-center rounded-full font-semibold text-sm transition-all duration-200',
                    isCompleted
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : isCurrent
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                      : 'bg-slate-200 text-slate-500',
                    isClickable ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : <span>{step.id}</span>}
                </button>

                <div className="mt-2 text-center hidden sm:block">
                  <div className={`text-xs font-semibold ${isCurrent ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {step.label}
                  </div>
                </div>
              </div>

              {index < ONBOARDING_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mt-5 mx-1 ${isCompleted ? 'bg-emerald-500' : 'bg-slate-200'}`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
