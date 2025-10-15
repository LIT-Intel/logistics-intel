import React from 'react';
import { Button } from '@/components/ui/button';
import { Database, Zap, Users, BarChart, ShieldCheck, CheckCircle } from 'lucide-react';

const features = [
  { 
    name: 'Global Trade Database', 
    description: 'Access billions of shipment records from global customs authorities, updated daily with comprehensive coverage across 180+ countries.', 
    icon: Database 
  },
  { 
    name: 'AI Enrichment Engine', 
    description: 'Transform raw data into actionable intelligence with AI-powered contact finding, company profiling, and predictive analytics.', 
    icon: Zap 
  },
  { 
    name: 'Multi-Channel Outreach', 
    description: 'Automate your sales sequences across email and LinkedIn to engage prospects at scale with personalized messaging.', 
    icon: Users 
  },
  { 
    name: 'Predictive Analytics', 
    description: 'Identify emerging market trends, new shippers, and at-risk suppliers before your competition with ML-powered insights.', 
    icon: BarChart 
  },
  { 
    name: 'Compliance & Risk Monitoring', 
    description: 'Monitor your supply chain for compliance issues and identify potential risks with real-time data and automated alerts.', 
    icon: ShieldCheck 
  },
];

const platformModules = [
  {
    name: 'Core Intelligence Engine',
    description: 'Central processing hub for all trade data intelligence',
    features: ['Real-time Data Processing', 'ML Pattern Recognition', 'Predictive Modeling', 'Risk Assessment']
  },
  {
    name: 'Data Enrichment Module',
    description: 'Enhance raw trade data with contextual intelligence',
    features: ['Company Profiling', 'Contact Discovery', 'Industry Classification', 'Financial Insights']
  },
  {
    name: 'Search & Discovery Engine',
    description: 'Advanced search capabilities across global trade data',
    features: ['Semantic Search', 'Filter Combinations', 'Saved Searches', 'Smart Suggestions']
  },
  {
    name: 'Outreach Automation Platform',
    description: 'Multi-channel campaign management and automation',
    features: ['Email Sequences', 'LinkedIn Integration', 'Response Tracking', 'A/B Testing']
  },
  {
    name: 'Analytics & Reporting Suite',
    description: 'Comprehensive analytics and business intelligence',
    features: ['Custom Dashboards', 'Performance Metrics', 'Market Insights', 'ROI Tracking']
  }
];

export default function Platform() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 to-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mb-6">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Live Platform Demo Available
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6">
              Intelligence Engine
              <span className="text-blue-600"> Showcase</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Experience the full power of LIT's integrated platform through interactive demonstrations. See how AI-powered intelligence transforms raw trade data into competitive advantage.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-4">
                Try Interactive Demo
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-4">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                Download Technical Specs
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Architecture Overview */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Platform Architecture</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Five interconnected intelligence modules working in harmony to deliver unprecedented trade insights
            </p>
          </div>

          {/* Architecture Diagram */}
          <div className="relative mb-16">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Core Intelligence Engine */}
              <div className="lg:col-span-3 flex justify-center mb-8">
                <div className="bg-blue-600 text-white p-8 rounded-2xl shadow-xl max-w-md text-center">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Core Intelligence Engine</h3>
                  <p className="text-blue-100 text-sm">Central processing hub for all trade data intelligence</p>
                </div>
              </div>

              {/* Supporting Modules */}
              {platformModules.slice(1).map((module, index) => (
                <div key={module.name} className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{module.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">{module.description}</p>
                  <ul className="space-y-1">
                    {module.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center text-xs text-gray-500">
                        <CheckCircle className="w-3 h-3 text-green-500 mr-2 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-blue-600">Platform Features</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to win more business
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Five interconnected intelligence modules working in harmony to deliver unprecedented trade insights.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16">
              {features.map((feature) => (
                <div key={feature.name} className="relative pl-16">
                  <dt className="text-base font-semibold leading-7 text-gray-900">
                    <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                      <feature.icon className="h-6 w-6 text-white" aria-hidden="true" />
                    </div>
                    {feature.name}
                  </dt>
                  <dd className="mt-2 text-base leading-7 text-gray-600">{feature.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">See the Platform in Action</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Experience live demonstrations of our key features and see how they transform your workflow
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-gray-50 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Database className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Search & Discovery</h3>
              <p className="text-gray-600 text-sm mb-4">
                Experience our advanced search capabilities across billions of trade records
              </p>
              <Button variant="outline" size="sm" className="w-full">
                Try Search Demo
              </Button>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Enrichment</h3>
              <p className="text-gray-600 text-sm mb-4">
                See how AI transforms raw company data into actionable business intelligence
              </p>
              <Button variant="outline" size="sm" className="w-full">
                View Enrichment Demo
              </Button>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Campaign Automation</h3>
              <p className="text-gray-600 text-sm mb-4">
                Watch how automated sequences engage prospects across multiple channels
              </p>
              <Button variant="outline" size="sm" className="w-full">
                Campaign Walkthrough
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}