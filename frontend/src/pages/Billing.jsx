import React, { useState, useEffect } from 'react';
import { User } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createStripePortalSession } from '@/api/functions';
import { getPlanLimits } from '@/components/utils/planLimits';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LitPageHeader from '../components/ui/LitPageHeader';
import LitPanel from '../components/ui/LitPanel';
import LitWatermark from '../components/ui/LitWatermark';

export default function Billing() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    User.me()
      .then(userData => {
        setUser(userData);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
        navigate(createPageUrl('Landing'));
      });
  }, [navigate]);

  const handleManageSubscription = async () => {
    // Check if user has a Stripe customer ID first
    if (!user.stripe_customer_id) {
      alert('No subscription found. Please upgrade to a paid plan first.');
      navigate(createPageUrl('Pricing'));
      return;
    }

    setIsRedirecting(true);
    try {
      const { data } = await createStripePortalSession();
      if (data && data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Could not create portal session.');
      }
    } catch (error) {
      console.error('Stripe portal error:', error);
      setIsRedirecting(false);
      
      // Handle the specific error case
      if (error.response?.data?.error?.includes('Stripe customer not found')) {
        alert('No subscription found. Please upgrade to a paid plan first.');
        navigate(createPageUrl('Pricing'));
      } else {
        alert('Failed to access billing portal. Please try again or contact support.');
      }
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const planLimits = getPlanLimits(user.plan);
  const hasActiveSubscription = user.stripe_customer_id && user.subscription_status === 'active';

  return (
    <div className="relative p-4 md:p-6 lg:p-8 min-h-screen">
      <LitWatermark />
      <div className="max-w-4xl mx-auto">
        <LitPageHeader title="Billing & Subscription" />
        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle>Your Current Plan</CardTitle>
            <CardDescription>Manage your subscription and view usage details.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 bg-blue-50 rounded-lg">
              <div>
                <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                  {planLimits.name} Plan
                  {user.subscription_status && (
                    <Badge 
                      className={user.subscription_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
                    >
                      {user.subscription_status}
                    </Badge>
                  )}
                </h3>
                <p className="text-gray-600 mt-1">
                  {user.plan === 'free' 
                    ? 'You are currently on the free plan.' 
                    : hasActiveSubscription 
                      ? 'Thank you for being a subscriber!' 
                      : 'Upgrade to unlock premium features.'}
                </p>
              </div>
              
              {user.plan === 'free' || !hasActiveSubscription ? (
                <Button onClick={() => navigate(createPageUrl('Pricing'))}>
                  {user.plan === 'free' ? 'Upgrade Plan' : 'Subscribe Now'}
                </Button>
              ) : (
                <Button onClick={handleManageSubscription} disabled={isRedirecting}>
                  {isRedirecting ? 'Redirecting...' : 'Manage Subscription'}
                </Button>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <h4 className="font-semibold text-gray-700">Monthly Usage:</h4>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <UsageMetric
                  label="Company Views"
                  current={user.monthly_companies_viewed || 0}
                  max={planLimits.max_companies}
                />
                <UsageMetric
                  label="Email Credits"
                  current={user.monthly_emails_sent || 0}
                  max={planLimits.max_emails}
                />
                <UsageMetric
                  label="RFP/Quote Generations"
                  current={user.monthly_rfps_generated || 0}
                  max={planLimits.max_rfps}
                />
              </div>
              <p className="text-xs text-gray-500 text-center pt-2">Your usage resets monthly.</p>
            </div>
            
            {/* Show subscription details only if user has an active subscription */}
            {hasActiveSubscription && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-semibold text-gray-700 mb-3">Subscription Details</h4>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className="ml-2 font-medium text-gray-900 capitalize">
                      {user.subscription_status}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Stripe Customer:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {user.stripe_customer_id ? '✓ Connected' : '✗ Not Connected'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Help section for users without subscriptions */}
        {(!hasActiveSubscription) && (
          <LitPanel>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Ready to Upgrade?</h3>
            <p className="text-blue-700 mb-4">
              Unlock advanced features, higher usage limits, and priority support with a paid plan.
            </p>
            <Button 
              onClick={() => navigate(createPageUrl('Pricing'))}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              View Plans & Pricing
            </Button>
          </LitPanel>
        )}
      </div>
    </div>
  );
}

const UsageMetric = ({ label, current, max }) => {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const isUnlimited = max === Infinity;

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex justify-between items-center mb-1 text-sm">
        <span className="font-medium text-gray-600">{label}</span>
        <span className="font-semibold text-gray-800">
          {isUnlimited ? 'Unlimited' : `${current} / ${max}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full" 
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      )}
    </div>
  );
};