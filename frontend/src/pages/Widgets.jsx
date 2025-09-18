import React from "react";

export default function Widgets() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Widgets</h1>
        <span className="px-3 py-1 bg-red-500 text-white text-sm rounded-full font-medium">HOT</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { title: 'Tariff Calculator', desc: 'Calculate duties & taxes', color: 'green' },
          { title: 'Quote Generator', desc: 'Professional freight quotes', color: 'blue' },
          { title: 'Pre-Call Briefing', desc: 'AI-powered insights for calls', color: 'purple' }
        ].map((w) => (
          <div key={w.title} className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{w.title}</h3>
            <p className="text-sm text-gray-600 mb-4">{w.desc}</p>
            <button className={`w-full bg-${w.color}-600 text-white py-2 px-4 rounded-lg hover:bg-${w.color}-700`}>Open</button>
          </div>
        ))}
      </div>
    </div>
  );
}

