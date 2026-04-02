import React, { useState } from 'react';
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
} from 'lucide-react';
import { format } from 'date-fns';
import {
  createStripeCheckout,
  createStripePortalSession,
} from '@/api/functions';

// -----------------------------------------------------------------------------
// This component renders the billing tab inside the Settings page. It displays
// the user's current plan, usage, upgrade options and billing history. Plan
// definitions are canonicalised to align with our central plan system. If
// additional plans are added on the backend, extend the limits map below. The
// component integrates with Supabase Edge Functions via our API wrappers to
// start checkout sessions and portal sessions.
// -----------------------------------------------------------------------------

// Convert legacy plan identifiers to canonical plan codes.
function getCanonicalPlan(plan = 'free_trial') {
  const p = (plan || 'free_trial').toLowerCase();
  if (p === 'free' || p === 'free_trial') return 'free_trial';
  if (p === 'pro' || p === 'standard' || p === 'starter') return 'standard';
  if (p === 'growth' || p === 'growth_plus') return 'growth';
  if (p.startsWith('enterprise')) return 'enterprise';
  return p;
}

// Return per‑plan usage limits and display metadata. These values should
// correspond to the quotas defined in the backend (plans table). Adjust them
// when adding or modifying plan tiers.
function getPlanLimits(plan = 'free_trial') {
  const canonical = getCanonicalPlan(plan);
  const limits = {
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
  return limits[canonical] || limits.free_trial;
}

export default function BillingSettings({ user }) {
  // Track loading state for upgrade/portal actions
  const [loading, setLoading] = useState(false);

  // Determine canonical plan and limits
  const canonicalPlan = getCanonicalPlan(user?.plan || user?.user_metadata?.plan || 'free_trial');
  const plan = getPlanLimits(canonicalPlan);

  // Derive subscription fields from top‑level or user_metadata
  const stripeCustomerId =
    user?.stripe_customer_id || user?.user_metadata?.stripe_customer_id || null;
  const subscriptionStatus =
    user?.subscription_status || user?.user_metadata?.subscription_status || null;
  const hasActiveSubscription = !!stripeCustomerId && subscriptionStatus === 'active';

  // Compute usage progress for meter bars
  const companiesUsed = user?.monthly_companies_viewed || 0;
  const emailsUsed = user?.monthly_emails_sent || 0;
  const rfpsUsed = user?.monthly_rfps_generated || 0;
  const usagePercent = {
    companies:
      plan.max_companies && plan.max_companies !== Infinity
        ? (companiesUsed / plan.max_companies) * 100
        : 0,
    emails:
      plan.max_emails && plan.max_emails !== Infinity
        ? (emailsUsed / plan.max_emails) * 100
        : 0,
    rfps:
      plan.max_rfps && plan.max_rfps !== Infinity
        ? (rfpsUsed / plan.max_rfps) * 100
        : 0,
  };

  // Colour helper for usage meter
  const getUsageColor = (percentage) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Create a checkout session for the selected plan
  const handleUpgrade = async (planCode) => {
    setLoading(true);
    try {
      const result = await createStripeCheckout({ plan_code: planCode, interval: 'month' });
      if (result && result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('Unable to start checkout.');
      }
    } catch (err) {
      console.error('Checkout error', err);
      alert('Failed to start checkout. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  // Redirect user to Stripe portal for managing subscription
  const handleManageSubscription = async () => {
    if (!stripeCustomerId) {
      alert('No subscription found. Please upgrade first.');
      return;
    }
    setLoading(true);
    try {
      const result = await createStripePortalSession();
      if (result && result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('Could not create portal session.');
      }
    } catch (err) {
      console.error('Portal session error', err);
      alert('Failed to access billing portal. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  // Filter available upgrades: exclude current plan and free trial from options
  const availableUpgrades = Object.values(getPlanLimits())
    .filter((p) => p.code !== canonicalPlan && p.code !== 'free_trial');

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-blue-600" />
              Current Plan
            </div>
            <Badge className="bg-blue-100 text-blue-800">
              {plan.name}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Plan Features</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Companies per month:</span>
                  <span className="font-medium">
                    {plan.max_companies === Infinity ? 'Unlimited' : plan.max_companies.toLocaleString()}
                  </span>
                </div>
                {plan.max_emails > 0 && (
                  <div className="flex justify-between">
                    <span>Emails per month:</span>
                    <span className="font-medium">
                      {plan.max_emails === Infinity ? 'Unlimited' : plan.max_emails.toLocaleString()}
                    </span>
                  </div>
                )}
                {plan.max_rfps > 0 && (
                  <div className="flex justify-between">
                    <span>RFPs per month:</span>
                    <span className="font-medium">
                      {plan.max_rfps === Infinity ? 'Unlimited' : plan.max_rfps.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Data enrichment:</span>
                  <span className="font-medium">
                    {plan.enrichment_enabled ? '✅' : '❌'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Campaign automation:</span>
                  <span className="font-medium">
                    {plan.campaigns_enabled ? '✅' : '❌'}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Billing Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Plan price:</span>
                  <span className="font-medium">{plan.price}/month</span>
                </div>
                <div className="flex justify-between">
                  <span>Billing cycle:</span>
                  <span className="font-medium">Monthly</span>
                </div>
                <div className="flex justify-between">
                  <span>Next billing date:</span>
                  <span className="font-medium">
                    {format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'MMM dd, yyyy')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Payment method:</span>
                  <span className="font-medium">•••• •••• •••• 4242</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Overview */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Usage This Month
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {/* Companies */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Companies Viewed</span>
                <span className="font-medium">
                  {companiesUsed} / {plan.max_companies === Infinity ? '∞' : plan.max_companies}
                </span>
              </div>
              <Progress value={usagePercent.companies} className="h-2">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getUsageColor(
                    usagePercent.companies
                  )}`}
                  style={{ width: `${Math.min(usagePercent.companies, 100)}%` }}
                />
              </Progress>
              {usagePercent.companies >= 90 && (
                <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>Approaching usage limit</span>
                </div>
              )}
            </div>
            {/* Emails */}
            {plan.max_emails > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Emails Sent</span>
                  <span className="font-medium">
                    {emailsUsed} / {plan.max_emails === Infinity ? '∞' : plan.max_emails}
                  </span>
                </div>
                <Progress value={usagePercent.emails} className="h-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${getUsageColor(
                      usagePercent.emails
                    )}`}
                    style={{ width: `${Math.min(usagePercent.emails, 100)}%` }}
                  />
                </Progress>
              </div>
            )}
            {/* RFPs */}
            {plan.max_rfps > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>RFPs Generated</span>
                  <span className="font-medium">
                    {rfpsUsed} / {plan.max_rfps === Infinity ? '∞' : plan.max_rfps}
                  </span>
                </div>
                <Progress value={usagePercent.rfps} className="h-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${getUsageColor(
                      usagePercent.rfps
                    )}`}
                    style={{ width: `${Math.min(usagePercent.rfps, 100)}%` }}
                  />
                </Progress>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Section */}
      {!hasActiveSubscription && availableUpgrades.length > 0 && (
        <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-purple-600" />
              Upgrade Your Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableUpgrades.map((p) => (
                <div
                  key={p.code}
                  className="border rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="mb-3">
                    <h4 className="font-semibold text-lg">{p.name}</h4>
                    <div className="text-2xl font-bold text-blue-600">{p.price}</div>
                    <div className="text-sm text-gray-600">per month</div>
                  </div>
                  <div className="space-y-1 text-sm mb-4">
                    <div>• {p.max_companies === Infinity ? 'Unlimited' : p.max_companies.toLocaleString()} companies/month</div>
                    {p.max_emails > 0 && (
                      <div>• {p.max_emails === Infinity ? 'Unlimited' : p.max_emails.toLocaleString()} emails/month</div>
                    )}
                    {p.max_rfps > 0 && (
                      <div>• {p.max_rfps === Infinity ? 'Unlimited' : p.max_rfps.toLocaleString()} RFPs/month</div>
                    )}
                    {p.enrichment_enabled && <div>• Data enrichment</div>}
                    {p.campaigns_enabled && <div>• Campaign automation</div>}
                  </div>
                  <Button
                    onClick={() => handleUpgrade(p.code)}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    {loading ? 'Processing...' : `Upgrade to ${p.name}`}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription management button for existing subscribers */}
      {hasActiveSubscription && (
        <div className="flex justify-end">
          <Button onClick={handleManageSubscription} disabled={loading}>
            {loading ? 'Loading...' : 'Manage Subscription'}
          </Button>
        </div>
      )}

      {/* Billing History */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" /> Billing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Placeholder billing history — replace with real invoices later */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium">December 2025</div>
                <div className="text-sm text-gray-600">{plan.name} Plan</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">Paid</Badge>
                <span className="font-medium">{plan.price}</span>
                <Button size="sm" variant="outline" onClick={() => alert('Invoice download not yet implemented')}>Download</Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium">November 2025</div>
                <div className="text-sm text-gray-600">{plan.name} Plan</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">Paid</Badge>
                <span className="font-medium">{plan.price}</span>
                <Button size="sm" variant="outline" onClick={() => alert('Invoice download not yet implemented')}>Download</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" /> Payment Method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-medium">Visa ending in 4242</div>
                <div className="text-sm text-gray-600">Expires 12/2026</div>
              </div>
            </div>
            <Button variant="outline" size="sm">
              Update
            </Button>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <p>Your payment information is securely processed by Stripe. We never store your full credit card details.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
