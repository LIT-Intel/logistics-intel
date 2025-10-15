import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Calculator, TrendingUp, DollarSign, ArrowRight } from 'lucide-react';

const plans = {
  monthly: [
    {
      name: 'Starter',
      price: 79,
      description: 'Perfect for small teams getting started with trade intelligence',
      features: [
        '500 company searches/month',
        '2-month trade history access',
        'Basic analytics dashboard',
        '100 CRM contacts',
        'Email support',
        'Basic reporting'
      ],
      cta: 'Choose Starter',
      popular: false
    },
    {
      name: 'Sales Professional',
      price: 150,
      description: 'Ideal for sales professionals looking to accelerate their pipeline',
      features: [
        'Unlimited company searches',
        'Full historical data access (20+ years)',
        'Advanced ocean & air analytics',
        '1,000 CRM contacts',
        '500 enriched LinkedIn profiles',
        'Automated email campaigns',
        'Priority support',
        'Custom reporting & exports',
        'API access (5,000 calls/month)'
      ],
      cta: 'Start Free Trial',
      popular: true
    },
    {
      name: 'Professional (Team)',
      price: 299,
      description: 'Everything in Professional, designed for teams of 5',
      features: [
        'All Sales Professional features',
        'Team of 5 users included',
        'Team analytics & reporting',
        'Bulk data exports',
        'Advanced integrations',
        'Dedicated account manager',
        'Custom onboarding',
        'API access (25,000 calls/month)'
      ],
      cta: 'Contact Sales',
      popular: false
    },
  ],
  annually: [
    {
      name: 'Starter',
      price: 66,
      description: 'Perfect for small teams getting started with trade intelligence',
      features: [
        '500 company searches/month',
        '2-month trade history access',
        'Basic analytics dashboard',
        '100 CRM contacts',
        'Email support',
        'Basic reporting'
      ],
      cta: 'Choose Starter',
      popular: false
    },
    {
      name: 'Sales Professional',
      price: 125,
      description: 'Ideal for sales professionals looking to accelerate their pipeline',
      features: [
        'Unlimited company searches',
        'Full historical data access (20+ years)',
        'Advanced ocean & air analytics',
        '1,000 CRM contacts',
        '500 enriched LinkedIn profiles',
        'Automated email campaigns',
        'Priority support',
        'Custom reporting & exports',
        'API access (5,000 calls/month)'
      ],
      cta: 'Start Free Trial',
      popular: true
    },
    {
      name: 'Professional (Team)',
      price: 249,
      description: 'Everything in Professional, designed for teams of 5',
      features: [
        'All Sales Professional features',
        'Team of 5 users included',
        'Team analytics & reporting',
        'Bulk data exports',
        'Advanced integrations',
        'Dedicated account manager',
        'Custom onboarding',
        'API access (25,000 calls/month)'
      ],
      cta: 'Contact Sales',
      popular: false
    },
  ],
};

const roiMetrics = [
  { label: 'Average ROI Increase', value: '47%', icon: TrendingUp },
  { label: 'Time Savings', value: '73%', icon: Calculator },
  { label: 'Payback Period', value: '6 Months', icon: DollarSign },
];

const PricingCard = ({ plan, billingCycle }) => (
  <div className={`relative p-8 rounded-2xl border ${plan.popular ? 'border-blue-500 border-2 shadow-lg' : 'border-gray-200'} bg-white flex flex-col h-full`}>
    {plan.popular && (
      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
        <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
          Most Popular
        </span>
      </div>
    )}
    
    <div className="mb-6">
      <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
      <p className="text-gray-600 text-sm mb-4 h-10">{plan.description}</p>
      
      <div className="flex items-baseline mb-2">
        <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
        <span className="text-gray-500 ml-2">/month</span>
      </div>
      <p className="text-sm text-gray-500">
        {billingCycle === 'annually' ? 'Billed annually' : 'Billed monthly'}
        {billingCycle === 'annually' && ' (Save 20%)'}
      </p>
    </div>

    <ul className="space-y-3 mb-8 flex-grow">
      {plan.features.map((feature) => (
        <li key={feature} className="flex items-start gap-3">
          <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <span className="text-gray-700 text-sm">{feature}</span>
        </li>
      ))}
    </ul>

    <Button 
      size="lg" 
      className={`w-full ${plan.popular ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-900 hover:bg-gray-800'}`}
    >
      {plan.cta}
      {plan.cta === 'Start Free Trial' && <ArrowRight className="w-4 h-4 ml-2" />}
    </Button>
  </div>
);

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('monthly');

  return (
    <div className="bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 to-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mb-6">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/>
              </svg>
              Transparent Pricing • No Hidden Fees
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6">
              Pricing That Scales 
              <span className="text-blue-600"> With Your Success</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              Calculate your exact ROI with our transparent pricing model. See how Logistic Intel transforms your trade intelligence costs into measurable competitive advantage.
            </p>
            
            {/* Quick ROI Preview */}
            <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
              {roiMetrics.map((metric) => (
                <div key={metric.label} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3 mx-auto">
                    <metric.icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-3xl font-bold text-blue-600 mb-2">{metric.value}</div>
                  <div className="text-sm text-gray-600">{metric.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Choose Your Plan
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Start with our free trial and upgrade when you're ready. All plans include core features with no setup fees.
            </p>
            
            {/* Billing Toggle */}
            <div className="flex justify-center mb-12">
              <div className="flex rounded-lg p-1 bg-gray-200">
                <button 
                  onClick={() => setBillingCycle('monthly')} 
                  className={`px-6 py-2 text-sm font-semibold rounded-md transition-colors ${
                    billingCycle === 'monthly' 
                      ? 'bg-white text-gray-900 shadow' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Monthly
                </button>
                <button 
                  onClick={() => setBillingCycle('annually')} 
                  className={`px-6 py-2 text-sm font-semibold rounded-md transition-colors ${
                    billingCycle === 'annually' 
                      ? 'bg-white text-gray-900 shadow' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Annually (Save 20%)
                </button>
              </div>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans[billingCycle].map((plan) => (
              <PricingCard key={plan.name} plan={plan} billingCycle={billingCycle} />
            ))}
          </div>

          {/* Enterprise Section */}
          <div className="mt-16 bg-gray-900 rounded-2xl p-8 text-center text-white">
            <h3 className="text-2xl font-bold mb-4">Enterprise Solutions</h3>
            <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
              Need custom features, dedicated support, or volume pricing? We work with enterprise clients to build tailored solutions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" className="border-white text-white hover:bg-white hover:text-gray-900">
                Schedule Consultation
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700">
                Contact Enterprise Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-xl text-gray-600">Get answers to common questions about our pricing and features.</p>
          </div>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Can I change my plan at any time?</h3>
              <p className="text-gray-600">Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and billing is prorated.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">What's included in the free trial?</h3>
              <p className="text-gray-600">The free trial includes full access to our Sales Professional plan for 14 days, with no credit card required.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Do you offer volume discounts?</h3>
              <p className="text-gray-600">Yes, we offer custom pricing for larger teams and enterprise clients. Contact our sales team for details.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">What payment methods do you accept?</h3>
              <p className="text-gray-600">We accept all major credit cards, PayPal, and can arrange invoice billing for enterprise customers.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}