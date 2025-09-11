import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CreditCard, 
  Calendar, 
  TrendingUp, 
  Crown,
  ExternalLink,
  Download,
  AlertCircle
} from 'lucide-react';
import { getPlanLimits, PLAN_LIMITS } from '@/components/utils/planLimits';
import { format } from 'date-fns';

export default function BillingSettings({ user }) {
  const [isLoading, setIsLoading] = useState(false);
  
  const currentPlan = getPlanLimits(user?.plan || 'free');
  const usageData = {
    companies: (user?.monthly_companies_viewed || 0) / currentPlan.max_companies * 100,
    emails: currentPlan.max_emails > 0 ? (user?.monthly_emails_sent || 0) / currentPlan.max_emails * 100 : 0,
    rfps: currentPlan.max_rfps > 0 ? (user?.monthly_rfps_generated || 0) / currentPlan.max_rfps * 100 : 0,
  };

  const handleUpgrade = (planKey) => {
    // In a real app, this would integrate with Stripe or similar
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      alert(`Upgrade to ${PLAN_LIMITS[planKey].name} plan would be handled by payment processor`);
    }, 1000);
  };

  const handleDownloadInvoice = () => {
    // Mock invoice download
    alert('Invoice download would be handled here');
  };

  const getUsageColor = (percentage) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

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
              {currentPlan.name}
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
                  <span className="font-medium">{currentPlan.max_companies.toLocaleString()}</span>
                </div>
                {currentPlan.max_emails > 0 && (
                  <div className="flex justify-between">
                    <span>Emails per month:</span>
                    <span className="font-medium">{currentPlan.max_emails.toLocaleString()}</span>
                  </div>
                )}
                {currentPlan.max_rfps > 0 && (
                  <div className="flex justify-between">
                    <span>RFPs per month:</span>
                    <span className="font-medium">{currentPlan.max_rfps.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Data enrichment:</span>
                  <span className="font-medium">{currentPlan.enrichment_enabled ? '✅' : '❌'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Campaign automation:</span>
                  <span className="font-medium">{currentPlan.campaigns_enabled ? '✅' : '❌'}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-3">Billing Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Plan price:</span>
                  <span className="font-medium">{currentPlan.price}/month</span>
                </div>
                <div className="flex justify-between">
                  <span>Billing cycle:</span>
                  <span className="font-medium">Monthly</span>
                </div>
                <div className="flex justify-between">
                  <span>Next billing date:</span>
                  <span className="font-medium">{format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'MMM dd, yyyy')}</span>
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
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Companies Viewed</span>
                <span className="font-medium">
                  {user?.monthly_companies_viewed || 0} / {currentPlan.max_companies}
                </span>
              </div>
              <Progress value={usageData.companies} className="h-2">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${getUsageColor(usageData.companies)}`} 
                  style={{ width: `${Math.min(usageData.companies, 100)}%` }}
                />
              </Progress>
              {usageData.companies >= 90 && (
                <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>Approaching usage limit</span>
                </div>
              )}
            </div>

            {currentPlan.max_emails > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Emails Sent</span>
                  <span className="font-medium">
                    {user?.monthly_emails_sent || 0} / {currentPlan.max_emails}
                  </span>
                </div>
                <Progress value={usageData.emails} className="h-2">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${getUsageColor(usageData.emails)}`} 
                    style={{ width: `${Math.min(usageData.emails, 100)}%` }}
                  />
                </Progress>
              </div>
            )}

            {currentPlan.max_rfps > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>RFPs Generated</span>
                  <span className="font-medium">
                    {user?.monthly_rfps_generated || 0} / {currentPlan.max_rfps}
                  </span>
                </div>
                <Progress value={usageData.rfps} className="h-2">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${getUsageColor(usageData.rfps)}`} 
                    style={{ width: `${Math.min(usageData.rfps, 100)}%` }}
                  />
                </Progress>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Options */}
      {user?.plan !== 'growth_plus' && (
        <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-purple-600" />
              Upgrade Your Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(PLAN_LIMITS)
                .filter(([key]) => key !== 'free' && key !== user?.plan)
                .map(([planKey, planData]) => (
                  <div key={planKey} className="border rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="mb-3">
                      <h4 className="font-semibold text-lg">{planData.name}</h4>
                      <div className="text-2xl font-bold text-blue-600">{planData.price}</div>
                      <div className="text-sm text-gray-600">per month</div>
                    </div>
                    
                    <div className="space-y-1 text-sm mb-4">
                      <div>• {planData.max_companies.toLocaleString()} companies/month</div>
                      {planData.max_emails > 0 && <div>• {planData.max_emails.toLocaleString()} emails/month</div>}
                      {planData.max_rfps > 0 && <div>• {planData.max_rfps.toLocaleString()} RFPs/month</div>}
                      {planData.enrichment_enabled && <div>• Data enrichment</div>}
                      {planData.campaigns_enabled && <div>• Campaign automation</div>}
                    </div>
                    
                    <Button 
                      onClick={() => handleUpgrade(planKey)}
                      disabled={isLoading}
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      {isLoading ? 'Processing...' : `Upgrade to ${planData.name}`}
                    </Button>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing History */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Billing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Mock billing history */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium">December 2024</div>
                <div className="text-sm text-gray-600">{currentPlan.name} Plan</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">Paid</Badge>
                <span className="font-medium">{currentPlan.price}</span>
                <Button size="sm" variant="outline" onClick={handleDownloadInvoice}>
                  <Download className="w-3 h-3" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium">November 2024</div>
                <div className="text-sm text-gray-600">{currentPlan.name} Plan</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">Paid</Badge>
                <span className="font-medium">{currentPlan.price}</span>
                <Button size="sm" variant="outline" onClick={handleDownloadInvoice}>
                  <Download className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            Payment Method
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
              <ExternalLink className="w-3 h-3 mr-1" />
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