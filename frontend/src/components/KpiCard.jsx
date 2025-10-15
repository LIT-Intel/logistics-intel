import React from 'react';

export default function KpiCard({ title, value, trend, icon }) {
  const trendPositive = typeof trend === 'number' && trend >= 0;
  const trendClass = trendPositive ? 'text-green-600' : 'text-red-600';
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border flex items-center justify-between">
      <div>
        <h4 className="text-gray-500 text-sm">{title}</h4>
        <div className="text-gray-900 text-2xl font-semibold">{value}</div>
        {typeof trend === 'number' && (
          <div className={`text-sm ${trendClass}`}>{trendPositive ? '+' : ''}{trend}%</div>
        )}
      </div>
      {icon && <span className="text-gray-400 text-3xl">{icon}</span>}
    </div>
  );
}

