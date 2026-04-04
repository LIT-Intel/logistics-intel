import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, TooltipProps,
} from 'recharts';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';

interface DataPoint {
  name: string;
  companies: number;
  campaigns: number;
}

interface PerformanceChartProps {
  data?: DataPoint[];
}

const DEFAULT_DATA: DataPoint[] = [
  { name: 'Jan', companies: 12, campaigns: 5 },
  { name: 'Feb', companies: 19, campaigns: 8 },
  { name: 'Mar', companies: 15, campaigns: 6 },
  { name: 'Apr', companies: 25, campaigns: 12 },
  { name: 'May', companies: 32, campaigns: 15 },
  { name: 'Jun', companies: 28, campaigns: 13 },
];

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.12)]">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2 w-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-500">
            {entry.dataKey === 'companies' ? 'Saved Companies' : 'Campaigns'}
          </span>
          <span className="ml-2 font-semibold text-slate-900">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function PerformanceChart({ data }: PerformanceChartProps) {
  const chartData = data || DEFAULT_DATA;
  const latest = chartData[chartData.length - 1];
  const prev = chartData[chartData.length - 2];
  const companiesDelta = prev ? latest.companies - prev.companies : 0;
  const campaignsDelta = prev ? latest.campaigns - prev.campaigns : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">Overview</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Performance Trends</h2>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">Companies</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-semibold text-slate-900">{latest.companies}</span>
                {companiesDelta !== 0 && (
                  <span className={`flex items-center text-xs font-semibold ${companiesDelta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                    {companiesDelta > 0 ? '+' : ''}{companiesDelta}
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">Campaigns</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-semibold text-slate-900">{latest.campaigns}</span>
                {campaignsDelta !== 0 && (
                  <span className={`flex items-center text-xs font-semibold ${campaignsDelta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                    {campaignsDelta > 0 ? '+' : ''}{campaignsDelta}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCompanies" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCampaigns" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
              dy={6}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="companies"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#gradCompanies)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
              animationDuration={900}
            />
            <Area
              type="monotone"
              dataKey="campaigns"
              stroke="#6366f1"
              strokeWidth={2.5}
              fill="url(#gradCampaigns)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: '#6366f1' }}
              animationDuration={900}
              animationBegin={200}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 border-t border-slate-100 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          <span className="text-xs font-medium text-slate-500">Saved Companies</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span className="text-xs font-medium text-slate-500">Campaigns</span>
        </div>
      </div>
    </motion.div>
  );
}
