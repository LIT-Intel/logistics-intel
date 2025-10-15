import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Crown, Zap, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { PLAN_LIMITS } from '@/components/utils/planLimits';

export default function UpgradePrompt({ 
  isOpen, 
  onClose, 
  feature, 
  currentPlan = 'free',
  title = "Unlock Premium Features",
  description = "Upgrade your plan to access this feature"
}) {
  if (!isOpen) return null;

  const recommendedPlans = Object.entries(PLAN_LIMITS)
    .filter(([plan]) => plan !== 'free')
    .map(([planKey, limits]) => ({ key: planKey, ...limits }));

  const getFeatureBenefits = (feature) => {
    switch (feature) {
      case 'company_details':
        return [
          'Full company profiles with enriched data',
          'Contact information and verification',
          'Trade routes and commodity analysis',
          'Export capabilities'
        ];
      case 'enrichment':
        return [
          'AI-powered company insights',
          'News and market intelligence',
          'Supplier and customer networks',
          'Real-time data updates'
        ];
      case 'campaigns':
        return [
          'Email automation sequences',
          'LinkedIn outreach campaigns',
          'Performance analytics and tracking',
          'A/B testing capabilities'
        ];
      case 'rfp_generation':
        return [
          'Professional RFP and quote builder',
          'Custom templates and branding',
          'Automated pricing calculations',
          'Client collaboration tools'
        ];
      default:
        return [
          'Access to premium features',
          'Priority customer support',
          'Advanced analytics and reporting',
          'Integration capabilities'
        ];
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <Card className="bg-white shadow-2xl">
          <CardHeader className="text-center border-b bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
              <Crown className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl md:text-3xl text-gray-900">{title}</CardTitle>
            <p className="text-gray-600 mt-2">{description}</p>
          </CardHeader>
          
          <CardContent className="p-6 md:p-8">
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">What you'll get:</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {getFeatureBenefits(feature).map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <span className="text-gray-700">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {recommendedPlans.map((plan) => (
                <Card key={plan.key} className={`border-2 transition-all hover:shadow-lg ${
                  plan.key === 'growth' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
                }`}>
                  {plan.key === 'growth' && (
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center py-2 text-sm font-semibold">
                      Most Popular
                    </div>
                  )}
                  <CardHeader className="text-center pb-4">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <div className="text-3xl font-bold text-gray-900">
                      {plan.price}
                      <span className="text-sm font-normal text-gray-500">/month</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm">
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        {plan.max_companies} companies/month
                      </li>
                      {plan.max_emails > 0 && (
                        <li className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          {plan.max_emails} emails/month
                        </li>
                      )}
                      {plan.max_rfps > 0 && (
                        <li className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          {plan.max_rfps} RFPs/month
                        </li>
                      )}
                      {plan.enrichment_enabled && (
                        <li className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          Data enrichment
                        </li>
                      )}
                      {plan.campaigns_enabled && (
                        <li className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          Campaign automation
                        </li>
                      )}
                    </ul>
                    <Button 
                      className={`w-full mt-6 ${
                        plan.key === 'growth' 
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700' 
                          : 'bg-gray-900 hover:bg-gray-800'
                      }`}
                    >
                      Upgrade to {plan.name}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" onClick={onClose} className="order-2 sm:order-1">
                Maybe Later
              </Button>
              <Button 
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 order-1 sm:order-2"
                onClick={() => {
                  window.location.href = '/pricing';
                }}
              >
                View All Plans
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}