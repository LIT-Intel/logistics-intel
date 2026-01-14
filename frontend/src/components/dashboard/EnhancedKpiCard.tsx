import React from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

interface EnhancedKpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  trend?: string;
  trendUp?: boolean;
  href: string;
  sparklineData?: Array<{ value: number }>;
  subtitle?: string;
  delay?: number;
}

export default function EnhancedKpiCard({
  icon: Icon,
  label,
  value,
  trend,
  trendUp,
  href,
  sparklineData,
  subtitle,
  delay = 0,
}: EnhancedKpiCardProps) {
  const defaultSparklineData = [
    { value: 20 },
    { value: 30 },
    { value: 25 },
    { value: 40 },
    { value: 35 },
    { value: 50 },
    { value: value || 45 },
  ];

  const data = sparklineData || defaultSparklineData;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Link
        to={href}
        className="block group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200"
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform duration-200">
              <Icon className="w-6 h-6" />
            </div>
            {trend && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: delay + 0.2, type: 'spring', stiffness: 200 }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                  trendUp
                    ? 'bg-green-50 text-green-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {trendUp && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
                {trend}
              </motion.div>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.1 }}
          >
            <div className="text-3xl font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
              {value.toLocaleString()}
            </div>
            <div className="text-sm font-medium text-slate-600 mb-3">{label}</div>
            {subtitle && (
              <div className="text-xs text-slate-500">{subtitle}</div>
            )}
          </motion.div>

          {data.length > 0 && (
            <div className="mt-4 -mb-2">
              <ResponsiveContainer width="100%" height={40}>
                <LineChart data={data}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={trendUp ? '#16a34a' : '#3b82f6'}
                    strokeWidth={2}
                    dot={false}
                    animationDuration={1000}
                    animationBegin={delay * 1000}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </Link>
    </motion.div>
  );
}
