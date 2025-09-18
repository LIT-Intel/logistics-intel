import React from 'react';
import { Calculator, FileText, Briefcase } from 'lucide-react';

export default function Widgets() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Widgets</h1>
        <span className="px-3 py-1 bg-red-500 text-white text-sm rounded-full font-medium">HOT</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <WidgetCard
          title="Tariff Calculator"
          subtitle="Calculate duties & taxes"
          description="Instantly calculate import duties, taxes, and fees with real-time tariff rates."
          Icon={Calculator}
          cta="Launch Calculator"
        />
        <WidgetCard
          title="Quote Generator"
          subtitle="Professional freight quotes"
          description="Generate branded PDF quotes with competitive rates and professional formatting."
          Icon={FileText}
          cta="Create Quote"
        />
        <WidgetCard
          title="Pre-Call Briefing"
          subtitle="AI-powered insights"
          description="Get company briefings with shipment data, KPIs, and AI-generated talking points."
          Icon={Briefcase}
          cta="Generate Briefing"
        />
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200/60 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Widget Usage This Month</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <UsageStat color="text-green-600" label="Tariff Calculations" value={0} />
          <UsageStat color="text-blue-600" label="Quotes Generated" value={0} />
          <UsageStat color="text-purple-600" label="Briefings Created" value={0} />
        </div>
      </div>
    </div>
  );
}

function WidgetCard({ title, subtitle, description, Icon, cta }) {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200/60 p-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
          <Icon className="text-gray-700" size={24} />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
      </div>
      <p className="text-gray-600 text-sm mb-4">{description}</p>
      <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm">
        {cta}
      </button>
    </div>
  );
}

function UsageStat({ label, value, color }) {
  return (
    <div className="text-center">
      <div className={`text-3xl font-bold mb-2 ${color}`}>{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

