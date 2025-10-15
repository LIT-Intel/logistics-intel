import React from 'react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import { Briefcase, TrendingUp } from 'lucide-react';

export default function HomepageHero() {
  return (
    <section className="relative bg-gradient-to-br from-blue-50 via-white to-purple-50 overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'url(https://www.transparenttextures.com/patterns/az-subtle.png)'}}></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                Trusted by Fortune 500 Companies
              </span>
              <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Transform Trade Data Into <span className="text-blue-600">Competitive Advantage</span>
              </h1>
              <p className="text-xl text-gray-600 leading-relaxed">
                Advanced B2B SaaS Intelligence Platform that transforms how companies discover, analyze, and engage with global trade opportunities through AI-powered data enrichment and automation.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-6" asChild>
                <a href={createPageUrl('Search')}>Get Started Now</a>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                Talk to Sales
              </Button>
            </div>
          </div>
          <div className="space-y-4">
            <a href={createPageUrl('Solutions')} className="group block p-6 bg-white/60 backdrop-blur-sm rounded-xl border border-gray-200/80 hover:border-blue-300 hover:shadow-lg transition-all">
              <div className="flex items-center space-x-4 mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Briefcase className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-800 text-lg">For Procurement Teams</h3>
              </div>
              <p className="text-gray-600">Find and vet suppliers, diversify your supply chain, and negotiate better terms with comprehensive market data.</p>
            </a>
            <a href={createPageUrl('Solutions')} className="group block p-6 bg-white/60 backdrop-blur-sm rounded-xl border border-gray-200/80 hover:border-purple-300 hover:shadow-lg transition-all">
              <div className="flex items-center space-x-4 mb-3">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-800 text-lg">For Sales & BD Teams</h3>
              </div>
              <p className="text-gray-600">Identify high-value prospects, understand their shipping patterns, and craft targeted outreach that converts.</p>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}