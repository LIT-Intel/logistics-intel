/**
 * Onboarding Flow Page
 * Main page that orchestrates the 6-step onboarding process
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper';
import { Step1BasicInfo } from '@/components/onboarding/Step1BasicInfo';
import { Step2Organization } from '@/components/onboarding/Step2Organization';
import { Step3PlanSelection } from '@/components/onboarding/Step3PlanSelection';
import { Step4Payment } from '@/components/onboarding/Step4Payment';
import { Step5TeamInvite } from '@/components/onboarding/Step5TeamInvite';
import { Step6Success } from '@/components/onboarding/Step6Success';
import type { PlanCode } from '@/lib/planLimits';

interface OnboardingData {
  // Step 1
  fullName: string;
  email: string;
  role: string;
  // Step 2
  orgName: string;
  industry: string;
  companySize: string;
  // Step 3
  planCode: PlanCode;
  billingInterval: 'monthly' | 'yearly';
  // Step 4
  paymentMethod: 'card' | 'invoice';
  cardLast4?: string;
  // Step 5
  teamMembers: Array<{ id: string; email: string; role: 'member' | 'admin' }>;
}

const PLAN_PRICES: Record<PlanCode, string> = {
  free_trial: '$0',
  starter: '$99',
  growth: '$129',
  enterprise: 'Custom',
};

const PLAN_NAMES: Record<PlanCode, string> = {
  free_trial: 'Free Trial',
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const [data, setData] = useState<Partial<OnboardingData>>({
    billingInterval: 'monthly',
    planCode: 'growth',
    paymentMethod: 'card',
    teamMembers: [],
  });

  const goToStep = (step: number) => {
    if (step < currentStep) {
      setCurrentStep(step);
    }
  };

  const handleStep1 = (stepData: {
    fullName: string;
    email: string;
    role: string;
  }) => {
    setData({ ...data, ...stepData });
    setCurrentStep(2);
  };

  const handleStep2 = (stepData: {
    orgName: string;
    industry: string;
    companySize: string;
  }) => {
    setData({ ...data, ...stepData });
    setCurrentStep(3);
  };

  const handleStep3 = (stepData: {
    planCode: PlanCode;
    billingInterval: 'monthly' | 'yearly';
  }) => {
    setData({ ...data, ...stepData });
    setCurrentStep(4);
  };

  const handleStep4 = async (stepData: {
    cardLast4?: string;
    paymentMethod: 'card' | 'invoice';
  }) => {
    setData({ ...data, ...stepData });
    setIsLoading(true);

    try {
      // TODO: Call Stripe checkout endpoint if card payment
      // TODO: Create subscription in database
      // TODO: Invite team members via email

      // For now, just move to next step
      setTimeout(() => {
        setCurrentStep(5);
        setIsLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Payment processing failed:', error);
      setIsLoading(false);
    }
  };

  const handleStep5 = (stepData: {
    teamMembers: Array<{ id: string; email: string; role: 'member' | 'admin' }>;
  }) => {
    setData({ ...data, ...stepData });
    setCurrentStep(6);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="text-sm text-slate-600">
            Step {currentStep} of 6
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Stepper */}
        <div className="mb-12">
          <OnboardingStepper currentStep={currentStep} onStepClick={goToStep} />
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          {currentStep === 1 && (
            <Step1BasicInfo
              onNext={handleStep1}
              initialData={{
                fullName: data.fullName,
                email: data.email,
                role: data.role,
              }}
            />
          )}

          {currentStep === 2 && (
            <Step2Organization
              onNext={handleStep2}
              initialData={{
                orgName: data.orgName,
                industry: data.industry,
                companySize: data.companySize,
              }}
            />
          )}

          {currentStep === 3 && (
            <Step3PlanSelection
              onNext={handleStep3}
              initialData={{
                planCode: data.planCode,
                billingInterval: data.billingInterval,
              }}
            />
          )}

          {currentStep === 4 && (
            <Step4Payment
              planName={PLAN_NAMES[data.planCode || 'growth']}
              price={PLAN_PRICES[data.planCode || 'growth']}
              onNext={handleStep4}
              isLoading={isLoading}
            />
          )}

          {currentStep === 5 && (
            <Step5TeamInvite onNext={handleStep5} isOptional />
          )}

          {currentStep === 6 && (
            <Step6Success
              userName={data.fullName || 'User'}
              orgName={data.orgName || 'Your Organization'}
              planName={PLAN_NAMES[data.planCode || 'growth']}
            />
          )}
        </div>

        {/* Back Button (for steps with back button) */}
        {currentStep > 1 && currentStep < 6 && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleBack}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              ← Go back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
