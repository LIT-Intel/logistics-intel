/**
 * Onboarding Stepper Component
 * Displays progress through 6-step onboarding flow
 */

import React from 'react';
import { Check } from 'lucide-react';

export interface Step {
  id: number;
  label: string;
  description: string;
}

export const ONBOARDING_STEPS: Step[] = [
  { id: 1, label: 'Basic Info', description: 'Your details' },
  { id: 2, label: 'Organization', description: 'Company setup' },
  { id: 3, label: 'Plan', description: 'Choose your plan' },
  { id: 4, label: 'Payment', description: 'Payment method' },
  { id: 5, label: 'Team', description: 'Invite members' },
  { id: 6, label: 'Complete', description: 'All set!' },
];

interface OnboardingStepperProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export function OnboardingStepper({ currentStep, onStepClick }: OnboardingStepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {ONBOARDING_STEPS.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isClickable = currentStep >= step.id && onStepClick;

          return (
            <div key={step.id} className="flex flex-col items-center flex-1">
              {/* Step Circle */}
              <button
                onClick={() => isClickable && onStepClick(step.id)}
                disabled={!isClickable}
                className={`
                  flex h-12 w-12 items-center justify-center rounded-full font-semibold
                  transition-all duration-200
                  ${isCompleted
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : isCurrent
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                    : 'bg-slate-200 text-slate-600'
                  }
                  ${isClickable ? 'cursor-pointer' : 'cursor-default'}
                `}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span>{step.id}</span>
                )}
              </button>

              {/* Step Label */}
              <div className="mt-2 text-center">
                <div
                  className={`text-sm font-semibold ${
                    isCurrent ? 'text-indigo-600' : 'text-slate-600'
                  }`}
                >
                  {step.label}
                </div>
                <div className="text-xs text-slate-500">{step.description}</div>
              </div>

              {/* Connector Line */}
              {index < ONBOARDING_STEPS.length - 1 && (
                <div
                  className={`absolute h-1 w-full translate-y-12 ${
                    isCompleted ? 'bg-emerald-600' : 'bg-slate-200'
                  }`}
                  style={{
                    left: '50%',
                    width: '100%',
                    marginLeft: '1rem',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
