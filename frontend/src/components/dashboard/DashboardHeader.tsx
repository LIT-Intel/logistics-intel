import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Search, Command } from 'lucide-react';

interface DashboardHeaderProps {
  userName?: string;
}

export default function DashboardHeader({ userName = 'User' }: DashboardHeaderProps) {
  const currentHour = new Date().getHours();
  const getGreeting = () => {
    if (currentHour < 12) return 'Good morning';
    if (currentHour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = userName?.split(' ')[0] || userName || 'there';
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-8"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            {getGreeting()}, {firstName}
            <motion.span
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
              transition={{
                duration: 0.6,
                delay: 0.3,
                ease: 'easeInOut',
              }}
            >
              <Sparkles className="w-7 h-7 text-amber-500" />
            </motion.span>
          </h1>
          <p className="text-slate-600">{currentDate}</p>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all group">
            <Search className="w-4 h-4 text-slate-600 group-hover:text-blue-600 transition-colors" />
            <span className="text-sm font-medium text-slate-700">Quick Search</span>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
              <Command className="w-3 h-3 text-slate-500" />
              <span className="text-xs text-slate-500">K</span>
            </div>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
