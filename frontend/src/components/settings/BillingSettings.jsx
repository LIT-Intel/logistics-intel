import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CreditCard,
  Calendar,
  Crown,
  CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  createStripeCheckout,
  createStripePortalSession,
} from '@/api/functions';

function getCanonicalPlan(plan = 'free_trial') {
  const p = String(plan || 'free_trial').toLowerCase().trim();
  if (p === 'free' || p === 'free_trial') return 'free_trial';
  if (p === 'pro' || p === 'standard' || p === 'starter') return 'standard';
  if (p === 'growth' || p === 'growth_plus') return 'growth';
  if (p.startsWith('enterprise')) return 'enterprise';
  return p;
}

function getPlanMap() {
  return {
    free_trial: {
      code: 'free_trial',
      name: 'Free Trial',
      price: '$0',
      max_companies: 10,
      max_emails: 50,
      max_rfps: 5,
      enrichment_enabled: false,
      campaigns_enabled: false,
    },
    standard: {
      code: 'standard',
      name: 'Standard',
      price: '$49',
      max_companies: 100,
      max_emails: 500,
      max_rfps: 50,
      enrichment_enabled: true,
      campaigns_enabled: false,
    },
    growth: {
      code: 'growth',
      name: 'Growth',
      price: '$299',
      max_companies: 500,
      max_emails: 2500,
      max_rfps: 200,
      enrichment_enabled: true,
      campaigns_enabled: true,
    },
    enterprise: {
      code: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      max_companies: Infinity,
      max_emails: Infinity,
      max_rfps: Infinity,
      enrichment_enabled: true,
      campaigns_enabled: true,
    },
  };
}

function getPlanLimits(plan = 'free_trial') {
  const canonical = getCanonicalPlan(plan);
  const planMap = getPlanMap();
  return planMap[canonical] || planMap.free_trial;
}

// Phase F — `UsageRow` helper removed alongside the "Usage This Month"
// card. Detailed usage meters live on the canonical Billing page only.
// The `AlertCircle` import is retained because it is still used below
// for inline upgrade/warning hints elsewhere in the file.
function _removedUsageRow() {
  return null;
}

export default function BillingSettings({ user }) {
  const [loadingAction, setLoadingAction] = useState(false);

  const canonicalPlan = getCanonicalPlan(
    user?.plan || user?.user_metadata?.plan || 'free_trial'
  );

  const plan = useMemo(() => getPlanLimits(canonicalPlan), [canonicalPlan]);
  const planMap = useMemo(() => getPlanMap(), []);
  const availableUpgrades = useMemo(
    () =>
      Object.values(planMap).filter(
        (p) => p.code !== canonicalPlan && p.code !== 'free_trial'
      ),
    [planMap, canonicalPlan]
  );

  const stripeCustomerId =
    user?.stripe_customer_id || user?.user_metadata?.stripe_customer_id || null;

  const subscriptionStatus =
    user?.subscription_status || user?.user_metadata?.subscription_status || null;

  const hasActiveSubscription =
    !!stripeCustomerId &&
    ['active', 'trialing'].includes(String(subscriptionStatus || '').toLowerCase());

  // Phase F — detailed usage meters removed from this summary. They live
  // on the canonical Billing page at /app/billing, which pulls real
  // counters from lit_activity_events and live Supabase queries. Keeping
  // fake `user.monthly_*` fields here would render mock data. Per rule 6
  // this surface is "compact summary only".
  const nextBillingDate =
    user?.subscription?.current_period_end ||
    user?.user_metadata?.current_period_end ||
    null;

  const handleUpgrade = async (planCode) => {
    setLoadingAction(true);
    try {
      const result = await createStripeCheckout({
        plan_code: planCode,
        interval: 'month',
      });

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      throw new Error('Unable to start checkout.');
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!stripeCustomerId) {
      alert('No Stripe customer found for this account yet.');
      return;
    }

    setLoadingAction(true);
    try {
      const result = await createStripePortalSession();

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      throw new Error('Unable to create Stripe portal session.');
    } catch (error) {
      console.error('Portal error:', error);
      alert('Failed to open billing portal. Please try again.');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white/90 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-blue-600" />
              <span>Current Plan</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-blue-100 text-blue-800">{plan.name}</Badge>
              {subscriptionStatus && (
                <Badge className="bg-slate-100 text-slate-800 capitalize">
                  {subscriptionStatus}
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Plan Features</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Companies per month</span>
                  <span className="font-medium">
                    {plan.max_companies === Infinity
                      ? 'Unlimited'
                      : Number(plan.max_companies).toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Emails per month</span>
                  <span className="font-medium">
                    {plan.max_emails === Infinity
                      ? 'Unlimited'
                      : Number(plan.max_emails).toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>RFPs per month</span>
                  <span className="font-medium">
                    {plan.max_rfps === Infinity
                      ? 'Unlimited'
                      : Number(plan.max_rfps).toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Data enrichment</span>
                  <span className="font-medium">
                    {plan.enrichment_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Campaign automation</span>
                  <span className="font-medium">
                    {plan.campaigns_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-3">Billing Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Plan price</span>
                  <span className="font-medium">{plan.price}/month</span>
                </div>

                <div className="flex justify-between">
                  <span>Subscription state</span>
                  <span className="font-medium capitalize">
                    {subscriptionStatus || 'Not subscribed'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Stripe customer</span>
                  <span className="font-medium">
                    {stripeCustomerId ? 'Connected' : 'Not connected'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Next billing date</span>
                  <span className="font-medium">
                    {/* Phase F — fake `now + 30d` computation removed. We
                        now read from the real subscription period end when
                        it flows into the prop; otherwise defer to the
                        Stripe Billing Portal which always has truth. */}
                    {nextBillingDate
                      ? format(new Date(nextBillingDate), 'MMM dd, yyyy')
                      : hasActiveSubscription
                      ? 'Managed in Stripe'
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {hasActiveSubscription ? (
              <Button onClick={handleManageSubscription} disabled={loadingAction}>
                {loadingAction ? 'Opening...' : 'Manage Subscription'}
              </Button>
            ) : (
              availableUpgrades.map((upgrade) => (
                <Button
                  key={upgrade.code}
                  onClick={() => handleUpgrade(upgrade.code)}
                  disabled={loadingAction}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  {loadingAction ? 'Processing...' : `Upgrade to ${upgrade.name}`}
                </Button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Phase F — "Usage This Month" card removed. The prior meters read
          fake `user.monthly_*` auth-metadata fields that no writer
          populates. Detailed, real-counter meters now live exclusively on
          the canonical Billing page at /app/billing, per the
          "Settings summary only" rule. */}

      <Card className="bg-white/90 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Invoices
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Phase F — the previous two hardcoded "Paid" month rows were
              mock data and have been removed per the no-fake-billing rule.
              Real invoice history lives in Stripe; we deep-link users
              directly into the Billing Portal and the canonical Billing
              page instead of duplicating an invoice list here. */}
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="text-sm font-medium text-slate-900">
              Invoices are managed securely in Stripe
            </div>
            <div className="text-xs text-slate-500">
              Download receipts, review payment history, and update your card from the
              Stripe Billing Portal. We never store card details inside Logistic Intel.
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManageSubscription}
                disabled={loadingAction}
              >
                {loadingAction ? 'Opening…' : 'Open Stripe Billing Portal'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  try {
                    window.location.assign('/app/billing');
                  } catch {
                    /* ignore */
                  }
                }}
              >
                View full Billing page →
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            Payment Method
          </CardTitle>
        </CardHeader>

        <CardContent>
          {hasActiveSubscription ? (
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-white" />
                </div>

                <div>
                  <div className="font-medium">Managed in Stripe</div>
                  <div className="text-sm text-gray-600">
                    Update card details from the billing portal
                  </div>
                </div>
              </div>

              <Button variant="outline" onClick={handleManageSubscription} disabled={loadingAction}>
                {loadingAction ? 'Opening...' : 'Update'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-slate-400" />
              Add a payment method during checkout when you upgrade.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
