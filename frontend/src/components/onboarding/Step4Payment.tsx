import React, { useState } from 'react';
import { CreditCard, FileText, Lock, Shield } from 'lucide-react';

interface Step4PaymentProps {
  planName: string;
  price: string;
  billingInterval?: 'monthly' | 'yearly';
  onNext: (data: { paymentMethod: 'card' | 'invoice' }) => void;
  isLoading?: boolean;
}

export function Step4Payment({
  planName,
  price,
  billingInterval = 'monthly',
  onNext,
  isLoading = false,
}: Step4PaymentProps) {
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'invoice'>('card');

  const isFree = price === '$0' || price === 'Free';
  const intervalLabel = billingInterval === 'yearly' ? '/year' : '/month';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ paymentMethod });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Payment method</h2>
        <p className="mt-2 text-slate-600">
          {isFree ? 'Activate your free trial — no credit card required.' : `Choose how you'd like to pay for the ${planName} plan.`}
        </p>
      </div>

      {/* Order Summary */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{planName} Plan</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {price}
              {!isFree && <span className="text-sm font-normal text-slate-500">{intervalLabel}</span>}
            </p>
          </div>
          {!isFree && (
            <div className="text-right text-sm text-slate-500">
              <p>Billed {billingInterval}</p>
              {billingInterval === 'yearly' && (
                <p className="text-emerald-600 font-medium">20% saved</p>
              )}
            </div>
          )}
        </div>
      </div>

      {isFree ? (
        <form onSubmit={handleSubmit}>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mb-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-800">
                No payment required. Start exploring Logistics Intel with your free trial and upgrade anytime.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors"
          >
            {isLoading ? 'Activating…' : 'Activate Free Trial'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payment method selector */}
          <div className="space-y-3">
            <label
              className={[
                'flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition',
                paymentMethod === 'card'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300',
              ].join(' ')}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="card"
                checked={paymentMethod === 'card'}
                onChange={() => setPaymentMethod('card')}
                className="mt-0.5 h-4 w-4 accent-indigo-600"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-slate-600 shrink-0" />
                  <span className="font-semibold text-slate-900">Credit or Debit Card</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Pay securely via Stripe. You'll be redirected to Stripe's hosted checkout page.
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                  <Lock className="h-3 w-3" />
                  <span>256-bit SSL • PCI-DSS compliant • No card stored on our servers</span>
                </div>
              </div>
            </label>

            <label
              className={[
                'flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition',
                paymentMethod === 'invoice'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300',
              ].join(' ')}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="invoice"
                checked={paymentMethod === 'invoice'}
                onChange={() => setPaymentMethod('invoice')}
                className="mt-0.5 h-4 w-4 accent-indigo-600"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-slate-600 shrink-0" />
                  <span className="font-semibold text-slate-900">Invoice / Wire Transfer</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Receive a net-30 invoice. Our team will contact you within 1 business day.
                </p>
              </div>
            </label>
          </div>

          {paymentMethod === 'card' && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
              <p className="text-sm text-indigo-700">
                Clicking "Continue to Checkout" will redirect you to Stripe's secure payment page.
                After payment, you'll return here to finish setting up your team.
              </p>
            </div>
          )}

          {paymentMethod === 'invoice' && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-800">
                We'll activate your account and send an invoice to your email. Payment due within 30 days.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors"
          >
            {isLoading
              ? 'Redirecting to Stripe…'
              : paymentMethod === 'card'
              ? 'Continue to Secure Checkout →'
              : 'Request Invoice'}
          </button>
        </form>
      )}
    </div>
  );
}
