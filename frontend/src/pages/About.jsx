import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Users, Globe, Target, Award } from 'lucide-react';

const stats = [
  { label: 'Founded', value: '2019' },
  { label: 'Global Enterprises Served', value: '500+' },
  { label: 'Trade Connections Mapped', value: '2.4M+' },
  { label: 'Team Members', value: '75+' },
];

const teamValues = [
  {
    icon: Target,
    title: 'Mission-Driven',
    description: 'Every feature we build serves our core mission of making global trade more transparent and accessible.'
  },
  {
    icon: Users,
    title: 'Customer-Centric',
    description: 'Our customers\' success drives our innovation. We listen, learn, and iterate based on real feedback.'
  },
  {
    icon: Globe,
    title: 'Global Perspective',
    description: 'We understand the complexities of international trade and build solutions that work across all markets.'
  },
  {
    icon: Award,
    title: 'Excellence Focus',
    description: 'We hold ourselves to the highest standards in data quality, user experience, and customer support.'
  }
];

export default function About() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-50 to-white overflow-hidden py-20 lg:py-32">
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" viewBox="0 0 1200 800">
            <defs>
              <pattern id="neural-network" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                <circle cx="60" cy="60" r="3" fill="currentColor" opacity="0.4"/>
                <path d="M20,60 L100,60 M60,20 L60,100 M30,30 L90,90 M90,30 L30,90" stroke="currentColor" strokeWidth="1" opacity="0.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#neural-network)"/>
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mb-6">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
              The Neural Network of Global Commerce
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
              Illuminating the Future of 
              <span className="text-blue-600"> Global Trade Intelligence</span>
            </h1>
            
            <p className="text-xl text-gray-600 leading-relaxed mb-8">
              From overwhelming complexity to actionable intelligence. Discover how we're transforming the way businesses navigate global trade through AI-powered automation and predictive insights.
            </p>

            {/* Key Stats */}
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600 mb-2">2019</div>
                <div className="text-gray-600">Founded with Vision</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600 mb-2">500+</div>
                <div className="text-gray-600">Global Enterprises</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-purple-600 mb-2">2.4M+</div>
                <div className="text-gray-600">Trade Connections</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-base font-semibold text-blue-600 uppercase tracking-wider">Our Mission</h2>
                <h3 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight">
                  Transforming Global Trade Through Intelligence
                </h3>
                <p className="text-lg text-gray-600 leading-relaxed">
                  To illuminate the complexities of global trade, empowering businesses with the clarity and foresight to navigate, compete, and lead in the international marketplace. We believe in transforming data into a strategic asset that drives growth, efficiency, and resilience.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">Our Vision</h4>
                  <p className="text-gray-600">
                    A world where every business, regardless of size, has access to the same level of trade intelligence as the industry giants.
                  </p>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">Our Approach</h4>
                  <p className="text-gray-600">
                    We combine cutting-edge AI with deep industry expertise to turn raw trade data into actionable business intelligence.
                  </p>
                </div>
              </div>

              <Button className="bg-blue-600 hover:bg-blue-700">
                Learn More About Our Platform
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-8">
                <h4 className="text-xl font-bold text-gray-900 mb-4">From Complexity to Clarity</h4>
                <p className="text-gray-600 leading-relaxed">
                  Founded by a team of logistics veterans and data scientists, Logistic Intel was born from a shared frustration: the world of global trade was opaque, fragmented, and slow. We envisioned a future where any business could access the same level of market intelligence as the industry giants.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600 mb-1">{stat.value}</div>
                    <div className="text-sm text-gray-600">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Values */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Our Values</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              The principles that guide everything we do, from product development to customer relationships
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {teamValues.map((value, index) => (
              <div key={value.title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <value.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{value.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h2 className="text-base font-semibold text-blue-600 uppercase tracking-wider">Our Story</h2>
              <h3 className="text-3xl md:text-4xl font-bold text-gray-900">
                Built by Trade Professionals, for Trade Professionals
              </h3>
              <div className="space-y-4 text-gray-600">
                <p>
                  Our founding team spent decades in freight forwarding, customs brokerage, and supply chain management. We lived the daily frustrations of fragmented data, outdated systems, and manual processes that slowed down decision-making.
                </p>
                <p>
                  The turning point came when we realized that while the logistics industry was transforming through digitization, the intelligence layer was still missing. Companies had access to their own data, but lacked visibility into market trends, competitive movements, and emerging opportunities.
                </p>
                <p>
                  We set out to build the platform we wished we had during our years in the industry - one that combines comprehensive trade data with AI-powered insights and automated workflows.
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 text-white">
              <h4 className="text-xl font-bold mb-6">Key Milestones</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <div className="font-semibold">2019 - Founded</div>
                    <div className="text-gray-300 text-sm">Initial concept and team formation</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <div className="font-semibold">2020 - First Product Launch</div>
                    <div className="text-gray-300 text-sm">Basic search and company intelligence features</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <div className="font-semibold">2022 - AI Integration</div>
                    <div className="text-gray-300 text-sm">Advanced enrichment and predictive analytics</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <div className="font-semibold">2024 - Platform Evolution</div>
                    <div className="text-gray-300 text-sm">Comprehensive intelligence and automation suite</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 py-20 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Join Us in Transforming Global Trade
          </h2>
          <p className="text-xl mb-10 max-w-2xl mx-auto opacity-90">
            Whether you're a logistics professional, procurement expert, or business leader, we'd love to show you how our platform can transform your workflow.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8 py-4">
              Start Your Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 text-lg px-8 py-4">
              Schedule a Demo
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}