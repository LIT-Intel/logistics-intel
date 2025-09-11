import React from 'react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import { Briefcase, TrendingUp, CheckCircle, Zap, BarChart, Users } from 'lucide-react';
import { User } from '@/api/entities';

const AIFeatures = () => (
  <section className="py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          See how our AI-powered platform transforms raw trade data into actionable business intelligence
        </h2>
      </div>
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-lg flex items-center justify-center flex-shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">AI-Powered Data Enrichment</h3>
              <p className="text-gray-600">Automatically complete and verify company profiles with 98.7% accuracy using machine learning algorithms.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-green-500 text-white rounded-lg flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Multi-Channel Outreach Automation</h3>
              <p className="text-gray-600">Orchestrate personalized email sequences and LinkedIn campaigns with intelligent follow-up timing.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-yellow-500 text-white rounded-lg flex items-center justify-center flex-shrink-0">
              <BarChart className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Predictive Market Intelligence</h3>
              <p className="text-gray-600">Identify emerging opportunities and market trends before your competitors with advanced analytics.</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-2xl border border-gray-200/80">
          <div className="bg-gray-800 rounded-t-lg p-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Trade Intelligence Dashboard</span>
            <div className="flex space-x-1.5">
              <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
              <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
              <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
            </div>
          </div>
          <div className="p-6 bg-white rounded-b-lg">
            <div className="relative mb-4">
              <input type="text" placeholder="Search suppliers, products, or markets..." className="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-50"/>
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-700 text-white rounded-md flex items-center justify-center font-bold">AC</div>
                  <div>
                    <div className="font-semibold text-gray-800">Acme Corp Ltd.</div>
                    <div className="text-sm text-gray-500">Electronics Manufacturing</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-green-600">98% Match</div>
                  <div className="text-xs text-gray-400">Verified Supplier</div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 border-green-200 border rounded-lg shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-600 text-white rounded-md flex items-center justify-center font-bold">GT</div>
                  <div>
                    <div className="font-semibold text-gray-800">Global Tech Solutions</div>
                    <div className="text-sm text-gray-500">Software & IT Services</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-green-600">94% Match</div>
                  <div className="text-xs text-gray-400">New Opportunity</div>
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-6">
              <Button className="w-full bg-gray-800 hover:bg-gray-900">Export Results</Button>
              <Button variant="outline" className="w-full">Save Search</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const TradeIntelCard = () => (
  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-gray-200/60 relative">
     <div className="absolute top-4 right-4 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
        <span className="text-xs font-medium text-gray-600">Real-time data</span>
     </div>
     <h3 className="font-semibold text-gray-800 mb-4">Live Trade Intelligence</h3>
     <p className="text-sm text-gray-500 mb-6">Global Trade Flows - Last 30 Days</p>
     <div className="flex justify-between items-end h-24">
        <div className="w-1/5 h-[60%] bg-blue-900 rounded-t-md"></div>
        <div className="w-1/5 h-[80%] bg-green-500 rounded-t-md"></div>
        <div className="w-1/5 h-[50%] bg-yellow-400 rounded-t-md"></div>
        <div className="w-1/5 h-[95%] bg-blue-900 rounded-t-md"></div>
        <div className="w-1/5 h-[70%] bg-green-500 rounded-t-md"></div>
     </div>
     <div className="mt-6 pt-6 border-t border-gray-200/80 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-gray-900">2.4M+</p>
          <p className="text-xs text-gray-600">Active Suppliers</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">98.7%</p>
          <p className="text-xs text-gray-600">Data Accuracy</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">47%</p>
          <p className="text-xs text-gray-600">Avg ROI Increase</p>
        </div>
     </div>
     <div className="absolute -bottom-4 -left-4 w-12 h-12 bg-green-300/50 rounded-full"></div>
     <div className="absolute -top-6 right-16 w-16 h-16 bg-yellow-300/50 rounded-full"></div>
  </div>
);

const RoleCard = ({ icon, title, description, color }) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600'
  };
  return (
    <div className="bg-white/70 backdrop-blur-sm p-4 rounded-xl border border-gray-200/60 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        {React.createElement(icon, {className: "w-5 h-5"})}
      </div>
      <div>
        <h4 className="font-semibold text-gray-800">{title}</h4>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
};


export default function Landing() {
  return (
    <div className="bg-gray-50">
      <section className="relative bg-gradient-to-br from-blue-50/50 via-white to-purple-50/50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <span className="inline-flex items-center px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold ring-1 ring-yellow-200">
                <svg className="w-4 h-4 mr-2 text-yellow-600" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                Trusted by Fortune 500 Companies
              </span>
              <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 tracking-tighter leading-tight">
                Transform Trade Data Into <span className="text-yellow-500">Competitive Advantage</span>
              </h1>
              <p className="text-xl text-gray-600 leading-relaxed">
                Advanced B2B SaaS Intelligence Platform that transforms how companies discover, analyze, and engage with global trade opportunities through AI-powered data enrichment and automation.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <RoleCard icon={Briefcase} title="Procurement Teams" description="Supplier discovery & risk assessment" color="blue" />
                <RoleCard icon={TrendingUp} title="Sales Teams" description="Target international markets with precision" color="green" />
                <RoleCard icon={BarChart} title="Market Research" description="Analyze global trade patterns & insights" color="yellow" />
                <RoleCard icon={CheckCircle} title="Compliance Teams" description="Regulatory requirements & risk management" color="red" />
              </div>
            </div>
            <TradeIntelCard />
          </div>
        </div>
      </section>
      <AIFeatures />
    </div>
  );
}