// Payment method card. Truth is the `hasPaymentMethod` flag from
// get-billing-status (which queries Stripe for the customer's real
// default payment method). `hasStripeCustomer` is kept for the meta
// copy but is NEVER used to render a "card on file" state.
//
// Three render states:
//   1. PM exists in Stripe          -> show brand + last4 + expiry, "Manage" button
//   2. Customer exists, no PM yet   -> "No card on file", "Add payment method" CTA
//   3. No Stripe customer at all    -> "No card on file", "Start a paid plan" CTA

import { CreditCard, ExternalLink, Plus } from 'lucide-react';

interface Props {
  hasStripeCustomer: boolean;
  hasPaymentMethod?: boolean;
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardExpMonth?: number | null;
  cardExpYear?: number | null;
  billingEmail: string | null;
  canManage: boolean;
  onManagePortal: () => void;
  onAddPayment: () => void;
  isLoading?: boolean;
}

function brandLabel(brand?: string | null) {
  if (!brand) return 'Card';
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function PaymentMethodCard({
  hasStripeCustomer,
  hasPaymentMethod = false,
  cardBrand = null,
  cardLast4 = null,
  cardExpMonth = null,
  cardExpYear = null,
  billingEmail,
  canManage,
  onManagePortal,
  onAddPayment,
  isLoading,
}: Props) {
  const numberDisplay = hasPaymentMethod && cardLast4
    ? `•••• •••• •••• ${cardLast4}`
    : hasPaymentMethod
      ? '•••• •••• •••• ••••'
      : 'No card on file';

  const expiryDisplay = hasPaymentMethod && cardExpMonth && cardExpYear
    ? `${String(cardExpMonth).padStart(2, '0')}/${String(cardExpYear).slice(-2)}`
    : null;

  const statusDisplay = hasPaymentMethod
    ? 'On file'
    : hasStripeCustomer
      ? 'Required'
      : 'None';

  return (
    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6 lg:grid-cols-[1.1fr_1fr]">
      {/* Visual card */}
      <div className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-sm">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cyan-300/20 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
            {hasPaymentMethod ? brandLabel(cardBrand) : 'Payment method'}
          </span>
          <CreditCard className="h-5 w-5 text-white/70" />
        </div>
        <div className="relative mt-10 text-2xl font-semibold tracking-[0.18em] text-white">
          {numberDisplay}
        </div>
        <div className="relative mt-6 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-white/50">Card holder</div>
            <div className="mt-0.5 text-sm font-medium text-white">
              {billingEmail || 'Not set'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-white/50">
              {expiryDisplay ? 'Expires' : 'Status'}
            </div>
            <div className="mt-0.5 text-sm font-medium text-cyan-300">
              {expiryDisplay || statusDisplay}
            </div>
          </div>
        </div>
      </div>

      {/* Meta + CTAs */}
      <div className="flex flex-col justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
            Billing details
          </span>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950">
            {hasPaymentMethod ? 'Manage payment method' : 'Add payment method'}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {hasPaymentMethod
              ? 'Card details, billing address, and tax info are managed securely in your Stripe Customer Portal.'
              : hasStripeCustomer
                ? 'No card on file yet. Add one to activate or keep your subscription.'
                : 'Start a paid plan to add a payment method. Your card and billing data are stored only in Stripe.'}
          </p>
          {billingEmail ? (
            <p className="mt-3 text-sm text-slate-600">
              <span className="text-slate-500">Billing email: </span>
              <span className="font-medium text-slate-900">{billingEmail}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {hasPaymentMethod ? (
            <button
              type="button"
              onClick={onManagePortal}
              disabled={!canManage || isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              <ExternalLink className="h-4 w-4" />
              {isLoading ? 'Opening…' : 'Open Stripe portal'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddPayment}
              disabled={!canManage || isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {isLoading ? 'Processing…' : 'Add payment method'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
