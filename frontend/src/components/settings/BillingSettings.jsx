import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CreditCard,
  Calendar,
  TrendingUp,
  Crown,
  AlertCircle,
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

function UsageRow({ label, current, max }) {
  const isUnlimited = max === Infinity;
  const safeCurrent = Number(current || 0);
  const percentage = !isUnlimited && Number(max) > 0
    ? Math.min((safeCurrent / Number(max)) * 100, 100)
    : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span>{label}</span>
        <span className="font-medium">
          {safeCurrent} / {isUnlimited ? '∞' : Number(max).toLocaleString()}
        </span>
      </div>

      {!isUnlimited ? (
        <Progress value={percentage} className="h-2" />
      ) : (
        <div className="h-2 rounded-full bg-slate-100" />
      )}

      {!isUnlimited && percentage >= 90 && (
        <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span>Approaching usage limit</span>
        </div>
      )}
    </div>
  );
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

  const companiesUsed = Number(user?.monthly_companies_viewed || 0);
  const emailsUsed = Number(user?.monthly_emails_sent || 0);
  const rfpsUsed = Number(user?.monthly_rfps_generated || 0);

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
                    {hasActiveSubscription
                      ? format(
                          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                          'MMM dd, yyyy'
                        )
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

      <Card className="bg-white/90 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Usage This Month
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <UsageRow
            label="Companies Viewed"
            current={companiesUsed}
            max={plan.max_companies}
          />

          <UsageRow
            label="Emails Sent"
            current={emailsUsed}
            max={plan.max_emails}
          />

          <UsageRow
            label="RFPs Generated"
            current={rfpsUsed}
            max={plan.max_rfps}
          />
        </CardContent>
      </Card>

      <Card className="bg-white/90 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Billing History
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {hasActiveSubscription ? (
            <>
              {[0, 1].map((offset) => {
                const date = new Date();
                date.setMonth(date.getMonth() - offset);

                return (
                  <div
                    key={offset}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{format(date, 'MMMM yyyy')}</div>
                      <div className="text-sm text-gray-600">{plan.name} Plan</div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-green-100 text-green-800">Paid</Badge>
                      <span className="font-medium">{plan.price}</span>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="text-sm text-slate-500">
              No billing history yet for this account.
            </div>
          )}
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
