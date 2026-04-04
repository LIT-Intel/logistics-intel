import React from 'react';
import { motion } from 'framer-motion';
import { Building2, Mail, FileText, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface InsightsPanelProps {
  totalCompanies?: number;
  emailsSent?: number;
  rfpsGenerated?: number;
}

const STATS = [
  {
    label: 'Companies Tracked',
    key: 'totalCompanies' as const,
    icon: Building2,
    href: '/app/command-center',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    desc: 'in Command Center',
  },
  {
    label: 'Emails Sent',
    key: 'emailsSent' as const,
    icon: Mail,
    href: '/app/campaigns',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    desc: 'across all campaigns',
  },
  {
    label: 'RFPs Generated',
    key: 'rfpsGenerated' as const,
    icon: FileText,
    href: '/app/rfp-studio',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    desc: 'ready to send',
  },
];

export default function InsightsPanel({
  totalCompanies = 0,
  emailsSent = 0,
  rfpsGenerated = 0,
}: InsightsPanelProps) {
  const values = { totalCompanies, emailsSent, rfpsGenerated };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-slate-100">
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">Summary</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Activity Snapshot</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          const value = values[stat.key];
          return (
            <Link
              key={stat.key}
              to={stat.href}
              className="group flex flex-col gap-3 p-5 hover:bg-slate-50/60 transition-colors"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.bg}`}>
                <Icon className={`h-4.5 w-4.5 ${stat.color}`} size={18} />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{value.toLocaleString()}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">{stat.label}</p>
                <p className="text-[11px] text-slate-400">{stat.desc}</p>
              </div>
              <div className="mt-auto flex items-center gap-1 text-xs font-semibold text-slate-400 group-hover:text-slate-700 transition-colors">
                View <ArrowUpRight className="h-3 w-3" />
              </div>
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}
