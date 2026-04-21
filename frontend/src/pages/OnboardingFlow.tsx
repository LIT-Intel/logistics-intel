import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper';
import { Step1BasicInfo } from '@/components/onboarding/Step1BasicInfo';
import { Step2Organization } from '@/components/onboarding/Step2Organization';
import { Step3PlanSelection } from '@/components/onboarding/Step3PlanSelection';
import { Step4Payment } from '@/components/onboarding/Step4Payment';
import { Step5TeamInvite } from '@/components/onboarding/Step5TeamInvite';
import { Step6Success } from '@/components/onboarding/Step6Success';
import type { PlanCode } from '@/lib/planLimits';

const STORAGE_KEY = 'onboarding_progress';

interface OnboardingData {
  fullName: string;
  email: string;
  role: string;
  orgName: string;
  industry: string;
  companySize: string;
  planCode: PlanCode;
  billingInterval: 'monthly' | 'yearly';
  paymentMethod: 'card' | 'invoice';
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

function loadSavedData(): Partial<OnboardingData> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveData(data: Partial<OnboardingData>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [err, setErr] = useState('');

  const [data, setData] = useState<Partial<OnboardingData>>(() => ({
    billingInterval: 'monthly',
    planCode: 'growth',
    paymentMethod: 'card',
    teamMembers: [],
    ...loadSavedData(),
  }));

  // Detect return from Stripe checkout (?step=5 or ?step=4 for cancel)
  useEffect(() => {
    const stepParam = searchParams.get('step');
    if (stepParam === '5') {
      setCurrentStep(5);
    } else if (stepParam === '4') {
      setCurrentStep(4);
    }
  }, []);

  const updateData = (patch: Partial<OnboardingData>) => {
    setData((prev) => {
      const next = { ...prev, ...patch };
      saveData(next);
      return next;
    });
  };

  const handleStep1 = (stepData: { fullName: string; email: string; role: string }) => {
    updateData(stepData);
    setCurrentStep(2);
  };

  const handleStep2 = (stepData: { orgName: string; industry: string; companySize: string }) => {
    updateData(stepData);
    setCurrentStep(3);
  };

  const handleStep3 = (stepData: { planCode: PlanCode; billingInterval: 'monthly' | 'yearly' }) => {
    updateData(stepData);
    setCurrentStep(4);
  };

  const handleStep4 = async (stepData: { paymentMethod: 'card' | 'invoice' }) => {
    const allData = { ...data, ...stepData };
    updateData(stepData);
    setErr('');

    const isFree = allData.planCode === 'free_trial';
    const isInvoice = stepData.paymentMethod === 'invoice';

    // Free trial or invoice: skip Stripe, go straight to team invite
    if (isFree || isInvoice) {
      setCurrentStep(5);
      return;
    }

    // Paid card payment → redirect to Stripe Hosted Checkout
    setIsLoading(true);
    try {
      const { data: checkout, error } = await supabase.functions.invoke('billing-checkout', {
        body: {
          plan_code: allData.planCode,
          interval: allData.billingInterval === 'yearly' ? 'year' : 'month',
          success_url: `${window.location.origin}/onboarding?step=5`,
          cancel_url: `${window.location.origin}/onboarding?step=4`,
        },
      });

      if (error) throw error;
      if (!checkout?.url) throw new Error('No checkout URL received. Please try again.');

      window.location.href = checkout.url;
    } catch (e: any) {
      console.error('[OnboardingFlow] Stripe checkout failed:', e);
      setErr(e?.message || 'Failed to start checkout. Please try again.');
      setIsLoading(false);
    }
  };

  const handleStep5 = async (stepData: {
    teamMembers: Array<{ id: string; email: string; role: 'member' | 'admin' }>;
  }) => {
    const allData = { ...data, ...stepData };
    updateData(stepData);
    setIsLoading(true);
    setErr('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated. Please log in again.');

      // 1. Find the auto-bootstrapped org (created by DB trigger on signup)
      const { data: membership, error: memberErr } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .maybeSingle();

      if (memberErr) throw memberErr;

      const orgId = membership?.org_id;

      // 2. Update the org with the name and industry from Step 2
      if (orgId && allData.orgName) {
        await supabase
          .from('organizations')
          .update({
            name: allData.orgName,
            industry: allData.industry || null,
          })
          .eq('id', orgId);
      }

      // 3. Create invites and send emails for each team member
      for (const member of allData.teamMembers || []) {
        const { data: invite, error: inviteErr } = await supabase
          .from('org_invites')
          .insert({
            org_id: orgId,
            email: member.email,
            role: member.role,
            invited_by: user.id,
            invited_by_user_id: user.id,
            status: 'pending',
          })
          .select('id')
          .maybeSingle();

        if (inviteErr) {
          console.error('[OnboardingFlow] Failed to create invite for', member.email, inviteErr);
          continue;
        }

        if (invite?.id) {
          const { error: sendErr } = await supabase.functions.invoke('send-org-invite', {
            body: { inviteId: invite.id },
          });
          if (sendErr) {
            console.error('[OnboardingFlow] Failed to send invite email for', member.email, sendErr);
          }
        }
      }

      // 4. Mark onboarding complete and store org_id in user metadata
      await supabase.auth.updateUser({
        data: { onboarding_completed: true, org_id: orgId },
      });

      // Clean up session storage
      sessionStorage.removeItem(STORAGE_KEY);

      setCurrentStep(6);
    } catch (e: any) {
      console.error('[OnboardingFlow] Step 5 failed:', e);
      setErr(e?.message || 'Failed to complete setup. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate('/app/dashboard', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
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
          <OnboardingStepper currentStep={currentStep} onStepClick={(s) => s < currentStep && setCurrentStep(s)} />
        </div>

        {/* Error banner */}
        {err && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Step Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          {currentStep === 1 && (
            <Step1BasicInfo
              onNext={handleStep1}
              initialData={{ fullName: data.fullName, email: data.email, role: data.role }}
            />
          )}

          {currentStep === 2 && (
            <Step2Organization
              onNext={handleStep2}
              initialData={{ orgName: data.orgName, industry: data.industry, companySize: data.companySize }}
            />
          )}

          {currentStep === 3 && (
            <Step3PlanSelection
              onNext={handleStep3}
              initialData={{ planCode: data.planCode, billingInterval: data.billingInterval }}
            />
          )}

          {currentStep === 4 && (
            <Step4Payment
              planName={PLAN_NAMES[data.planCode ?? 'growth']}
              price={PLAN_PRICES[data.planCode ?? 'growth']}
              billingInterval={data.billingInterval}
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
              planName={PLAN_NAMES[data.planCode ?? 'growth']}
            />
          )}
        </div>

        {/* Back link for middle steps */}
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
